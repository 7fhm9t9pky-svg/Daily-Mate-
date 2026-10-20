import { CalendarEvent } from '../modules/calendar/CalendarEvent.js';
import { AlertItem } from '../modules/alerts/AlertItem.js';
import { NoteItem } from '../modules/alerts/NoteItem.js';
import { ContactItem } from '../modules/contacts/ContactItem.js';
import { DocumentItem } from '../modules/documents/DocumentItem.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const uid = () => Math.random().toString(36).slice(2, 8);
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
const PAGES = { home: 'home', calendar: 'calendar', alerts: 'alerts', notes: 'alerts/notes', documents: 'documents', contacts: 'contacts', finance: 'finance', patrimonio: 'finance/0', forecast: 'finance/forecast', fixed: 'finance/fixed', activity: 'activity', groups: 'groups', settings: 'settings' };
const ACCENTS = ['verde', 'blu', 'viola', 'rosso', 'grigio'];
const PAGE_IDS = ['calendar', 'documents', 'contacts', 'alerts', 'finance', 'activity', 'groups'];

/**
 * Pulsante dell'assistente virtuale (in tutte le schermate) + chat.
 * Il server parla con Claude; qui si eseguono gli "strumenti" (aggiungere eventi, note, conti, cambiare tema...).
 */
export class Assistant {
  constructor(app) { this.app = app; this.msgs = []; this.shown = []; this.busy = false; }

  mount() {
    const btn = document.createElement('button');
    btn.id = 'ai-btn'; btn.className = 'ai-btn'; btn.setAttribute('aria-label', 'Assistente'); btn.innerHTML = '✨';
    btn.onclick = () => this.open();
    document.body.appendChild(btn);
  }

