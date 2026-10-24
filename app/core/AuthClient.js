import { Vault } from './Vault.js';
const TOKEN_KEY = 'dailymate_auth_token';      // vecchio posto del token: non si usa piu', lo cancello
const HAND_KEY = 'dm_reload_handoff';          // passaggio una tantum per i ricaricamenti decisi dall'app

let current = null;

const netErr = () => Object.assign(new Error('Server non raggiungibile'), { network: true });

/**
 * Ricarica la pagina SENZA chiedere di nuovo la password: solo per i ricaricamenti decisi dall'app
 * (aggiornamento, cambio di ruolo, ritorno online...). Se invece l'utente apre il link o preme "aggiorna" la password si richiede.
 */
export async function reloadKeepingLogin() {
  try {
    if (current?.token) {
      sessionStorage.setItem(HAND_KEY, JSON.stringify({ token: current.token, offline: current.offline, uid: current.user?.id, user: current.offline ? current.user : null, vk: current.vault ? await current.vault.exportKey() : null }));
    }
  } catch { /* si rifara' il login */ }
  location.reload();
}

/** Parla con /api/auth del server: signup, login, sessione corrente, logout. Se il server e' spento, accesso offline dalla cassaforte cifrata. */
export class AuthClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    // Per sicurezza la sessione vive solo nella pagina aperta: se apri il link, aggiorni o chiudi e riapri, si rifa' l'accesso.
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* niente */ }
    this.token = null; this.hand = null; this.vault = null; this.offline = false; this.password = null;
    try {
      const raw = sessionStorage.getItem(HAND_KEY); sessionStorage.removeItem(HAND_KEY);
      if (raw) { this.hand = raw.startsWith('{') ? JSON.parse(raw) : { token: raw }; this.token = this.hand.token; this.offline = !!this.hand.offline; }
    } catch { /* niente */ }
    this.user = null;
    current = this;
  }

  isAuthenticated() { return !!this.token; }

  async #request(path, options = {}, force = false) {
    if (this.offline && !force) throw netErr();
    let res;
    try {
      res = await fetch(this.baseUrl + path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(options.headers || {})
        }
      });
    } catch { throw netErr(); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 502 || res.status === 503 || res.status === 504) throw netErr();
      throw Object.assign(new Error(data.error || 'Richiesta fallita'), { status: res.status });
    }
    return data;
  }

  /** Chiamata autenticata generica (usata dai Gruppi). */
  api(path, options = {}) { return this.#request(path, options); }

  /** Come api(), ma se il server e' spento restituisce l'ultima copia salvata (cifrata) sul telefono. */
  async cachedJson(path) {
    const ck = '__api:' + path;
    try {
      const d = await this.#request(path);
      this.vault?.putCache(ck, d);
      return d;
    } catch (e) {
      const c = e.network && this.vault ? this.vault.getCache(ck) : undefined;
      if (c !== undefined) return c;
      throw e;
    }
  }

  async #openVault(user, password) {
    this.vault = null;
    if (!Vault.available()) return;
    try {
      this.vault = await Vault.open(user, password);
      try { const all = await this.#request('/api/kv'); if (all?.data) this.vault.replaceCache(all.data); } catch { /* resta la copia precedente */ }
      await this.vault.persist();
    } catch (e) { console.warn('Cassaforte offline non disponibile', e); this.vault = null; }
  }

  async #enter(path, body, username, password) {
    let data;
    try { data = await this.#request(path, { method: 'POST', body: JSON.stringify(body) }, true); }
    catch (e) {
      if (!e.network || path.endsWith('signup')) throw e.network ? new Error('Il server non è raggiungibile: la registrazione richiede il server acceso.') : e;
      // server spento: provo con la copia cifrata sul telefono
      if (!Vault.available()) throw new Error('Il server non è raggiungibile.');
      this.vault = await Vault.openOffline(username, password);
      this.user = this.vault.data.user; this.token = 'offline'; this.offline = true; this.password = password;
      return this.user;
    }
    this.#setSession(data);
    this.offline = false; this.password = password;
    await this.#openVault(data.user, password);
    return data.user;
  }

  signup(username, password, displayName) { return this.#enter('/api/auth/signup', { username, password, displayName }, username, password); }
  login(username, password) { return this.#enter('/api/auth/login', { username, password }, username, password); }

  /** Con la sessione offline: prova a rientrare sul server (se e' tornato acceso). true = di nuovo online. */
  async tryReconnect() {
    if (!this.offline || !this.password || !this.user) return false;
    try {
      const data = await this.#request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: this.user.username, password: this.password }) }, true);
      this.#setSession(data); this.offline = false;
      return true;
    } catch { return false; }
  }

  async fetchMe() {
    if (!this.token) return null;
    if (this.offline) {   // ricaricamento di una sessione offline
      try { this.vault = await Vault.fromKey(this.hand.uid, this.hand.vk); this.user = this.hand.user || this.vault?.data.user; } catch { /* sotto */ }
      if (this.vault && this.user) return this.user;
      this.logout(); return null;
    }
    try {
      const data = await this.#request('/api/auth/me');
      this.user = data.user;
      if (this.hand?.vk && Vault.available()) { try { this.vault = await Vault.fromKey(this.user.id, this.hand.vk); } catch { this.vault = null; } }
      return data.user;
    } catch (e) {
      if (e.network && this.hand?.vk) {   // il server si e' spento proprio durante il ricaricamento
        try { this.vault = await Vault.fromKey(this.hand.uid, this.hand.vk); this.user = this.vault.data.user; this.offline = true; this.token = 'offline'; return this.user; } catch { /* sotto */ }
      }
      this.logout();
      return null;
    }
  }

  logout() {
    this.token = null;
    this.user = null; this.vault = null; this.offline = false; this.password = null;
    try { sessionStorage.removeItem(HAND_KEY); } catch { /* niente */ }
  }

  #setSession(data) {
    this.token = data.token;
    this.user = data.user;
  }
}
