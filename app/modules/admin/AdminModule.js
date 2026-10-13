import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const PAGES = [['calendar', 'Calendario'], ['documents', 'Documenti'], ['alerts', 'Avvisi'], ['finance', 'Finanze'], ['activity', 'Attività'], ['groups', 'Gruppi']];
const SHEETS = ['Home banking', 'Ore lavoro', 'Investimenti aperti', 'PIM azionario', 'Amministrazione', 'Entrate e uscite', 'Trading 212', 'Conto KE', 'Risparmio'];
const BASE_SHEETS = [0, 1, 2, 4, 5, 8];   // schede che un utente normale vede se l'amministratore non ha scelto altro
const MODES = [['', 'Scelta dell\'utente'], ['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']];
const ACCENTS = [['', 'Scelta dell\'utente'], ['verde', 'Verde'], ['blu', 'Blu'], ['viola', 'Viola'], ['rosso', 'Rosso'], ['grigio', 'Grigio']];
const GO = [['', 'Nessuna (solo messaggio)'], ['home', 'Home'], ['calendar', 'Calendario'], ['documents', 'Documenti'], ['alerts', 'Avvisi'], ['finance', 'Finanze'], ['activity', 'Attività'], ['groups', 'Gruppi']];

/**
 * Amministrazione (solo per l'amministratore = primo account registrato):
 * personalizza l'interfaccia di ogni utente separatamente e invia notifiche.
 */
