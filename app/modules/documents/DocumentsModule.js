import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { SharedRepository } from '../../core/GroupService.js';
import { dateFieldHTML, bindDateFields, readDate } from '../../ui/dateField.js';
import { DocumentItem } from './DocumentItem.js';
import { daysUntil, fmtShort } from '../../core/dates.js';

const CATEGORY = { identita: 'Identità', auto: 'Auto', casa: 'Casa', salute: 'Salute', lavoro: 'Lavoro', fisco: 'Fisco e banche', altro: 'Altro' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const uid = () => Math.random().toString(36).slice(2, 8);
const MAX_PDF = 1500000, MAX_FILES = 6;

/** Riduce una foto (max 1200 px, JPEG) per non riempire lo spazio dell'account. */
function shrink(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = ko; img.src = url;
  });
}
const readAsUrl = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });

function chip(item) {
  if (!item.expiry) return '';
  const n = daysUntil(item.expiry);
  if (n < 0) return `<em class="chip bad">scaduto ${fmtShort(item.expiry)}</em>`;
  if (n === 0) return '<em class="chip bad">scade oggi</em>';
  if (n <= 30) return `<em class="chip soon">tra ${n} g</em>`;
  return `<em class="chip">scade ${fmtShort(item.expiry)}</em>`;
}

