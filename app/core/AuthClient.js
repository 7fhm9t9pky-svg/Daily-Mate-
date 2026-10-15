const TOKEN_KEY = 'dailymate_auth_token';      // vecchio posto del token: non si usa piu', lo cancello
const HAND_KEY = 'dm_reload_handoff';          // passaggio una tantum per i ricaricamenti decisi dall'app

let current = null;

/**
 * Ricarica la pagina SENZA chiedere di nuovo la password: solo per i ricaricamenti decisi dall'app
 * (aggiornamento, cambio di ruolo...). Se invece l'utente apre il link o preme "aggiorna" la password si richiede.
 */
export function reloadKeepingLogin() {
  try { if (current?.token) sessionStorage.setItem(HAND_KEY, current.token); } catch { /* si rifara' il login */ }
  location.reload();
}

/** Parla con /api/auth del server: signup, login, sessione corrente, logout. */
export class AuthClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    // Per sicurezza la sessione vive solo nella pagina aperta: se apri il link, aggiorni o chiudi e riapri, si rifa' l'accesso.
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* niente */ }
    this.token = null;
    try { this.token = sessionStorage.getItem(HAND_KEY); sessionStorage.removeItem(HAND_KEY); } catch { /* niente */ }
    this.user = null;
    current = this;
  }

  isAuthenticated() { return !!this.token; }

  async #request(path, options = {}) {
    const res = await fetch(this.baseUrl + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Richiesta fallita');
    return data;
  }

  /** Chiamata autenticata generica (usata dai Gruppi). */
  api(path, options = {}) { return this.#request(path, options); }

  async signup(username, password, displayName) {
    const data = await this.#request('/api/auth/signup', {
      method: 'POST', body: JSON.stringify({ username, password, displayName })
    });
    this.#setSession(data);
    return data.user;
  }

  async login(username, password) {
    const data = await this.#request('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
    this.#setSession(data);
    return data.user;
  }

  async fetchMe() {
    if (!this.token) return null;
    try {
      const data = await this.#request('/api/auth/me');
      this.user = data.user;
      return data.user;
    } catch {
      this.logout();
      return null;
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    try { sessionStorage.removeItem(HAND_KEY); } catch { /* niente */ }
  }

  #setSession(data) {
    this.token = data.token;
    this.user = data.user;
  }
}
