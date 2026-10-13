const TOKEN_KEY = 'dailymate_auth_token';

/** Parla con /api/auth del server: signup, login, sessione corrente, logout. */
export class AuthClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem(TOKEN_KEY);
    this.user = null;
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
    localStorage.removeItem(TOKEN_KEY);
  }

  #setSession(data) {
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem(TOKEN_KEY, data.token);
  }
}