/** Archivio > Documenti: schede con scadenza, testo scritto nell'app (scaricabile) e foto/PDF allegati. */
class DocumentsView extends Component {
  constructor(m) { super(); this.m = m; this.filter = 'all'; this.q = ''; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <div class="an-bar"><input type="search" class="an-search" placeholder="Cerca documenti…" aria-label="Cerca"><button class="btn primary" data-act="add">+ Nuovo</button></div>
      <div class="an-chips"><button data-f="all">Tutti</button><button data-f="soon">In scadenza</button><button data-f="expired">Scaduti</button></div>
      <div class="module-list"></div><p class="empty" hidden>Nessun documento: aggiungi patente, assicurazioni, contratti… anche con foto o PDF.</p>`;
    this.list = el.querySelector('.module-list'); this.empty = el.querySelector('.empty');
    el.querySelector('[data-act=add]').onclick = () => this.form(null);
    el.querySelector('.an-search').oninput = e => { this.q = e.target.value.toLowerCase(); this.draw(); };
    el.querySelector('.an-chips').onclick = e => { const f = e.target.closest('[data-f]')?.dataset.f; if (f) { this.filter = f; this.draw(); } };
    this.list.onclick = e => { const r = e.target.closest('[data-i]'); if (r) this.form(this.shown[+r.dataset.i]); };
    return el;
  }

  async afterMount() { this.items = await this.m.repo.getAll(); this.draw(); if (this.m.app?.consumeQuick?.('documents')) this.form(null); }

  draw() {
    this.el.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === this.filter));
    const q = this.q;
    this.shown = this.m.sort(this.items).filter(d => {
      const n = d.expiry ? daysUntil(d.expiry) : null;
      if (this.filter === 'soon' && !(n !== null && n >= 0 && n <= 30)) return false;
      if (this.filter === 'expired' && !(n !== null && n < 0)) return false;
      return !q || [d.title, d.notes, d.text, CATEGORY[d.category]].some(x => String(x || '').toLowerCase().includes(q));
    });
    this.list.innerHTML = this.shown.map((d, i) => `<button class="row" data-i="${i}"><span class="t">${esc(d.title) || '(senza titolo)'}<small>${CATEGORY[d.category] || ''}${d.files.length ? ` · 📎 ${d.files.length}` : ''}${d.text ? ' · 📝' : ''}${d.groupName ? ' · 👥 ' + esc(d.groupName) : ''}</small></span><span class="m">${chip(d)}</span></button>`).join('');
    this.empty.hidden = this.shown.length > 0;
  }

  async form(item) {
    if (item && !item.canEdit) { alert('Questo documento è stato creato da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarlo.'); return; }
    const share = await this.m.groups?.shareField();
    const d = new DocumentItem(item ? JSON.parse(JSON.stringify(item)) : {});
    d.canEdit = true;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal"><h3>${item ? 'Modifica documento' : 'Nuovo documento'}</h3>
      <label class="field"><span>Nome</span><input name="title" type="text" value="${esc(d.title)}"></label>
      <label class="field"><span>Tipo</span><select name="category">${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}"${k === d.category ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Scadenza (se c’è)</span>${dateFieldHTML({ iso: d.expiry, name: 'expiry' })}</label>
      <label class="field"><span>Dove si trova / note</span><textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>
      <label class="field"><span>Testo del documento (come un file di testo)</span><textarea name="text" rows="5">${esc(d.text)}</textarea></label>
      <div class="doc-files"></div>
      <div class="doc-add"><label class="btn">📷 Foto<input type="file" accept="image/*" capture="environment" hidden data-pick></label><label class="btn">🖼 Immagine/PDF<input type="file" accept="image/*,application/pdf" multiple hidden data-pick></label><button type="button" class="btn" data-act="txt">⬇ Scarica .txt</button></div>
      ${share ? `<label class="field"><span>${esc(share.label)}</span><select name="groupId">${share.options.map(o => `<option value="${esc(o.value)}"${o.value === (item?.groupId || '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>` : ''}
      <div class="modal-actions"><button type="button" class="btn" data-act="cancel">Annulla</button>${item ? '<button type="button" class="btn danger" data-act="delete">Elimina</button>' : ''}<button type="button" class="btn primary" data-act="save">Salva</button></div></div>`;
    document.body.appendChild(overlay);
    bindDateFields(overlay);
    const q = s => overlay.querySelector(s), close = () => overlay.remove();
    const files = () => { q('.doc-files').innerHTML = d.files.map((f, i) => `<div class="doc-f">${f.type.startsWith('image/') ? `<img src="${f.data}" alt="">` : '<span class="pdf">PDF</span>'}<a href="${f.data}" target="_blank" rel="noopener" download="${esc(f.name)}">${esc(f.name)}</a><button type="button" data-rm="${i}" aria-label="Togli">✕</button></div>`).join(''); };
    files();
    overlay.addEventListener('click', async e => {
      if (e.target === overlay) return close();
      const t = e.target;
      if (t.closest('[data-rm]')) { d.files.splice(+t.closest('[data-rm]').dataset.rm, 1); return files(); }
      if (t.closest('[data-act=cancel]')) return close();
      if (t.closest('[data-act=txt]')) {
        const body = `${q('[name=title]').value}\n\n${q('[name=notes]').value}\n\n${q('[name=text]').value}`.trim();
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = (q('[name=title]').value || 'documento') + '.txt'; a.click(); return;
      }
      if (t.closest('[data-act=delete]')) { if (!confirm('Eliminare questo documento?')) return; await this.m.repo.delete(item.id); close(); this.items = await this.m.repo.getAll(); return this.draw(); }
      if (t.closest('[data-act=save]')) {
        const exp = readDate(q('[name=expiry]')); q('[name=expiry]').classList.toggle('invalid', exp === null); if (exp === null) return;
        const doc = new DocumentItem({ ...(item || {}), title: q('[name=title]').value.trim() || 'Documento', category: q('[name=category]').value, expiry: exp, notes: q('[name=notes]').value, text: q('[name=text]').value, files: d.files, groupId: q('[name=groupId]')?.value ?? item?.groupId ?? '' });
        await this.m.repo.save(doc); close(); this.items = await this.m.repo.getAll(); this.draw();
      }
    });
    overlay.querySelectorAll('[data-pick]').forEach(inp => inp.addEventListener('change', async () => {
      for (const f of [...inp.files]) {
        if (d.files.length >= MAX_FILES) { alert(`Massimo ${MAX_FILES} allegati per documento.`); break; }
        try {
          if (f.type.startsWith('image/')) d.files.push({ name: f.name || 'foto.jpg', type: 'image/jpeg', data: await shrink(f) });
          else if (f.type === 'application/pdf') { if (f.size > MAX_PDF) { alert('Il PDF è troppo grande (max 1,5 MB).'); continue; } d.files.push({ name: f.name, type: f.type, data: await readAsUrl(f) }); }
          else alert('Sono ammessi solo foto, immagini e PDF.');
        } catch { alert('Non riesco a leggere questo file.'); }
      }
      inp.value = ''; files();
    }));
  }
}

export class DocumentsModule extends Module {
  constructor({ storage, groups }) {
    super({ id: 'documents', name: 'Documenti' });
    this.groups = groups;
    this.repo = new SharedRepository(storage, 'documents', DocumentItem, groups);
    this.EntryClass = DocumentItem;
  }

  async getView() { this.repo.invalidate?.(); return new DocumentsView(this); }

  sort(items) { return items.slice().sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.title.localeCompare(b.title)); }
}
