import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { daysUntil, fmtShort, relative, todayIso, timeToMin } from '../../core/dates.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TABS = [['chat', 'Chat'], ['events', 'Calendario'], ['alerts', 'Avvisi'], ['documents', 'Documenti']];
const CATEGORY = { identita: 'Identità', auto: 'Auto', casa: 'Casa', salute: 'Salute', lavoro: 'Lavoro', fisco: 'Fisco e banche', altro: 'Altro' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hhmm = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const dayLabel = ts => { const d = new Date(ts), t = new Date(), y = new Date(Date.now() - 864e5); return d.toDateString() === t.toDateString() ? 'Oggi' : d.toDateString() === y.toDateString() ? 'Ieri' : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); };

/** Colore stabile per ogni persona (nome e cerchietto). */
const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 46%)`; };

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
      <div class="gd-head"><button class="back" data-act="back">‹</button><span class="av big" id="gd-av">?</span><div class="gd-t"><b id="gd-title">Gruppo</b><small id="gd-sub"></small></div></div>
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
    const av = this.el.querySelector('#gd-av'); av.textContent = (this.group.name || '?')[0].toUpperCase(); av.style.background = hue(this.group.id);
    this.el.querySelector('#gd-sub').textContent = (this.group.members || []).map(x => x.name).join(', ');
    this.show('chat');
  }

  destroy() { document.body.classList.remove('chat-full'); clearInterval(this.timer); for (const u of this.imgs.values()) URL.revokeObjectURL(u); super.destroy(); }

  show(tab) {
    clearInterval(this.timer); this.tab = tab;
    document.body.classList.toggle('chat-full', tab === 'chat'); this.el.classList.toggle('chat-mode', tab === 'chat');
    this.el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'chat') this.chatInit(); else this.itemsInit(tab);
  }

  // ------------------------------------------------------------ chat (stile WhatsApp / Teams)
  chatInit() {
    const body = this.el.querySelector('#gd-body');
    body.innerHTML = `
      <div class="chat" id="chat-list"><p class="empty">Caricamento…</p></div>
      <div class="chat-reply" id="chat-reply" hidden></div>
      <p class="chat-err" id="chat-err" hidden></p>
      <form class="chat-in" id="chat-form">
        <button type="button" class="chat-ph" id="chat-ph" aria-label="Invia una foto">📷</button>
        <input type="file" id="chat-file" accept="image/*" hidden>
        <textarea id="chat-text" rows="1" placeholder="Scrivi un messaggio" maxlength="2000" autocomplete="off"></textarea>
        <button class="chat-send" type="submit" aria-label="Invia">➤</button>
      </form>`;
    this.sig = ''; this.chatErr = body.querySelector('#chat-err'); this.replyTo = null; this.msgs = [];
    const file = body.querySelector('#chat-file'), ta = body.querySelector('#chat-text'), form = body.querySelector('#chat-form');
    body.querySelector('#chat-ph').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      try { await this.send('', await shrink(f)); } catch (e) { this.err(e.message); }
    };
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); form.requestSubmit(); } });
    form.onsubmit = async e => {
      e.preventDefault();
      const t = ta.value.trim(); if (!t) return;
      ta.value = ''; grow();
      try { await this.send(t, ''); } catch (er) { ta.value = t; grow(); this.err(er.message); }
    };
    body.querySelector('#chat-reply').addEventListener('click', () => this.setReply(null));
    const list = body.querySelector('#chat-list');
    list.addEventListener('click', e => {
      const j = e.target.closest('[data-jump]'); if (j) { const t = list.querySelector(`[data-mid="${j.dataset.jump}"]`); t?.scrollIntoView({ block: 'center', behavior: 'smooth' }); t?.classList.add('flash'); setTimeout(() => t?.classList.remove('flash'), 1200); return; }
      const r = e.target.closest('[data-react]'); if (r) { this.react(r.closest('[data-mid]').dataset.mid, r.dataset.react); return; }
      if (e.target.closest('a,.chat-img')) return;
      const m = e.target.closest('[data-mid]'); if (m) this.sheet(m.dataset.mid);
    });
    this.poll(true);
    this.timer = setInterval(() => this.poll(), 3000);
  }

  err(t) { if (!this.chatErr) return; this.chatErr.hidden = !t; this.chatErr.textContent = t || ''; }

  setReply(m) {
    this.replyTo = m; const box = this.el.querySelector('#chat-reply'); if (!box) return;
    box.hidden = !m;
    if (m) { box.innerHTML = `<div><b>${esc(m.name)}</b><span>${m.img ? '📷 Foto' : esc(m.text.slice(0, 90))}</span></div><button type="button" aria-label="Annulla">✕</button>`; this.el.querySelector('#chat-text')?.focus(); }
  }

  async react(mid, emoji) {
    try { await this.m.svc.api(`/api/groups/${this.gid}/chat/${mid}/react`, { method: 'PUT', body: { emoji } }); this.sig = ''; this.poll(); } catch (er) { this.err(er.message); }
  }

  /** Foglio con le azioni su un messaggio: reazioni, rispondi, copia, elimina. */
  sheet(mid) {
    const m = this.msgs.find(x => x.id === mid); if (!m) return;
    const canDel = m.userId === this.me || this.group?.isOwner;
    const ov = document.createElement('div'); ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal msg-sheet"><div class="ms-emoji">${['👍', '❤️', '😂', '😮', '😢', '🙏'].map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>
      <button class="ms-row" data-a="reply">↩ Rispondi</button>${m.text ? '<button class="ms-row" data-a="copy">📋 Copia testo</button>' : ''}${canDel ? '<button class="ms-row bad" data-a="del">🗑 Elimina</button>' : ''}</div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', async e => {
      if (e.target === ov) return ov.remove();
      const em = e.target.closest('[data-e]'), a = e.target.closest('[data-a]')?.dataset.a;
      if (em) { ov.remove(); return this.react(mid, em.dataset.e); }
      if (!a) return;
      ov.remove();
      if (a === 'reply') this.setReply(m);
      else if (a === 'copy') { try { await navigator.clipboard.writeText(m.text); } catch { /* non disponibile */ } }
      else if (a === 'del' && confirm('Eliminare questo messaggio?')) {
        try { await this.m.svc.api(`/api/groups/${this.gid}/chat/${mid}`, { method: 'DELETE' }); this.sig = ''; this.poll(); } catch (er) { this.err(er.message); }
      }
    });
  }

  async send(text, image) {
    this.err('');
    const reply = this.replyTo?.id || undefined; this.setReply(null);
    await this.m.svc.api(`/api/groups/${this.gid}/chat`, { method: 'POST', body: { text, image, reply } });
    this.sig = ''; await this.poll(true);
  }

  async poll(first = false) {
    if (this.tab !== 'chat' || this.busy) return;
    this.busy = true;
    try {
      const r = await this.m.svc.api(`/api/groups/${this.gid}/chat`);
      const sig = JSON.stringify(r.messages.map(x => [x.id, x.reacts.map(y => y.e + y.n)]));
      if (sig !== this.sig) { this.sig = sig; this.msgs = r.messages; this.me = r.me; this.drawChat(r.messages, r.me, first); }
    } catch { /* offline: riprova al prossimo giro */ }
    this.busy = false;
  }

  drawChat(msgs, me, forceBottom) {
    const box = this.el.querySelector('#chat-list'); if (!box) return;
    const atBottom = forceBottom || (box.scrollHeight - box.scrollTop - box.clientHeight < 140);
    const link = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
    let day = '', h = '', prev = null;
    msgs.forEach((m, i) => {
      const dl = dayLabel(m.ts); if (dl !== day) { day = dl; prev = null; h += `<div class="chat-day"><span>${esc(dl)}</span></div>`; }
      const mine = m.userId === me, first = !prev || prev.userId !== m.userId || m.ts - prev.ts > 5 * 60e3, next = msgs[i + 1];
      const last = !next || next.userId !== m.userId || next.ts - m.ts > 5 * 60e3 || dayLabel(next.ts) !== day;
      const col = hue(m.userId);
      h += `<div class="mrow ${mine ? 'me' : 'ot'}${first ? ' first' : ''}${last ? ' last' : ''}">${mine ? '' : (last ? `<span class="av" style="background:${col}">${esc((m.name || '?')[0].toUpperCase())}</span>` : '<span class="av gap"></span>')}
        <div class="msg ${mine ? 'me' : 'ot'}" data-mid="${m.id}">${mine || !first ? '' : `<small class="who" style="color:${col}">${esc(m.name)}</small>`}
        ${m.reply ? `<div class="quote" data-jump="${esc(m.reply.id)}"><b>${esc(m.reply.name)}</b><span>${m.reply.photo && !m.reply.text ? '📷 Foto' : esc(m.reply.text)}</span></div>` : ''}
        ${m.img ? `<img data-img="${esc(m.img)}" alt="foto" class="chat-img">` : ''}
        ${m.text ? `<div class="tx">${link(m.text)}</div>` : ''}
        <small class="tm">${hhmm(m.ts)}${mine ? ' <i>✓</i>' : ''}</small>
        ${m.reacts.length ? `<div class="reacts">${m.reacts.map(r => `<button data-react="${r.e}" class="${r.mine ? 'mine' : ''}" title="${esc(r.who.join(', '))}">${r.e}${r.n > 1 ? ' ' + r.n : ''}</button>`).join('')}</div>` : ''}</div></div>`;
      prev = m;
    });
    box.innerHTML = h || '<p class="empty">Nessun messaggio: scrivi tu il primo!</p>';
    box.querySelectorAll('img[data-img]').forEach(img => this.loadImg(img));
    if (atBottom) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
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
