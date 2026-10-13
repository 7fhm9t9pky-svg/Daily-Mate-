import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiami';
const DEFAULT_TTL = 60 * 60 * 24 * 30; // 30 giorni

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Token firmato minimale (stile JWT), senza dipendenze esterne. */
export function signToken(payload, expiresInSec = DEFAULT_TTL) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
