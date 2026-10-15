import { reloadKeepingLogin } from './AuthClient.js';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ago = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'adesso'; if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h fa`;
  return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};

/**
 * Notifiche: campanella con le novita' (messaggi dell'amministratore, promemoria di avvisi ed
 * eventi), controllo ogni 30 secondi, e notifiche sul dispositivo (anche ad app chiusa, tramite
 * il service worker). Sincronizza anche l'interfaccia decisa dall'amministratore.
 */
export class Notifier {
  constructor(app) {
    this.app = app; this.items = []; this.unread = 0; this.devices = 0; this.seen = null;
    this.bell = document.getElementById('bell'); this.badge = document.getElementById('bell-n');
  }

  get token() { return this.app.auth?.token; }
  headers() { return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }; }

  start() {
    this.bell.onclick = () => this.openPanel();
    this.poll();
    setInterval(() => this.poll(), 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
    this.ensurePush();   // se il permesso c'e' gia', rinnova in silenzio l'iscrizione di questo dispositivo
  }

  async poll() {
    try {
      const r = await fetch('/api/notifications', { headers: this.headers(), cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d.role && this.app.auth.user?.role && d.role !== this.app.auth.user.role) { reloadKeepingLogin(); return; }   // l'amministratore ha cambiato i permessi
      this.items = d.items; this.unread = d.unread; this.devices = d.devices || 0;
      this.draw();
      // nuove notifiche arrivate dall'ultimo controllo -> notifica del sistema (se il push del dispositivo non e' attivo)
      if (this.seen !== null && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden && this.devices === 0) {
        d.items.filter(i => !i.read && i.ts > this.seen).slice(0, 3).forEach(i => { try { new Notification(i.title, { body: i.body, icon: '/icons/icon-192.png' }); } catch {} });
      }
      this.seen = Math.max(this.seen ?? 0, ...d.items.map(i => i.ts), 0) || Date.now();
      // l'amministratore ha cambiato l'interfaccia di questo utente
      if (JSON.stringify(d.ui || {}) !== JSON.stringify(this.app.ui || {})) await this.app.applyUi(d.ui || {});
      if (this.panel) this.drawPanel();
    } catch { /* server non raggiungibile: riprova al prossimo giro */ }
  }

  draw() {
    this.badge.hidden = !this.unread;
    this.badge.textContent = this.unread > 9 ? '9+' : this.unread;
  }

  // ---------------------------------------------------------------- pannello
  openPanel() {
    if (this.panel) return this.closePanel();
    this.panel = document.createElement('div');
    this.panel.className = 'np-overlay';
    this.panel.innerHTML = '<div class="np"><div class="np-head"><b>Notifiche</b><span><button class="btn" data-a="all">Segna lette</button><button class="np-x" data-a="close" aria-label="Chiudi">✕</button></span></div><div class="np-dev"></div><div class="np-list"></div></div>';
    this.panel.addEventListener('click', e => {
      if (e.target === this.panel || e.target.closest('[data-a="close"]')) return this.closePanel();
      if (e.target.closest('[data-a="all"]')) { this.read('all'); return; }
      if (e.target.closest('[data-a="enable"]')) { this.enablePush().then(() => this.drawPanel()); return; }
      const it = e.target.closest('[data-id]');
      if (it) { this.read([it.dataset.id]); const pg = it.dataset.page; this.closePanel(); if (pg) this.app.router.goTo(pg); }
    });
    document.body.appendChild(this.panel);
    this.drawPanel();
  }

  closePanel() { this.panel?.remove(); this.panel = null; }

  async drawPanel() {
    if (!this.panel) return;
    const st = await this.pushState();
    this.panel.querySelector('.np-dev').innerHTML = st === 'off'
      ? '<button class="btn primary" data-a="enable">Attiva le notifiche su questo dispositivo</button>'
      : st === 'denied' ? '<small>Le notifiche sono bloccate nelle impostazioni del browser.</small>'
      : st === 'unsupported' ? '<small>Questo browser non supporta le notifiche (su iPhone: aggiungi l\'app alla Home da Condividi).</small>' : '';
    this.panel.querySelector('.np-list').innerHTML = this.items.length
      ? this.items.map(i => `<button class="np-item${i.read ? '' : ' new'}" data-id="${i.id}" data-page="${esc(i.page)}"><b>${esc(i.title)}</b>${i.body ? `<span>${esc(i.body)}</span>` : ''}<small>${ago(i.ts)}${i.from === 'admin' ? ' · dall\'amministratore' : ''}</small></button>`).join('')
      : '<p class="empty">Nessuna notifica.</p>';
  }

  async read(ids) {
    await fetch('/api/notifications/read', { method: 'POST', headers: this.headers(), body: JSON.stringify({ ids }) }).catch(() => {});
    await this.poll();
  }

  // ---------------------------------------------------------------- notifiche sul dispositivo
  supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  /** 'unsupported' | 'denied' | 'off' | 'on' */
  async pushState() {
    if (!this.supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted') return 'off';
    try { const reg = await navigator.serviceWorker.getRegistration('/'); return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'; } catch { return 'off'; }
  }

  async ensurePush() { if (this.supported() && Notification.permission === 'granted') await this.enablePush(true); }

  async enablePush(silent = false) {
    if (!this.supported()) return 'unsupported';
    try {
      if (Notification.permission !== 'granted') {
        if (silent) return 'off';
        if (await Notification.requestPermission() !== 'granted') return 'denied';
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const key = (await (await fetch('/api/push/key', { headers: this.headers() })).json()).publicKey;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) });
      await fetch('/api/push/subscribe', { method: 'POST', headers: this.headers(), body: JSON.stringify({ subscription: sub.toJSON() }) });
      await this.poll();
      return 'on';
    } catch (e) { console.error('push:', e); return 'error'; }
  }

  async disablePush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/'); const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch('/api/push/unsubscribe', { method: 'POST', headers: this.headers(), body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    } catch {}
    await this.poll();
  }

  async sendTest() { await fetch('/api/notifications/test', { method: 'POST', headers: this.headers() }); await this.poll(); }
}
