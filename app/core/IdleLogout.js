const KEY = 'dm_last_active';

/**
 * Disconnessione automatica: dopo `ms` senza che l'utente tocchi, scriva o scorra, si esce.
 * Un avviso compare negli ultimi 20 secondi ("tocca per restare"). Vale per ogni utente.
 */
export class IdleLogout {
  constructor(app, ms = 3 * 60 * 1000) { this.app = app; this.ms = ms; this.warned = false; this.last = Date.now(); }

  start() {
    const touch = () => {
      const n = Date.now(); if (n - this.last < 1000) return;   // al massimo una scrittura al secondo
      this.last = n; try { localStorage.setItem(KEY, String(n)); } catch {}
      if (this.warned) this.hideWarn();
    };
    ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(ev => window.addEventListener(ev, touch, { passive: true, capture: true }));
    try { localStorage.setItem(KEY, String(Date.now())); } catch {}
    this.timer = setInterval(() => this.tick(), 2000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
  }

  idle() {
    let shared = 0; try { shared = Number(localStorage.getItem(KEY)) || 0; } catch {}   // altre schede aperte contano come attività
    return Date.now() - Math.max(this.last, shared);
  }

  tick() {
    const left = this.ms - this.idle();
    if (left <= 0) return this.logout();
    if (left <= 20000) this.showWarn(Math.ceil(left / 1000)); else if (this.warned) this.hideWarn();
  }

  showWarn(sec) {
    if (!this.bar) {
      this.bar = document.createElement('div'); this.bar.className = 'update-bar idle-bar';
      this.bar.innerHTML = '<span></span><button class="btn primary">Resto qui</button>';
      this.bar.querySelector('button').onclick = () => { this.last = Date.now(); try { localStorage.setItem(KEY, String(this.last)); } catch {} this.hideWarn(); };
      document.body.appendChild(this.bar);
    }
    this.warned = true; this.bar.hidden = false;
    this.bar.querySelector('span').textContent = `Per sicurezza ti disconnetto tra ${sec} secondi`;
  }

  hideWarn() { this.warned = false; if (this.bar) this.bar.hidden = true; }

  async logout() {
    clearInterval(this.timer);
    try { await Promise.race([this.app.storage.flush?.(), new Promise(r => setTimeout(r, 2000))]); } catch {}   // salva eventuali modifiche in coda
    this.app.auth.logout();
    location.reload();
  }
}
