import { StorageAdapter } from './StorageAdapter.js';
import { reloadKeepingLogin } from '../AuthClient.js';

const say = (text, kind) => { try { window.dispatchEvent(new CustomEvent('dm-sync', { detail: { text, kind } })); } catch {} };

/**
 * Backend per l'uso online: ogni get/set/remove passa da un'API HTTP,
 * autenticata con il token dell'utente corrente. Il server isola i dati per
 * utente, quindi ogni amico vede solo i propri dati.
 *
 * Uso OFFLINE: ogni dato letto o scritto viene copiato nella "cassaforte" cifrata del telefono (vedi Vault.js).
 * Se il server e' spento le letture arrivano da quella copia e le modifiche restano "in attesa" (cifrate);
 * appena il server torna acceso partono da sole (ogni 15 secondi, e al ritorno della connessione).
 * In caso di modifica dello stesso dato da due dispositivi, vince l'ultima che arriva al server.
 */
export class RemoteStorageAdapter extends StorageAdapter {
  constructor(authClient, baseUrl = '') {
    super();
    this.auth = authClient;
    this.baseUrl = baseUrl;
    this._timer = null;
    window.addEventListener('online', () => this.tick());
    setInterval(() => { if (this.auth.offline) this.tick(); }, 15000);
    this.#migrateLegacy();
    if (this.auth.offline) say('📴 offline: le modifiche restano sul telefono', 'warn');
    setTimeout(() => this.flush(), 1500);
  }

  get vault() { return this.auth.vault; }

  #headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` };
  }

  /** Vecchio sistema (modifiche in attesa in chiaro nel browser): le sposto nella cassaforte cifrata. */
  #migrateLegacy() {
    if (!this.vault) return;
    try {
      const pre = `dm_pending:${this.auth.user?.id || this.auth.user?.username || 'u'}:`, rm = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k.startsWith(pre)) continue;
        const key = k.slice(pre.length), p = JSON.parse(localStorage.getItem(k));
        if (p && !this.vault.getPending(key)) { this.vault.setPending(key, p); if (p.op === 'set') this.vault.putCache(key, p.value); }
        rm.push(k);
      }
      rm.forEach(k => localStorage.removeItem(k));
    } catch { /* niente */ }
  }

  /** Server tornato acceso mentre eravamo in modalita' offline: rientro, invio modifiche e ricarico i dati freschi. */
  async tick() {
    if (this.auth.offline) {
      if (!(await this.auth.tryReconnect())) return;
      say('☁ server di nuovo online, sincronizzo…', 'ok');
      await this.flush();
      if (!this.vault?.pendingKeys().length) return reloadKeepingLogin();
      return;
    }
    this.flush();
  }

  async get(key) {
    const pend = this.vault?.getPending(key);
    if (pend) { this.flush(); return pend.op === 'set' ? pend.value : null; }
    if (!this.auth.offline) {
      try {
        const res = await fetch(`${this.baseUrl}/api/kv/${encodeURIComponent(key)}`, { headers: this.#headers() });
        if (res.ok) { const v = (await res.json()).value; this.vault?.putCache(key, v); return v; }
        if (res.status < 500) return null;
      } catch (e) { console.error('RemoteStorageAdapter.get fallito per', key, e); }
    }
    const c = this.vault?.getCache(key);   // server spento: ultima copia salvata sul telefono
    return c === undefined ? null : c;
  }

  async #send(key, p) {
    const url = `${this.baseUrl}/api/kv/${encodeURIComponent(key)}`;
    const res = p.op === 'set'
      ? await fetch(url, { method: 'PUT', headers: this.#headers(), body: JSON.stringify({ value: p.value }) })
      : await fetch(url, { method: 'DELETE', headers: this.#headers() });
    return res.ok;
  }

  async #write(key, p) {
    if (p.op === 'set') this.vault?.putCache(key, p.value); else this.vault?.dropCache(key);
    await this.vault?.setPending(key, p);
    let ok = false;
    if (!this.auth.offline) { try { ok = await this.#send(key, p); } catch (e) { console.error('Salvataggio online fallito per', key, e); } }
    if (ok) {
      await this.vault?.clearPending(key, p.t);
      if (!this.vault?.pendingKeys().length) say('☁ salvato online', 'ok');
    } else {
      say(this.auth.offline ? '📴 offline: salvato sul telefono' : '⚠ non salvato online, riprovo…', 'warn');
      this.#schedule();
    }
    return ok;
  }

  #schedule() { if (!this._timer) this._timer = setInterval(() => this.flush(), 15000); }

  async flush() {
    const v = this.vault; if (!v) return;
    const keys = v.pendingKeys();
    if (!keys.length) { clearInterval(this._timer); this._timer = null; return; }
    if (!this.auth.token || this.auth.offline) return;
    for (const key of keys) {
      const p = v.getPending(key); if (!p) continue;
      try { if (await this.#send(key, p)) await v.clearPending(key, p.t); } catch { /* resta in attesa */ }
    }
    if (v.pendingKeys().length) { say('⚠ non salvato online, riprovo…', 'warn'); this.#schedule(); }
    else { say('☁ salvato online', 'ok'); clearInterval(this._timer); this._timer = null; }
  }

  set(key, value) { return this.#write(key, { op: 'set', value, t: Date.now() + Math.random() }); }
  async remove(key) { await this.#write(key, { op: 'remove', t: Date.now() + Math.random() }); }
}
