import { reloadKeepingLogin } from '../../core/AuthClient.js';
import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { ACCENTS } from '../../core/ThemeManager.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const MODES = [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']];
const SWATCH = { verde: '#0e5a47', blu: '#2f5fa8', viola: '#5b4a9a', rosso: '#a8402f', grigio: '#3f4a46' };

/** Impostazioni: nome, aspetto (tema e colore), opzioni dei moduli, dati del foglio, account. */
class SettingsView extends Component {
  constructor(module) { super(); this.m = module; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `<div id="set-body"></div>`;
    return el;
  }

  async afterMount() { await this.draw(); }

  async draw() {
    const app = this.m.app, theme = await app.theme.get();
    const mods = app.registry.list().filter(m => (m.getSettingsSchema?.() || []).length);
    const body = this.el.querySelector('#set-body');
    body.innerHTML = `
      <div class="set-block">
        <h3>Profilo</h3>
        <label class="fl"><span>Nome nei saluti</span><input id="set-name" type="text" value="${esc(app.displayName())}" autocomplete="off"></label>
        <button class="btn primary" id="set-name-save">Salva nome</button>
      </div>
      <div class="set-block">
        <h3>Aspetto</h3>
        ${app.ui?.lock ? '<p class="set-note">Colore e tema sono stati impostati dall\'amministratore.</p>' : `
        <div class="fl"><span>Tema</span><div class="seg">${MODES.map(([k, l]) => `<button data-mode="${k}" class="${theme.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="fl"><span>Colore principale</span><div class="seg">${Object.keys(ACCENTS).map(k => `<button class="swatch ${theme.accent === k ? 'on' : ''}" data-accent="${k}" style="background:${SWATCH[k]}" aria-label="${k}"></button>`).join('')}</div></div>`}
      </div>
      <div class="set-block" id="set-notif">
        <h3>Notifiche</h3>
        <p class="set-note">Promemoria automatici per avvisi ed eventi, e messaggi dell'amministratore. Si vedono nella campanella in alto e, se le attivi, anche sul dispositivo ad app chiusa.</p>
        <div class="set-line"><span id="nt-dev">Questo dispositivo…</span><button class="btn" id="nt-toggle">…</button></div>
        <label class="fl chk"><input type="checkbox" id="nt-alerts"><span>Avvisami per gli avvisi in scadenza</span></label>
        <label class="fl"><span>Quando</span><select id="nt-days"><option value="0">Il giorno stesso</option><option value="0,1">Il giorno stesso e il giorno prima</option><option value="0,1,3">Il giorno stesso, 1 e 3 giorni prima</option><option value="0,1,3,7">Il giorno stesso, 1, 3 e 7 giorni prima</option></select></label>
        <label class="fl chk"><input type="checkbox" id="nt-events"><span>Avvisami prima degli eventi del calendario</span></label>
        <label class="fl"><span>Quanto prima</span><select id="nt-min"><option value="10">10 minuti</option><option value="30">30 minuti</option><option value="60">1 ora</option></select></label>
        <div class="set-line"><button class="btn" id="nt-test">Invia notifica di prova</button></div>
      </div>
      ${mods.length ? `<div class="set-block"><h3>Pagine</h3>${mods.map(m => `<button class="row" data-mod="${m.id}"><span class="t">${m.name}<small>Opzioni della pagina</small></span><span class="m">›</span></button>`).join('')}</div>` : ''}
      <div class="set-block">
        <h3>Finanze</h3>
        <div class="set-line"><span>Ripristina il foglio ai dati di partenza</span><button class="btn danger" id="set-reset">Ripristina</button></div>
      </div>
      ${app.auth ? `<div class="set-block">
        <h3>Backup dei dati</h3>
        <p class="set-note">I tuoi dati sono salvati sul server e il server ne fa copie automatiche. Qui puoi anche scaricarne una copia sul tuo dispositivo, o ripristinarla.</p>
        <div class="set-line"><span>Scarica una copia di tutti i tuoi dati</span><button class="btn" id="set-bk">Scarica</button></div>
        <div class="set-line"><span>Ripristina da un file di backup</span><button class="btn danger" id="set-rs">Ripristina</button></div>
        <input type="file" id="set-file" accept=".json,application/json" hidden>
        <em id="set-bkm" class="xmsg"></em>
      </div>
      <div class="set-block" id="set-upd" hidden>
        <h3>Aggiornamenti automatici</h3>
        <p class="set-note">Il server controlla da solo ogni pochi minuti se c'è una versione nuova del programma su GitHub e la installa: basta ricaricare la pagina.</p>
        <label class="fl"><span>Repository GitHub (utente/nome)</span><input id="upd-repo" type="text" placeholder="es. stefano/daily-mate" autocomplete="off"></label>
        <div class="set-line"><button class="btn primary" id="upd-save">Salva</button><button class="btn" id="upd-now">Controlla ora</button></div>
        <em id="upd-msg" class="xmsg"></em>
      </div>
      <div class="set-block"><h3>Account</h3><div class="set-line"><span>${esc(app.auth.user?.username || '')}${app.roleLabel() ? ` <em class="badge">${app.roleLabel()}</em>` : ''}</span><button class="btn" id="set-logout">Esci</button></div></div>` : ''}`;

    body.querySelector('#set-name-save').onclick = async () => {
      await app.setProfileName(body.querySelector('#set-name').value.trim());
      app.renderNav();
      body.querySelector('#set-name-save').textContent = 'Salvato ✓';
    };
    body.querySelectorAll('[data-mode]').forEach(b => { b.onclick = async () => { await app.theme.update({ mode: b.dataset.mode }); this.draw(); }; });
    body.querySelectorAll('[data-accent]').forEach(b => { b.onclick = async () => { await app.theme.update({ accent: b.dataset.accent }); this.draw(); }; });
    body.querySelectorAll('[data-mod]').forEach(b => {
      b.onclick = async () => {
        const m = app.registry.get(b.dataset.mod);
        const result = await FormModal.open({ title: `Opzioni · ${m.name}`, fields: m.getSettingsSchema(), values: await app.settings.getModuleSettings(m.id) });
        if (result && !result.__delete) { await app.settings.setModuleSettings(m.id, result); await m.init?.(); }
      };
    });
    body.querySelector('#set-reset').onclick = async () => {
      if (!confirm('Ripristinare il foglio Finanze ai dati di partenza? Le modifiche che hai fatto nelle schede andranno perse.')) return;
      await app.registry.get('finance').resetData();
    };
    const bkMsg = t => { const m = body.querySelector('#set-bkm'); if (m) m.textContent = t; };
    const hdr = { Authorization: `Bearer ${app.auth?.token}`, 'Content-Type': 'application/json' };
    body.querySelector('#set-bk')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/kv', { headers: hdr }); if (!res.ok) throw new Error();
        const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
        const d = new Date(), p = n => String(n).padStart(2, '0'), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `DailyMate-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        bkMsg('Backup scaricato.');
      } catch { bkMsg('Non sono riuscito a scaricare il backup. Il server è acceso?'); }
    });
    body.querySelector('#set-rs')?.addEventListener('click', () => body.querySelector('#set-file').click());
    body.querySelector('#set-file')?.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!o || o.app !== 'daily-mate' || typeof o.data !== 'object') throw new Error();
        if (!confirm('Ripristinare questo backup? I dati attuali verranno sostituiti da quelli del file.')) return;
        const res = await fetch('/api/kv', { method: 'PUT', headers: hdr, body: JSON.stringify({ data: o.data }) });
        if (!res.ok) throw new Error();
        reloadKeepingLogin();
      } catch { bkMsg('File di backup non valido.'); }
    });
    // notifiche
    (async () => {
      const n = app.notifier; if (!n) return;
      const DEF = { alerts: true, daysBefore: [0, 1], events: true, eventMinutes: 30 };
      const prefs = { ...DEF, ...((await app.storage.get('notif_prefs')) || {}) };
      const q = id => body.querySelector(id);
      const savePrefs = () => app.storage.set('notif_prefs', { alerts: q('#nt-alerts').checked, daysBefore: q('#nt-days').value.split(',').map(Number), events: q('#nt-events').checked, eventMinutes: Number(q('#nt-min').value) });
      q('#nt-alerts').checked = !!prefs.alerts; q('#nt-events').checked = !!prefs.events;
      q('#nt-days').value = (prefs.daysBefore || [0, 1]).join(','); q('#nt-min').value = String(prefs.eventMinutes || 30);
      ['#nt-alerts', '#nt-days', '#nt-events', '#nt-min'].forEach(id => q(id).addEventListener('change', savePrefs));
      const drawDev = async () => {
        const st = await n.pushState();
        q('#nt-dev').textContent = { on: 'Notifiche attive su questo dispositivo', off: 'Notifiche non attive su questo dispositivo', denied: 'Notifiche bloccate dal browser', unsupported: 'Notifiche non supportate (su iPhone: Condividi > Aggiungi alla schermata Home)' }[st];
        const b = q('#nt-toggle'); b.hidden = st === 'unsupported' || st === 'denied'; b.textContent = st === 'on' ? 'Disattiva' : 'Attiva';
      };
      q('#nt-toggle').onclick = async () => { (await n.pushState()) === 'on' ? await n.disablePush() : await n.enablePush(); drawDev(); };
      q('#nt-test').onclick = () => n.sendTest();
      drawDev();
    })();
    // aggiornamenti automatici (solo per il proprietario del server)
    (async () => {
      const box = body.querySelector('#set-upd'); if (!box) return;
      const h = { Authorization: `Bearer ${app.auth?.token}`, 'Content-Type': 'application/json' };
      const msg = body.querySelector('#upd-msg');
      const when = t => t ? new Date(t).toLocaleString('it-IT') : 'mai';
      const show = st => {
        body.querySelector('#upd-repo').value = st.repo || '';
        msg.textContent = !st.repo ? 'Non ancora attivo: inserisci il repository.'
          : st.lastError ? `⚠ ${st.lastError}` : `Versione ${st.sha || '—'} · ultimo controllo: ${when(st.lastCheck)}`;
      };
      try {
        const r = await fetch('/api/update/status', { headers: h }); if (!r.ok) return;
        const st = await r.json(); if (!st.canEdit) return;
        box.hidden = false; show(st);
      } catch { return; }
      const call = async (url, method, payload) => {
        msg.textContent = 'Un momento…';
        try { const r = await fetch(url, { method, headers: h, body: payload ? JSON.stringify(payload) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error); show(j); }
        catch (e) { msg.textContent = '⚠ ' + (e.message || 'Errore'); }
      };
      body.querySelector('#upd-save').onclick = () => call('/api/update/config', 'PUT', { repo: body.querySelector('#upd-repo').value });
      body.querySelector('#upd-now').onclick = () => call('/api/update/now', 'POST');
    })();
    body.querySelector('#set-logout')?.addEventListener('click', () => { app.auth.logout(); location.reload(); });
  }
}

export class SettingsModule extends Module {
  constructor() { super({ id: 'settings', name: 'Impostazioni' }); }
  async getView() { return new SettingsView(this); }
}