class AdminView extends Component {
  constructor(m) { super(); this.m = m; this.users = []; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <h2 class="s">Utenti</h2><p class="set-note">Tocca un utente per personalizzare la sua interfaccia: pagine visibili, nomi del menu, colori, messaggio di benvenuto. Ogni utente ha la sua configurazione.</p>
      <div class="lst" id="ad-users"></div>
      <h2 class="s">Invia una notifica</h2>
      <div class="set-block" id="ad-send"></div>`;
    return el;
  }

  async afterMount() { await this.load(); this.drawSend(); }

  get hdr() { return { Authorization: `Bearer ${this.m.app.auth.token}`, 'Content-Type': 'application/json' }; }

  async load() {
    const box = this.el.querySelector('#ad-users');
    try {
      const r = await fetch('/api/admin/users', { headers: this.hdr }); if (!r.ok) throw new Error();
      const me = this.m.app.auth.user, all = (await r.json()).users;
      this.users = this.m.app.isOwner() ? all : all.filter(u => u.id === me.id || u.role === 'user');   // il visitatore gestisce solo gli utenti normali
    } catch { box.innerHTML = '<p class="empty">Non riesco a caricare gli utenti.</p>'; return; }
    box.innerHTML = this.users.map(u => {
      const custom = u.ui && (u.ui.hidden?.length || Object.keys(u.ui.labels || {}).length || u.ui.accent || u.ui.mode || u.ui.welcome);
      return `<button class="row" data-u="${u.id}"><span class="t">${esc(u.displayName || u.username)}${u.isOwner ? ' <em class="badge">Amministratore</em>' : u.role === 'visitor' ? ' <em class="badge">Visitatore</em>' : ''}<small>@${esc(u.username)} · ${u.devices ? u.devices + ' dispositivo/i con notifiche' : 'notifiche non attive'}${custom ? ' · interfaccia personalizzata' : ''}</small></span><span class="m">›</span></button>`;
    }).join('');
    box.onclick = e => { const b = e.target.closest('[data-u]'); if (b) this.editUi(this.users.find(u => u.id === b.dataset.u)); };
  }

  async editUi(u) {
    const ui = u.ui || {}; const f = [];
    PAGES.forEach(([id, n]) => f.push({ key: 'show_' + id, label: `Mostra “${n}”`, type: 'checkbox' }));
    PAGES.forEach(([id, n]) => f.push({ key: 'lab_' + id, label: `Nome di “${n}” nel menu (vuoto = ${n})`, type: 'text' }));
    SHEETS.forEach((n, i) => i !== 6 && i !== 7 && f.push({ key: 'sh_' + i, label: `Finanze: mostra la scheda “${n}”`, type: 'checkbox' }));
    SHEETS.forEach((n, i) => i !== 6 && i !== 7 && f.push({ key: 'shl_' + i, label: `Finanze: nome della scheda “${n}” (vuoto = ${n})`, type: 'text' }));
    const canRole = this.m.app.isOwner() && !u.isOwner;
    if (canRole) f.unshift({ key: 'role', label: 'Permessi: Utente = normale · Visitatore = permessi amministrativi ma senza i dati personali del proprietario', type: 'select', options: [{ value: 'user', label: 'Utente' }, { value: 'visitor', label: 'Visitatore' }] });
    f.push({ key: 'accent', label: 'Colore principale', type: 'select', options: ACCENTS.map(([value, label]) => ({ value, label })) });
    f.push({ key: 'mode', label: 'Tema', type: 'select', options: MODES.map(([value, label]) => ({ value, label })) });
    f.push({ key: 'lock', label: 'Impedisci all\'utente di cambiare colore/tema', type: 'checkbox' });
    f.push({ key: 'welcome', label: 'Messaggio nella Home (facoltativo)', type: 'textarea' });
    const values = { role: u.role === 'visitor' ? 'visitor' : 'user', accent: ui.accent || '', mode: ui.mode || '', lock: !!ui.lock, welcome: ui.welcome || '' };
    const allowed = ui.sheets || (u.isOwner ? SHEETS.map((_, i) => i) : BASE_SHEETS);
    SHEETS.forEach((n, i) => { values['sh_' + i] = allowed.includes(i); values['shl_' + i] = ui.sheetLabels?.[i] || ''; });
    PAGES.forEach(([id]) => { values['show_' + id] = !(ui.hidden || []).includes(id); values['lab_' + id] = ui.labels?.[id] || ''; });
    const r = await FormModal.open({ title: `Interfaccia di ${u.displayName || u.username}`, fields: f, values });
    if (!r || r.__delete) return;
    const next = { hidden: PAGES.filter(([id]) => !r['show_' + id]).map(([id]) => id), labels: {}, accent: r.accent, mode: r.mode, lock: r.lock, welcome: r.welcome };
    next.sheets = SHEETS.map((_, i) => i).filter(i => i !== 6 && i !== 7 && r['sh_' + i]);
    next.sheetLabels = {}; SHEETS.forEach((_, i) => { if (r['shl_' + i]?.trim()) next.sheetLabels[i] = r['shl_' + i].trim(); });
    PAGES.forEach(([id]) => { if (r['lab_' + id].trim()) next.labels[id] = r['lab_' + id].trim(); });
    if (canRole && r.role !== (u.role === 'visitor' ? 'visitor' : 'user')) {
      const rr = await fetch(`/api/admin/users/${u.id}/role`, { method: 'PUT', headers: this.hdr, body: JSON.stringify({ role: r.role }) });
      if (!rr.ok) alert((await rr.json().catch(() => ({}))).error || 'Impossibile cambiare i permessi');
    }
    const res = await fetch(`/api/admin/users/${u.id}/ui`, { method: 'PUT', headers: this.hdr, body: JSON.stringify({ ui: next }) });
    if (res.ok && u.id === this.m.app.auth.user.id) await this.m.app.applyUi((await res.json()).ui);
    await this.load();
  }

  drawSend() {
    const box = this.el.querySelector('#ad-send');
    box.innerHTML = `
      <label class="fl"><span>A chi</span><select id="ns-to"><option value="all">Tutti gli utenti</option>${this.users.map(u => `<option value="${u.id}">${esc(u.displayName || u.username)}</option>`).join('')}</select></label>
      <label class="fl"><span>Titolo</span><input id="ns-title" type="text" autocomplete="off"></label>
      <label class="fl"><span>Testo (facoltativo)</span><textarea id="ns-body" rows="3"></textarea></label>
      <label class="fl"><span>Cosa apre al tocco</span><select id="ns-page">${GO.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <button class="btn primary" id="ns-send">Invia notifica</button><em id="ns-msg" class="xmsg"></em>`;
    box.querySelector('#ns-send').onclick = async () => {
      const msg = box.querySelector('#ns-msg'), to = box.querySelector('#ns-to').value;
      const res = await fetch('/api/admin/notify', { method: 'POST', headers: this.hdr, body: JSON.stringify({ to, title: box.querySelector('#ns-title').value, body: box.querySelector('#ns-body').value, page: box.querySelector('#ns-page').value }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { msg.textContent = `Inviata a ${j.sent} utente/i.`; box.querySelector('#ns-title').value = ''; box.querySelector('#ns-body').value = ''; }
      else msg.textContent = '⚠ ' + (j.error || 'Invio non riuscito');
    };
  }
}

export class AdminModule extends Module {
  constructor() { super({ id: 'admin', name: 'Amministrazione' }); }
  async getView() { return new AdminView(this); }
}
