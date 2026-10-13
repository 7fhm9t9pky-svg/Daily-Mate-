import crypto from 'crypto';

/**
 * Notifiche push standard (Web Push, RFC 8030/8291/8292) scritte con il solo modulo
 * crypto di Node: nessuna dipendenza da installare. Funziona con Chrome, Edge, Firefox,
 * Safari (iOS 16.4+ se l'app e' aggiunta alla Home) e Android.
 */
const b64u = b => Buffer.from(b).toString('base64url');
const unb = s => Buffer.from(s, 'base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

/**
 * Cifra `payload` (Buffer) per un'iscrizione push (RFC 8291, aes128gcm).
 * `opts.asKey` e `opts.salt` servono solo per i test con i valori dell'RFC.
 */
export function encryptPayload(payload, uaPublicB64, authB64, opts = {}) {
  const uaPublic = unb(uaPublicB64), auth = unb(authB64);
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(unb(opts.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? unb(opts.salt) : crypto.randomBytes(16);
  const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Genera una coppia di chiavi VAPID (identificano questo server verso i servizi push). */
export function generateVapid() {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}

export function vapidJwt(vapid, audience, subject = 'mailto:daily-mate@localhost', now = Date.now()) {
  const pub = unb(vapid.publicKey);
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: vapid.privateKey }, format: 'jwk' });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64u(sig)}`;
}

/** Invia un messaggio a una iscrizione. Restituisce lo stato HTTP (404/410 = iscrizione scaduta). */
export async function sendPush(sub, message, vapid, fetchImpl = fetch) {
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), sub.keys.p256dh, sub.keys.auth);
  const aud = new URL(sub.endpoint).origin;
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${vapidJwt(vapid, aud)}, k=${vapid.publicKey}`
    },
    body
  });
  return res.status;
}
