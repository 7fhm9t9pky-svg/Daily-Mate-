import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { SharedRepository } from '../../core/GroupService.js';
import { AlertItem, REPEATS, COLORS, nextDate } from './AlertItem.js';
import { NoteItem } from './NoteItem.js';
import { daysUntil, fmtShort, relative, todayIso } from '../../core/dates.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const uid = () => Math.random().toString(36).slice(2, 8);
const hit = (q, ...parts) => !q || parts.some(p => String(p || '').toLowerCase().includes(q));
const sortAlerts = items => items.slice().sort((a, b) => (a.done - b.done) || (b.pinned - a.pinned) || (a.date || '9999').localeCompare(b.date || '9999'));

/** Pagina Avvisi: due schede, "Avvisi" (scadenze con data, anche ripetute) e "Note" (testo o elenchi con spunte). */
class AlertsView extends Component {
  constructor(m) { super(); this.m = m; this.tab = 'alerts'; this.q = ''; this.filter = 'todo'; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <div class="cal-tabs"><button data-tab="alerts">Avvisi</button><button data-tab="notes">Note</button></div>
      <div class="an-bar"><input type="search" class="an-search" placeholder="Cerca…" aria-label="Cerca"><button class="btn primary" data-act="add">+ Nuovo</button></div>
      <div class="an-chips"></div>
      <div class="an-body"></div>`;
    this.body = el.querySelector('.an-body'); this.chips = el.querySelector('.an-chips');
    el.querySelector('.an-search').addEventListener('input', e => { this.q = e.target.value.trim().toLowerCase(); this.draw(); });
    el.addEventListener('click', e => this.#click(e));
    return el;
  }

  async afterMount() { await this.draw(); }

  async #click(e) {
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.el.querySelector('.an-search').value = ''; this.q = ''; return this.draw(); }
    const f = t.closest('[data-filter]'); if (f) { this.filter = f.dataset.filter; return this.draw(); }
    if (t.closest('[data-act=add]')) return this.tab === 'alerts' ? this.alertForm(null) : this.noteForm(null);
    const tg = t.closest('[data-toggle]');
    if (tg) { const a = this.alerts.find(x => x.id === tg.dataset.toggle); if (a?.canEdit) await this.m.toggle(a); return this.draw(); }
    const ck = t.closest('[data-check]');
    if (ck) { const [nid, iid] = ck.dataset.check.split('|'); const n = this.notes.find(x => x.id === nid); const it = n?.items.find(x => x.id === iid); if (n?.canEdit && it) { it.done = !it.done; await this.m.notes.save(n); } return this.draw(); }
    const ar = t.closest('[data-alert]'); if (ar) return this.alertForm(this.alerts.find(x => x.id === ar.dataset.alert));
    const nr = t.closest('[data-note]'); if (nr) return this.noteForm(this.notes.find(x => x.id === nr.dataset.note));
  }

  async draw() {
    this.el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.el.querySelector('[data-act=add]').textContent = this.tab === 'alerts' ? '+ Nuovo avviso' : '+ Nuova nota';
    if (this.tab === 'alerts') await this.#drawAlerts(); else await this.#drawNotes();
  }

  async #drawAlerts() {
    this.alerts = await this.m.repo.getAll();
    this.chips.innerHTML = [['todo', 'Da fare'], ['done', 'Fatti'], ['all', 'Tutti']].map(([k, l]) => `<button data-filter="${k}" class="${this.filter === k ? 'on' : ''}">${l}</button>`).join('');
    const list = sortAlerts(this.alerts.filter(a => (this.filter === 'all' || (this.filter === 'done') === a.done) && hit(this.q, a.title, a.notes)));
    this.body.innerHTML = `<div class="module-list">${list.map(a => this.#alertRow(a)).join('')}</div>` + (list.length ? '' : `<p class="empty">${this.q ? 'Nessun avviso trovato.' : this.filter === 'done' ? 'Nessun avviso fatto.' : 'Nessun avviso: aggiungi una scadenza con “+ Nuovo avviso”.'}</p>`);
  }

  #alertRow(a) {
    let cls = '';
    if (!a.done && a.date) { const n = daysUntil(a.date); if (n < 0) cls = 'warn'; else if (n <= 7) cls = 'soon'; }
    const rep = REPEATS.find(r => r[0] === a.repeat);
    return `<div class="row ar" data-alert="${a.id}"${a.color ? ` style="border-left:5px solid ${a.color}"` : ''}>
      <span class="box${a.done ? ' on' : ''}" data-toggle="${a.id}" aria-label="Fatto">${a.done ? '✓' : ''}</span>
      <span class="t${a.done ? ' done' : ''}">${a.pinned ? '📌 ' : ''}${esc(a.title) || '(senza titolo)'}${a.repeat !== 'none' ? ` <em class="chip">🔁 ${esc(rep?.[1] || '')}</em>` : ''}${a.notes ? `<small>${esc(a.notes.slice(0, 70))}</small>` : ''}${a.groupName ? `<small>👥 ${esc(a.groupName)}</small>` : ''}</span>
      <span class="m ${cls}">${fmtShort(a.date)}<br>${a.done ? '' : relative(a.date)}</span></div>`;
  }

  async #drawNotes() {
    this.notes = await this.m.notes.getAll();
    this.chips.innerHTML = '';
    const list = this.notes.filter(n => hit(this.q, n.title, n.text, ...n.items.map(i => i.t))).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const card = n => {
      const open = n.items.filter(i => !i.done).length, c = n.color;
      const body = n.mode === 'list'
        ? `<div class="nt-l">${n.items.slice(0, 7).map(i => `<div class="nt-i${i.done ? ' d' : ''}"><span class="box${i.done ? ' on' : ''}" data-check="${n.id}|${i.id}">${i.done ? '✓' : ''}</span><span>${esc(i.t)}</span></div>`).join('')}${n.items.length > 7 ? `<small>+ altre ${n.items.length - 7}</small>` : ''}</div><small class="nt-p">${n.items.length - open}/${n.items.length} fatte</small>`
        : `<p class="nt-t">${esc(n.text.slice(0, 220))}</p>`;
      return `<div class="nt" data-note="${n.id}"${c ? ` style="--nc:${c}"` : ''}><h4>${n.pinned ? '📌 ' : ''}${esc(n.title) || (n.mode === 'list' ? 'Elenco' : 'Nota')}</h4>${body}${n.groupName ? `<small>👥 ${esc(n.groupName)}</small>` : ''}</div>`;
    };
    this.body.innerHTML = list.length ? `<div class="nt-g">${list.map(card).join('')}</div>` : `<p class="empty">${this.q ? 'Nessuna nota trovata.' : 'Nessuna nota. Con “+ Nuova nota” scrivi un appunto o crei un elenco con le spunte (spesa, cose da fare…).'}</p>`;
  }