  // ---------- pannello
  async open() {
    if (this.panel) return;
    const p = this.panel = document.createElement('div');
    p.className = 'ai-panel';
    p.innerHTML = `<div class="ai-head"><b>✨ Assistente</b><span><button class="ai-x" data-a="new">Nuova chat</button><button class="ai-x" data-a="close" aria-label="Chiudi">✕</button></span></div>
      <div class="ai-msgs"></div><div class="ai-setup" hidden></div>
      <form class="ai-form"><textarea rows="1" placeholder="Scrivi qui… (es. “dove metto la bolletta della luce?”)"></textarea><button type="submit" aria-label="Invia">➤</button></form>`;
    document.body.appendChild(p);
    p.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.close(); else if (a === 'new') { this.msgs = []; this.shown = []; this.draw(); }
      const s = e.target.closest('[data-sug]'); if (s) this.send(s.dataset.sug);
      const g = e.target.closest('[data-go]'); if (g) { this.app.router.goTo(g.dataset.go); this.close(); }
    });
    const ta = p.querySelector('textarea');
    p.querySelector('form').onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (t) { ta.value = ''; this.send(t); } };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.querySelector('form').requestSubmit(); } });
    this.draw();
    try { this.status = await this.app.auth.api('/api/assistant/status'); } catch { this.status = { enabled: false }; }
    this.setup();
    ta.focus();
  }

  close() { this.panel?.remove(); this.panel = null; }

  setup() {
    const box = this.panel?.querySelector('.ai-setup'); if (!box) return;
    const st = this.status || {};
    box.hidden = !!st.enabled;
    this.panel.querySelector('.ai-form').hidden = !st.enabled;
    if (st.enabled) return;
    box.innerHTML = st.owner
      ? `<p><b>L'assistente non è ancora attivo.</b> Serve una chiave di Anthropic (la crei su console.anthropic.com → API keys). Incollala qui: resta salvata solo sul tuo PC.</p>
         <input type="password" placeholder="sk-ant-…" autocomplete="off" id="ai-key"><button class="btn primary" data-save="1">Attiva</button><em class="xmsg" id="ai-m"></em>`
      : `<p><b>L'assistente non è ancora attivo.</b> Chiedi all'amministratore di attivarlo.</p>`;
    box.querySelector('[data-save]')?.addEventListener('click', async () => {
      const k = box.querySelector('#ai-key').value.trim(); if (!k) return;
      try { this.status = await this.app.auth.api('/api/assistant/config', { method: 'PUT', body: JSON.stringify({ apiKey: k }) }); this.setup(); this.draw(); }
      catch (e) { box.querySelector('#ai-m').textContent = e.message; }
    });
  }

  draw() {
    const box = this.panel?.querySelector('.ai-msgs'); if (!box) return;
    if (!this.shown.length) {
      box.innerHTML = `<div class="ai-m bot">Ciao! Sono qui per aiutarti. Posso dirti <b>dove mettere</b> un dato, <b>inserirlo io</b> al posto tuo e <b>personalizzare</b> l'app. Cosa vuoi fare?</div>
        <div class="ai-sug">${['Dove metto la bolletta della luce?', 'Aggiungi un evento domani alle 18', 'Ho 300 € sul conto Intesa', 'Cambia il colore dell\'app'].map(t => `<button data-sug="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
      return;
    }
    box.innerHTML = this.shown.map(m => m.kind === 'act' ? `<div class="ai-act ${m.ok ? '' : 'bad'}">${m.ok ? '✅' : '⚠️'} ${esc(m.text)}${m.go ? ` <button data-go="${esc(m.go)}">Apri</button>` : ''}</div>` : `<div class="ai-m ${m.role === 'user' ? 'me' : 'bot'}">${md(m.text)}</div>`).join('') + (this.busy ? '<div class="ai-m bot ai-typing">…</div>' : '');
    box.scrollTop = box.scrollHeight;
  }

  context() {
    const a = this.app, d = new Date(), pad = n => String(n).padStart(2, '0');
    const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    return `Oggi è ${days[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}, ore ${pad(d.getHours())}:${pad(d.getMinutes())}.
Utente: ${a.displayName() || 'sconosciuto'} (${a.isOwner() ? 'amministratore con il foglio Finanze personale' : 'utente normale con Patrimonio proprio'}).
Pagina aperta ora: ${location.hash || '#/home'}.
Pagine nascoste: ${[...(a.ui.hidden || []), ...(a.selfUi?.hidden || [])].join(', ') || 'nessuna'}.`;
  }

  // ---------- conversazione
  async send(text) {
    if (this.busy) return;
    this.busy = true; this.shown.push({ role: 'user', text }); this.msgs.push({ role: 'user', content: text }); this.draw();
    let wrote = false;
    try {
      for (let turn = 0; turn < 6; turn++) {
        const r = await this.app.auth.api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ messages: this.msgs, context: this.context() }) });
        const blocks = r.content || []; this.msgs.push({ role: 'assistant', content: blocks });
        const t = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(); if (t) this.shown.push({ role: 'assistant', text: t });
        const uses = blocks.filter(b => b.type === 'tool_use');
        if (!uses.length) break;
        const results = [];
        for (const u of uses) {
          let out;
          try { out = await this.run(u.name, u.input || {}); wrote ||= !!out.wrote; } catch (e) { out = { ok: false, msg: e.message || 'Errore' }; }
          this.shown.push({ kind: 'act', ok: out.ok, text: out.label || out.msg, go: out.go });
          results.push({ type: 'tool_result', tool_use_id: u.id, content: out.ok ? (out.data ? JSON.stringify(out.data) : out.msg || 'Fatto') : 'ERRORE: ' + out.msg, is_error: !out.ok });
        }
        this.msgs.push({ role: 'user', content: results }); this.draw();
      }
    } catch (e) { this.shown.push({ role: 'assistant', text: '⚠️ ' + (e.message || 'Qualcosa non ha funzionato.') }); this.msgs.pop(); }
    this.busy = false; this.draw();
    if (wrote) this.refreshPage();
  }

  refreshPage() { const a = this.app; if (a.activeModuleId) a.showModule(a.activeModuleId, location.hash.split('/').slice(2).join('/') || undefined); }

  // ---------- strumenti
  mod(id) { const m = this.app.registry.get(id); if (!m || this.app.isHidden(id)) throw new Error('Questa pagina non è disponibile per te'); return m; }

  async run(name, a) {
    const app = this.app, ok = (label, extra = {}) => ({ ok: true, label, msg: label, wrote: true, ...extra }), fail = msg => ({ ok: false, msg });
    switch (name) {
      case 'add_event': {
        const date = isoDate(a.date); if (!date || !a.title) return fail('Servono titolo e data valida');
        await this.mod('calendar').repo.save(new CalendarEvent({ title: a.title, date, allDay: !!a.all_day || !a.start, start: a.start || '', end: a.end || '', notes: a.notes || '', category: a.category || 'personal', repeat: a.repeat || 'none' }));
        return ok(`Evento “${a.title}” aggiunto al Calendario (${date}${a.start ? ' ore ' + a.start : ''})`, { go: 'calendar' });
      }
      case 'add_alert': {
        const date = isoDate(a.date); if (!date || !a.title) return fail('Servono titolo e data valida');
        const al = new AlertItem({ title: a.title, date, notes: a.notes || '', repeat: a.repeat || 'none' });
        if (al.repeat === 'monthly' || al.repeat === 'yearly') al.anchor = Number(date.slice(8, 10));
        await this.mod('alerts').repo.save(al); return ok(`Scadenza “${a.title}” aggiunta (${date})`, { go: 'alerts' });
      }
      case 'add_note': {
        const items = Array.isArray(a.items) ? a.items.filter(Boolean).map(t => ({ id: uid(), t: String(t), done: false })) : [];
        await this.mod('alerts').notes.save(new NoteItem({ title: a.title, text: a.text || '', mode: items.length ? 'list' : 'text', items })); return ok(`Nota “${a.title}” creata`, { go: 'alerts/notes' });
      }
      case 'add_contact': {
        if (!a.name) return fail('Serve il nome');
        await this.mod('contacts').repo.save(new ContactItem({ title: a.name, role: a.role || '', phone: a.phone || '', email: a.email || '', notes: a.notes || '' })); return ok(`Contatto “${a.name}” aggiunto`, { go: 'contacts' });
      }
      case 'add_document': {
        await this.mod('documents').repo.save(new DocumentItem({ title: a.title, category: a.category || 'altro', expiry: isoDate(a.expiry), notes: a.notes || '', text: a.text || '' })); return ok(`Documento “${a.title}” aggiunto`, { go: 'documents' });
      }
      case 'add_account': case 'add_credit': {
        const fin = this.mod('finance'), b = await fin.book();
        if (!b.useWealth()) return fail('Per il tuo account i conti vanno scritti nella pagina Patrimonio del foglio: apri Finanze > Patrimonio e tocca la casella della banca.');
        const amount = Number(a.amount); if (!Number.isFinite(amount) || !a.name) return fail('Servono nome e importo');
        const cur = String(a.currency || b.st.wealth.base || 'EUR').toUpperCase();
        if (name === 'add_account') b.st.wealth.items.push({ id: uid(), name: a.name, bank: a.bank || '', kind: a.kind || 'cash', cur, amount, inv: false });
        else (b.st.wealth.credits ||= []).push({ id: uid(), name: a.name, cur, amount });
        b.commit(); return ok(name === 'add_account' ? `Conto “${a.name}” aggiunto in Patrimonio (${amount} ${cur})` : `Credito di ${amount} ${cur} da ${a.name} aggiunto`, { go: 'finance/0' });
      }
      case 'list_pages': {
        const b = await this.mod('finance').book();
        const pages = b.st.custom.map((d, k) => ({ d, i: b.base + k })).filter(({ d }) => !d.deleted).map(({ d, i }) => ({ nome: d.name, modello: d.tpl || 'vuota', colonne: d.cols || undefined }));
        const accounts = b.useWealth() ? b.st.wealth.items.map(x => x.bank ? `${x.bank} · ${x.name}` : x.name) : b.banks();
        return { ok: true, label: 'Ho guardato le tue pagine', data: { pagine_personali: pages, conti: accounts } };
      }
      case 'go_to': { const p = PAGES[a.page]; if (!p) return fail('Pagina sconosciuta'); app.router.goTo(p); return { ok: true, label: 'Pagina aperta', msg: 'Aperta' }; }
      case 'open_form': { const m = { event: ['calendar', 'calendar'], alert: ['alerts', 'alerts'], note: ['notes', 'alerts/notes'], document: ['documents', 'documents'], contact: ['contacts', 'contacts'] }[a.what]; if (!m) return fail('Modulo sconosciuto'); this.close(); app.quickAdd(m[0], m[1]); return { ok: true, label: 'Ti ho aperto il modulo da compilare', msg: 'Modulo aperto' }; }
      case 'set_theme': {
        if (app.ui?.lock) return fail('L\'amministratore ha bloccato colore e modo');
        const patch = {}; if (ACCENTS.includes(a.accent)) patch.accent = a.accent; if (['auto', 'light', 'dark'].includes(a.mode)) patch.mode = a.mode;
        if (!Object.keys(patch).length) return fail('Nessun colore o modo valido');
        await app.theme.update(patch); return ok('Aspetto cambiato');
      }
      case 'set_display_name': { const n = String(a.name || '').trim().slice(0, 30); if (!n) return fail('Serve un nome'); await app.setProfileName(n); return ok(`Ora ti chiamo ${n}`); }
      case 'customize_pages': {
        const cur = { labels: { ...(app.selfUi?.labels || {}) }, hidden: [...(app.selfUi?.hidden || [])] };
        for (const [k, v] of Object.entries(a.rename || {})) if (PAGE_IDS.includes(k)) { const t = String(v || '').trim().slice(0, 24); if (t) cur.labels[k] = t; else delete cur.labels[k]; }
        for (const k of a.hide || []) if (PAGE_IDS.includes(k) && !cur.hidden.includes(k)) cur.hidden.push(k);
        for (const k of a.show || []) cur.hidden = cur.hidden.filter(x => x !== k);
        await app.setSelfUi(cur); return ok('Menu personalizzato');
      }
      case 'request_change': {
        await app.auth.api('/api/assistant/request', { method: 'POST', body: JSON.stringify({ text: a.text }) }); return { ok: true, label: 'Richiesta inviata all\'amministratore', msg: 'Inviata' };
      }
      default: return fail('Strumento sconosciuto');
    }
  }
}
