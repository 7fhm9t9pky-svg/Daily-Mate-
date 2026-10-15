import { reloadKeepingLogin } from './AuthClient.js';
/**
 * Ogni minuto chiede al server il numero di versione. Se cambia (cioe' e' arrivato un
 * aggiornamento) mostra una barra "Nuova versione disponibile" con il pulsante Aggiorna.
 */
export class UpdateWatcher {
  constructor(everyMs = 60000) { this.every = everyMs; this.current = null; this.shown = false; }

  start() {
    this.check();
    setInterval(() => this.check(), this.every);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  }

  async check() {
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()).version;
      if (this.current === null) { this.current = v; return; }
      if (v !== this.current && !this.shown) this.banner();
    } catch { /* server non raggiungibile: ci riprova al prossimo giro */ }
  }

  banner() {
    this.shown = true;
    const el = document.createElement('div');
    el.className = 'update-bar';
    el.innerHTML = '<span>Nuova versione disponibile</span><button class="btn primary">Aggiorna</button>';
    el.querySelector('button').onclick = () => reloadKeepingLogin();
    document.body.appendChild(el);
  }
}
