import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { daysUntil, fmtShort, relative, todayIso, timeToMin } from '../../core/dates.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TABS = [['chat', 'Chat'], ['events', 'Calendario'], ['alerts', 'Avvisi'], ['documents', 'Documenti']];
const CATEGORY = { identita: 'Identità', auto: 'Auto', casa: 'Casa', salute: 'Salute', lavoro: 'Lavoro', fisco: 'Fisco e banche', altro: 'Altro' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hhmm = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const dayLabel = ts => { const d = new Date(ts), t = new Date(); return d.toDateString() === t.toDateString() ? 'Oggi' : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); };

/** Riduce la foto prima dell'invio (max 1280 px, JPEG): veloce da caricare e leggera per il tuo PC. */
function shrink(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Immagine non leggibile')); };
    img.src = url;
  });
}

/** Pagina di un gruppo: si apre sulla chat, con il menu per passare a calendario, avvisi e documenti del gruppo. */
export class GroupDetail extends Component {
  constructor(m, gid) { super(); this.m = m; this.gid = gid; this.tab = 'chat'; this.timer = null; this.sig = ''; this.imgs = new Map(); this.group = null; }

  render() {
    const el = document.createElement('section');
    el.className = 'page group-page';
    el.innerHTML = `
      <div class="page-head"><button class="back" data-act="back">‹ Gruppi</button><h1 id="gd-title">Gruppo</h1></div>
      <div class="seg gd-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="gd-body"></div>`;
    el.querySelector('[data-act=back]').onclick = () => this.m.app.router.goTo('groups');
    el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => this.show(b.dataset.tab); });
    return el;
  }

  async afterMount() {
    const st = await this.m.svc.state(true);
    this.group = st.groups.find(g => g.id === this.gid);
    if (!this.group) { this.el.querySelector('#gd-body').innerHTML = '<p class="empty">Gruppo non trovato (forse sei stato rimosso).</p>'; return; }
    this.el.querySelector('#gd-title').textContent = this.group.name;
    this.show('chat');
  }

  destroy() { clearInterval(this.timer); for (const u of this.imgs.values()) URL.revokeObjectURL(u); super.destroy(); }

  show(tab) {
    clearInterval(this.timer); this.tab = tab;
    this.el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'chat') this.chatInit(); else this.itemsInit(tab);
  }

  // ------------------------------------------------------------ chat
  chatInit() {
    const body = this.el.querySelector('#gd-body');
    body.innerHTML = `
      <div class="chat" id="chat-list"><p class="empty">Caricamento…</p></div>
      <form class="chat-in" id="chat-form">
        <button type="button" class="chat-ph" id="chat-ph" aria-label="Invia una foto">📷</button>
        <input type="file" id="chat-file" accept="image/*" hidden>
        <input type="text" id="chat-text" placeholder="Scrivi un messaggio…" maxlength="2000" autocomplete="off">
        <button class="btn primary" type="submit">Invia</button>
      </form>
      <p class="set-note" id="chat-err" hidden></p>`;
    this.sig = ''; this.chatErr = body.querySelector('#chat-err');
    const file = body.querySelector('#chat-file');
    body.querySelector('#chat-ph').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      try { await this.send('', await shrink(f)); } catch (e) { this.err(e.message); }
    };
    body.querySelector('#chat-form').onsubmit = async e => {
      e.preventDefault();
      const inp = body.querySelector('#chat-text'), t = inp.value.trim(); if (!t) return;
      inp.value = '';
      try { await this.send(t, ''); } catch (er) { inp.value = t; this.err(er.message); }
    };
    body.querySelector('#chat-list').addEventListener('click', async e => {
      const d = e.target.closest('[data-del]'); if (!d || !confirm('Eliminare questo messaggio?')) return;
      try { await this.m.svc.api(`/api/groups/${this.gid}/chat/${d.dataset.del}`, { method: 'DELETE' }); this.sig = ''; this.poll(); } catch (er) { this.err(er.message); }
    });
    this.poll(true);
    this.timer = setInterval(() => this.poll(), 3000);
  }

  err(t) { if (!this.chatErr) return; this.chatErr.hidden = !t; this.chatErr.textContent = t || ''; this.chatErr.style.color = 'var(--neg)'; }

  async send(text, image) {
    this.err('');
    await this.m.svc.api(`/api/groups/${this.gid}/chat`, { method: 'POST', body: { text, image } });
    this.sig = ''; await this.poll(true);
  }

  async poll(first = false) {
    if (this.tab !== 'chat' || this.busy) return;
    this.busy = true;
    try {
      const r = await this.m.svc.api(`/api/groups/${this.gid}/chat`);
      const sig = r.messages.map(x => x.id).join(',');
      if (sig !== this.sig) { this.sig = sig; this.drawChat(r.messages, r.me, first); }
    } catch { /* offline: riprova al prossimo giro */ }
    this.busy = false;
  }

  drawChat(msgs, me, forceBottom) {
    const box = this.el.querySelector('#chat-list'); if (!box) return;
    const sc = this.el.closest('.app-main') || document.scrollingElement;
    const atBottom = forceBottom || (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140);
    let day = '', h = '';
    for (const m of msgs) {
      const dl = dayLabel(m.ts); if (dl !== day) { day = dl; h += `<div class="chat-day">${esc(dl)}</div>`; }
      const mine = m.userId === me;
      h += `<div class="msg ${mine ? 'me' : 'ot'}">${mine ? '' : `<small class="who">${esc(m.name)}</small>`}
        ${m.img ? `<img data-img="${esc(m.img)}" alt="foto" class="chat-img">` : ''}
        ${m.text ? `<div class="tx">${esc(m.text).replace(/\n/g, '<br>')}</div>` : ''}
        <small class="tm">${hhmm(m.ts)}${mine || this.group?.isOwner ? ` · <a href="#" data-del="${m.id}">elimina</a>` : ''}</small></div>`;
    }
    box.innerHTML = h || '<p class="empty">Nessun messaggio: scrivi tu il primo!</p>';
    box.querySelectorAll('img[data-img]').forEach(img => this.loadImg(img));
    if (atBottom) requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
  }

  async loadImg(img) {
    const name = img.dataset.img;
    try {
      if (!this.imgs.has(name)) {
        const res = await fetch(`/api/groups/${this.gid}/chat/img/${name}`, { headers: { Authorization: `Bearer ${this.m.svc.auth.token}` } });
        if (!res.ok) throw new Error();
        this.imgs.set(name, URL.createObjectURL(await res.blob()));
      }
      img.src = this.imgs.get(name);
      img.onclick = () => window.open(img.src, '_blank');
    } catch { img.alt = 'foto non disponibile'; }
  }

  // ------------------------------------------------------------ calendario / avvisi / documenti
  async itemsInit(type) {
    const body = this.el.querySelector('#gd-body');
    body.innerHTML = `<div class="page-head right"><button class="btn primary" data-act="add">+ Nuovo</button></div><div class="lst" id="gi-list"></div><p class="empty" id="gi-empty" hidden></p>`;
    body.querySelector('[data-act=add]').onclick = () => this.openItem(type, null);
    body.querySelector('#gi-list').addEventListener('click', async e => {
      const row = e.target.closest('.row'); if (!row) return;
      const it = this.items.find(x => x.id === row.dataset.id);
      if (e.target.closest('[data-toggle]')) { await this.saveItem('alerts', { ...it, done: !it.done }); return this.itemsDraw(); }
      this.openItem(type, it);
    });
    await this.itemsDraw();
  }

  async itemsDraw() {
    const type = this.tab; if (type === 'chat') return;
    let items = [];
    try { items = (await this.m.svc.api(`/api/groups/items/${type}`)).items.filter(x => x.groupId === this.gid); } catch { /* offline */ }
    this.items = items;
    const list = this.el.querySelector('#gi-list'); if (!list) return;
    const by = (a, b) => (a || '9999').localeCompare(b || '9999');
    const rows = {
      events: () => items.slice().sort((a, b) => by(a.date, b.date) || timeToMin(a.start) - timeToMin(b.start)).map(e => `<button class="row" data-id="${e.id}"><span class="t">${esc(e.title) || 'Evento'}<small>${e.start || ''}${e.end ? ' – ' + e.end : ''}${e.notes ? ' · ' + esc(e.notes.slice(0, 50)) : ''}</small></span><span class="m">${fmtShort(e.date)}<br>${relative(e.date)}</span></button>`),
      alerts: () => items.slice().sort((a, b) => (a.done - b.done) || by(a.date, b.date)).map(a => {
        const n = a.date ? daysUntil(a.date) : 99, cls = a.done ? '' : n < 0 ? 'warn' : n <= 7 ? 'soon' : '';
        return `<button class="row" data-id="${a.id}"><span class="box${a.done ? ' on' : ''}" data-toggle>${a.done ? '✓' : ''}</span><span class="t${a.done ? ' done' : ''}">${esc(a.title)}${a.notes ? `<small>${esc(a.notes.slice(0, 70))}</small>` : ''}</span><span class="m ${cls}">${fmtShort(a.date)}<br>${a.done ? '' : relative(a.date)}</span></button>`;
      }),
      documents: () => items.slice().sort((a, b) => by(a.expiry, b.expiry)).map(d => {
        const n = d.expiry ? daysUntil(d.expiry) : 999, cls = n < 0 ? 'warn' : n <= 30 ? 'soon' : '';
        return `<button class="row" data-id="${d.id}"><span class="t">${esc(d.title)}<small>${CATEGORY[d.category] || ''}${d.notes ? ' · ' + esc(d.notes.slice(0, 50)) : ''}</small></span><span class="m ${cls}">${d.expiry ? 'scade ' + fmtShort(d.expiry) : ''}</span></button>`;
      })
    }[type]();
    list.innerHTML = rows.join('');
    const em = this.el.querySelector('#gi-empty');
    em.hidden = rows.length > 0;
    em.textContent = { events: 'Nessun evento condiviso: aggiungine uno con “+ Nuovo”.', alerts: 'Nessun avviso condiviso.', documents: 'Nessun documento condiviso.' }[type];
  }

  fields(type) {
    return {
      events: [{ key: 'title', label: 'Titolo', type: 'text' }, { key: 'date', label: 'Giorno', type: 'date' }, { key: 'start', label: 'Inizio', type: 'time' }, { key: 'end', label: 'Fine', type: 'time' }, { key: 'notes', label: 'Note', type: 'textarea' }],
      alerts: [{ key: 'title', label: 'Avviso', type: 'text' }, { key: 'date', label: 'Data', type: 'date' }, { key: 'done', label: 'Fatto', type: 'checkbox' }, { key: 'notes', label: 'Note', type: 'textarea' }],
      documents: [{ key: 'title', label: 'Documento', type: 'text' }, { key: 'category', label: 'Tipo', type: 'select', options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) }, { key: 'expiry', label: 'Scadenza (se c’è)', type: 'date' }, { key: 'notes', label: 'Note / dove si trova', type: 'textarea' }]
    }[type];
  }

  async saveItem(type, it) {
    const now = new Date().toISOString();
    const item = { ...it, updatedAt: now, createdAt: it.createdAt || now };
    delete item.groupId; delete item.groupName; delete item.canEdit;
    await this.m.svc.api(`/api/groups/${this.gid}/items/${type}/${item.id}`, { method: 'PUT', body: { item } });
  }

  async openItem(type, it) {
    if (it && !it.canEdit) { alert('Può modificarlo solo chi l\'ha creato (o il creatore del gruppo).'); return; }
    const base = { events: { date: todayIso(), start: '09:00', end: '10:00' }, alerts: { date: todayIso(), done: false }, documents: { category: 'altro' } }[type];
    const r = await FormModal.open({ title: it ? 'Modifica' : 'Nuovo elemento del gruppo', fields: this.fields(type), values: it ? { ...it } : base, allowDelete: !!it });
    if (!r) return;
    try {
      if (r.__delete) await this.m.svc.api(`/api/groups/${this.gid}/items/${type}/${it.id}`, { method: 'DELETE' });
      else await this.saveItem(type, { ...(it || { id: uid() }), ...r, title: (r.title || '').trim() || (type === 'events' ? 'Evento' : 'Senza titolo') });
    } catch (e) { alert(e.message); }
    await this.itemsDraw();
  }
}
