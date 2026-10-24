/**
 * "Cassaforte" per l'uso offline: una copia dei dati dell'utente salvata sul telefono, CIFRATA con la sua password
 * (PBKDF2 + AES-GCM, tutto con le funzioni del browser). Contiene:
 *  - cache: l'ultima copia dei dati letti dal server (per poterli leggere anche a server spento)
 *  - pending: le modifiche fatte e non ancora inviate al server (partono da sole quando torna online)
 * Senza la password non si legge nulla. La chiave resta solo in memoria (e nella sessione della pagina per i ricaricamenti).
 */
const DB = 'dm_offline', STORE = 'kv', ITER = 150000;
const te = new TextEncoder(), td = new TextDecoder();

const b64 = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

async function deriveKey(password, salt) {
  const km = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export class Vault {
  constructor(userId, key, salt, data) {
    this.userId = userId; this.key = key; this.salt = salt;
    this.data = data;               // { user, cache:{}, pending:{} }
    this._t = null;
  }

  static available() { return !!(globalThis.indexedDB && globalThis.crypto?.subtle); }

  /** Apre (o crea) la cassaforte dopo un accesso riuscito online. Se la password e' cambiata, riparte da zero. */
  static async open(user, password) {
    const rec = await idbGet('v:' + user.id).catch(() => null);
    if (rec) {
      try { return await Vault.#unlock(user.id, password, rec); } catch { /* password cambiata: si riparte */ }
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const v = new Vault(user.id, await deriveKey(password, salt), salt, { user, cache: {}, pending: {} });
    await v.persist();
    await idbSet('u:' + String(user.username).toLowerCase(), user.id);
    return v;
  }

  /** Accesso a server spento: serve una cassaforte gia' creata da un accesso online sullo stesso telefono. */
  static async openOffline(username, password) {
    const uid = await idbGet('u:' + String(username).toLowerCase()).catch(() => null);
    const rec = uid && await idbGet('v:' + uid).catch(() => null);
    if (!rec) throw new Error('Il server non è raggiungibile e su questo telefono non ci sono ancora dati salvati. Accedi una volta a server acceso.');
    try { return await Vault.#unlock(uid, password, rec); } catch { throw new Error('Password non corretta.'); }
  }

  static async #unlock(userId, password, rec) {
    const salt = rec.salt, key = await deriveKey(password, salt);
    return new Vault(userId, key, salt, await Vault.#decrypt(key, rec));
  }

  /** Dopo un ricaricamento deciso dall'app: riprende la cassaforte con la chiave tenuta nella sessione della pagina. */
  static async fromKey(userId, keyB64) {
    const rec = await idbGet('v:' + userId); if (!rec) return null;
    const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', true, ['encrypt', 'decrypt']);
    return new Vault(userId, key, rec.salt, await Vault.#decrypt(key, rec));
  }

  static async #decrypt(key, rec) {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.ct);
    const d = JSON.parse(td.decode(buf));
    d.cache ||= {}; d.pending ||= {};
    return d;
  }

  async exportKey() { return b64(new Uint8Array(await crypto.subtle.exportKey('raw', this.key))); }

  async persist() {
    clearTimeout(this._t); this._t = null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, te.encode(JSON.stringify(this.data)));
    await idbSet('v:' + this.userId, { salt: this.salt, iv, ct });
  }
  #later() { if (!this._t) this._t = setTimeout(() => this.persist().catch(() => {}), 500); }

  // --- copia dei dati letti
  getCache(k) { return k in this.data.cache ? this.data.cache[k] : undefined; }
  putCache(k, v) { this.data.cache[k] = v; this.#later(); }
  dropCache(k) { delete this.data.cache[k]; this.#later(); }
  /** Sostituisce la copia con quella appena scaricata, tenendo le chiavi con modifiche ancora da inviare. */
  replaceCache(all) {
    const keep = {}; for (const k of Object.keys(this.data.pending)) if (k in this.data.cache) keep[k] = this.data.cache[k];
    this.data.cache = { ...Object.fromEntries(Object.entries(this.data.cache).filter(([k]) => k.startsWith('__api:'))), ...all, ...keep };
    this.#later();
  }

  // --- modifiche in attesa
  getPending(k) { return this.data.pending[k] || null; }
  pendingKeys() { return Object.keys(this.data.pending); }
  async setPending(k, p) { this.data.pending[k] = p; await this.persist().catch(() => {}); }
  async clearPending(k, t) { const c = this.data.pending[k]; if (c && c.t === t) { delete this.data.pending[k]; await this.persist().catch(() => {}); } }
}
