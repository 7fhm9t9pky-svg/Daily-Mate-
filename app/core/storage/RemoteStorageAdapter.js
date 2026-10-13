import { StorageAdapter } from './StorageAdapter.js';

const say = (text, kind) => { try { window.dispatchEvent(new CustomEvent('dm-sync', { detail: { text, kind } })); } catch {} };

/**
 * Backend per l'uso online: ogni get/set/remove passa da un'API HTTP,
 * autenticata con il token dell'utente corrente. Il server isola i dati per
 * utente, quindi ogni amico vede solo i propri dati.
 *
 * Salvataggio a prova di errore: prima di inviare un dato al server ne tiene una
 * copia nel browser ("in attesa"). Se il server e' spento o la rete cade, il dato non
 * si perde: resta in attesa e viene reinviato da solo ogni 15 secondi, al ritorno
 * della connessione e all'apertura successiva dell'app.
 */
export class RemoteStorageAdapter extends StorageAdapter {
  constructor(authClient, baseUrl = '') {
    super();
    this.auth = authClient;
    this.baseUrl = baseUrl;
    this._timer = null;
    window.addEventListener('online', () => this.flush());
    setTimeout(() => this.flush(), 1500);
  }

  #headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` };
  }

  #pk(key) { return `dm_pending:${this.auth.user?.id || this.auth.user?.username || 'u'}:${key}`; }
  #pendingKeys() {
    const pre = this.#pk(''), out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(pre)) out.push(k); } } catch {}
    return out;
  }
  #readPending(key) { try { const r = localStorage.getItem(this.#pk(key)); return r ? JSON.parse(r) : null; } catch { return null; } }

  async get(key) {
    const pend = this.#readPending(key);
    if (pend) { this.flush(); return pend.op === 'set' ? pend.value : null; }
    try {
      const res = await fetch(`${this.baseUrl}/api/kv/${encodeURIComponent(key)}`, { headers: this.#headers() });
      if (!res.ok) return null;
      return (await res.json()).value;
    } catch (e) {
      console.error('RemoteStorageAdapter.get fallito per', key, e);
      return null;
    }
  }

  async #send(key, p) {
    const url = `${this.baseUrl}/api/kv/${encodeURIComponent(key)}`;
    const res = p.op === 'set'
      ? await fetch(url, { method: 'PUT', headers: this.#headers(), body: JSON.stringify({ value: p.value }) })
      : await fetch(url, { method: 'DELETE', headers: this.#headers() });
    return res.ok;
  }

  async #write(key, p) {
    try { localStorage.setItem(this.#pk(key), JSON.stringify(p)); } catch {}
    let ok = false;
    try { ok = await this.#send(key, p); } catch (e) { console.error('Salvataggio online fallito per', key, e); }
    if (ok) {
      // cancella l'"attesa" solo se nel frattempo non e' arrivata una versione piu' nuova
      try { const cur = this.#readPending(key); if (cur && cur.t === p.t) localStorage.removeItem(this.#pk(key)); } catch {}
      if (!this.#pendingKeys().length) say('☁ salvato online', 'ok');
    } else {
      say('⚠ non salvato online, riprovo…', 'warn');
      this.#schedule();
    }
    return ok;
  }

  #schedule() { if (!this._timer) this._timer = setInterval(() => this.flush(), 15000); }

  async flush() {
    const keys = this.#pendingKeys();
    if (!keys.length) { clearInterval(this._timer); this._timer = null; return; }
    if (!this.auth.token) return;
    const pre = this.#pk('');
    for (const k of keys) {
      const key = k.slice(pre.length); const p = this.#readPending(key); if (!p) continue;
      try {
        if (await this.#send(key, p)) { const cur = this.#readPending(key); if (cur && cur.t === p.t) localStorage.removeItem(k); }
      } catch { /* resta in attesa */ }
    }
    if (this.#pendingKeys().length) { say('⚠ non salvato online, riprovo…', 'warn'); this.#schedule(); }
    else { say('☁ salvato online', 'ok'); clearInterval(this._timer); this._timer = null; }
  }

  set(key, value) { return this.#write(key, { op: 'set', value, t: Date.now() + Math.random() }); }
  async remove(key) { await this.#write(key, { op: 'remove', t: Date.now() + Math.random() }); }
}