  // ---------------- avvisi: creazione / modifica
  async alertForm(item) {
    if (item && !item.canEdit) { alert('Questo avviso è stato creato da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarlo.'); return; }
    const share = await this.m.groups?.shareField();
    const r = await FormModal.open({
      title: item ? 'Modifica avviso' : 'Nuovo avviso',
      fields: [
        { key: 'title', label: 'Avviso', type: 'text' },
        { key: 'date', label: 'Data', type: 'date' },
        { key: 'repeat', label: 'Si ripete?', type: 'select', options: REPEATS.map(([value, label]) => ({ value, label })) },
        { key: 'color', label: 'Colore', type: 'select', options: Object.entries(COLORS).map(([value, label]) => ({ value, label })) },
        { key: 'pinned', label: 'Fissa in alto', type: 'checkbox' },
        { key: 'done', label: 'Fatto', type: 'checkbox' },
        { key: 'notes', label: 'Note', type: 'textarea' },
        ...(share ? [share] : [])
      ],
      values: item ? { ...item } : { date: todayIso(), repeat: 'none', color: '', pinned: false, done: false },
      allowDelete: !!item
    });
    if (!r) return;
    if (r.__delete) await this.m.repo.delete(item.id);
    else {
      const a = new AlertItem({ ...(item || {}), ...r });
      if (!a.title.trim()) a.title = 'Avviso';
      a.anchor = a.repeat === 'monthly' || a.repeat === 'yearly' ? Number((a.date || '').slice(8, 10)) || 0 : 0;
      if (a.repeat !== 'none') a.done = false;      // un avviso ripetuto non resta mai "fatto": passa alla data dopo
      await this.m.repo.save(a);
    }
    await this.draw();
  }

  // ---------------- note: creazione / modifica
  async noteForm(item) {
    if (item && !item.canEdit) { alert('Questa nota è stata creata da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarla.'); return; }
    const share = null;      // le note restano personali
    const n = new NoteItem(item ? JSON.parse(JSON.stringify(item)) : {});
    n.canEdit = true;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const swatches = Object.keys(COLORS).map(c => `<button type="button" class="sw${n.color === c ? ' on' : ''}" data-c="${c}" style="${c ? `background:${c}` : ''}" aria-label="${esc(COLORS[c])}">${c ? '' : '∅'}</button>`).join('');
    overlay.innerHTML = `<div class="modal note-modal"><h3>${item ? 'Modifica nota' : 'Nuova nota'}</h3>
      <label class="field"><span>Titolo</span><input name="title" type="text" value="${esc(n.title)}"></label>
      <div class="cal-tabs nm-mode"><button type="button" data-mode="text">Testo</button><button type="button" data-mode="list">Elenco con spunte</button></div>
      <label class="field nm-text"><span>Testo</span><textarea name="text" rows="6">${esc(n.text)}</textarea></label>
      <div class="nm-list"><div class="nm-rows"></div><button type="button" class="add" data-act="addrow">+ Aggiungi voce</button></div>
      <div class="field"><span>Colore</span><div class="sws">${swatches}</div></div>
      <label class="field checkbox"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}><span>Fissa in alto</span></label>
      ${share ? `<label class="field"><span>${esc(share.label)}</span><select name="groupId">${share.options.map(o => `<option value="${esc(o.value)}"${o.value === (item?.groupId || '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>` : ''}
      <div class="modal-actions"><button type="button" class="btn" data-act="cancel">Annulla</button>${item ? '<button type="button" class="btn danger" data-act="delete">Elimina</button>' : ''}<button type="button" class="btn primary" data-act="save">Salva</button></div></div>`;
    document.body.appendChild(overlay);
    const rows = overlay.querySelector('.nm-rows');
    const drawRows = focusLast => {
      rows.innerHTML = n.items.map(i => `<div class="nm-r" data-id="${i.id}"><span class="box${i.done ? ' on' : ''}" data-chk>${i.done ? '✓' : ''}</span><input type="text" value="${esc(i.t)}" placeholder="Voce"><button type="button" data-del aria-label="Togli">✕</button></div>`).join('');
      if (focusLast) rows.querySelector('.nm-r:last-child input')?.focus();
    };
    const sync = () => rows.querySelectorAll('.nm-r').forEach(r => { const it = n.items.find(x => x.id === r.dataset.id); if (it) it.t = r.querySelector('input').value; });
    const mode = m => { n.mode = m; overlay.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); overlay.querySelector('.nm-text').hidden = m !== 'text'; overlay.querySelector('.nm-list').hidden = m !== 'list'; if (m === 'list' && !n.items.length) { n.items.push({ id: uid(), t: '', done: false }); drawRows(true); } };
    drawRows(); mode(n.mode);
    const close = () => overlay.remove();
    overlay.addEventListener('click', async e => {
      const t = e.target;
      if (t === overlay || t.closest('[data-act=cancel]')) return close();
      const md = t.closest('[data-mode]'); if (md) { sync(); return mode(md.dataset.mode); }
      const sw = t.closest('[data-c]'); if (sw) { n.color = sw.dataset.c; overlay.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === sw)); return; }
      if (t.closest('[data-act=addrow]')) { sync(); n.items.push({ id: uid(), t: '', done: false }); return drawRows(true); }
      const row = t.closest('.nm-r');
      if (row && t.closest('[data-chk]')) { sync(); const it = n.items.find(x => x.id === row.dataset.id); it.done = !it.done; return drawRows(); }
      if (row && t.closest('[data-del]')) { sync(); n.items = n.items.filter(x => x.id !== row.dataset.id); return drawRows(); }
      if (t.closest('[data-act=delete]')) { if (!confirm('Eliminare questa nota?')) return; await this.m.notes.delete(item.id); close(); return this.draw(); }
      if (t.closest('[data-act=save]')) {
        sync();
        const q = s => overlay.querySelector(`[name=${s}]`);
        const data = { ...(item || {}), title: q('title').value.trim(), mode: n.mode, text: q('text').value, items: n.items.filter(i => i.t.trim()), color: n.color, pinned: q('pinned').checked, ...(share ? { groupId: q('groupId').value } : {}) };
        if (!data.title && !data.text.trim() && !data.items.length) return close();     // nota vuota: non la salvo
        const note = new NoteItem(data); note.touch();
        await this.m.notes.save(note); close(); return this.draw();
      }
    });
    overlay.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.nm-r input')) { e.preventDefault(); overlay.querySelector('[data-act=addrow]').click(); } });
  }
}

/** Avvisi (scadenze, anche ripetute) e Note (testo o elenchi con spunte). */
export class AlertsModule extends Module {
  constructor({ storage, groups }) {
    super({ id: 'alerts', name: 'Avvisi' });
    this.groups = groups;
    this.repo = new SharedRepository(storage, 'alerts', AlertItem, groups);
    this.notes = new SharedRepository(storage, 'notes', NoteItem, groups);
  }

  async getView() { this.repo.invalidate?.(); this.notes.invalidate?.(); return new AlertsView(this); }

  /** Segna fatto un avviso; se si ripete passa alla data successiva (e non resta mai "fatto"). */
  async toggle(a) {
    if (a.repeat !== 'none' && a.date && !a.done) a.date = nextDate(a.date, a.repeat, a.anchor);
    else a.done = !a.done;
    await this.repo.save(a);
  }

  /** I prossimi avvisi non ancora fatti (per la Home). */
  async upcoming(limit = 3) {
    return (await this.repo.getAll()).filter(a => !a.done && a.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
  }
}
