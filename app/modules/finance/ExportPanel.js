import { serialToDate } from './LavoroBook.js';
import { dayHours } from './WorkView.js';
import { buildXlsx } from '../../ui/xlsxWriter.js';
import { dateFieldHTML, bindDateFields, readDate } from '../../ui/dateField.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmtNum = n => String(Math.round(n * 100) / 100).replace('.', ',');
const fmtIso = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const isoOf = v => serialToDate(v).toISOString().slice(0, 10);

/** I due registri ore gia' presenti nella scheda ORE LAVORO (colonne data / ore giornata). */
const SOURCES = [
  { id: 'switch', name: 'Switch Evolution', dateCol: 'C', hoursCol: 'H', r1: 4, r2: 1000 },
  { id: 'cantiere', name: 'Cantiere', dateCol: 'K', hoursCol: 'P', r1: 4, r2: 1000 }
];
const SHEET = 1; // indice della scheda ORE LAVORO

/**
 * "Esporta ore": come nell'artefatto Lavoro. Scegli i lavori (Switch Evolution, Cantiere
 * e quelli che aggiungi tu), un periodo facoltativo, poi genera il testo da copiare/condividere
 * oppure scarica il file Excel. I lavori aggiunti a mano e le scelte sono salvati per utente.
 */
export class ExportPanel {
  constructor({ book, onClose }) { this.book = book; this.onClose = onClose; this.st = book.st; }

  open() {
    this.el = document.createElement('div');
    this.el.className = 'xp';
    this.el.innerHTML = `<div class="xp-head"><button class="xp-x" aria-label="Chiudi">✕</button><b>Esporta ore</b><span style="width:42px"></span></div><div class="xp-body"></div>`;
    document.body.appendChild(this.el);
    this.el.querySelector('.xp-x').onclick = () => this.close();
    this.body = this.el.querySelector('.xp-body');
    this.render();
  }

  close() { this.el.remove(); this.onClose?.(); }
  save() { this.book.commit(); }

  items() {
    const base = this.book.legacyHours() ? SOURCES.map(s => ({ ...s, custom: false })) : this.st.work.jobs.map(j => ({ id: 'w:' + j.id, name: j.name, custom: false, native: j }));
    return [...base, ...Object.keys(this.st.jobs).map(id => ({ id, name: this.st.jobs[id].name, custom: true }))];
  }

  render() {
    const st = this.st, items = this.items();
    this.body.innerHTML = `
      <h2 class="s">Lavori</h2>
      <div class="lst">${items.map(it => {
        const on = !!st.exp.sel[it.id];
        return `<div class="it xrow"><button class="xck" data-sel="${it.id}"><span class="xbox${on ? ' on' : ''}">${on ? '✓' : ''}</span><span class="xname">${esc(it.name)}</span></button>${it.custom ? `<span class="xacts"><button data-ent="${it.id}">Voci</button><button data-deljob="${it.id}">Elimina</button></span>` : ''}</div>`;
      }).join('')}</div>
      <button class="add" id="xaddjob">+ Aggiungi lavoro</button>
      <h2 class="s">Periodo (facoltativo)</h2>
      <div class="xdates"><label><span>Da</span>${dateFieldHTML({ iso: st.exp.from, attrs: 'id="xfrom"' })}</label><label><span>A</span>${dateFieldHTML({ iso: st.exp.to, attrs: 'id="xto"' })}</label></div>
      <em id="xdm" class="xmsg"></em>
      <button class="xbtn" id="xgen">Genera testo da copiare/condividere</button>
      <button class="xbtn xoutline" id="xxls">Scarica come Excel (.xlsx)</button><em id="xxlsm" class="xmsg"></em>`;
    bindDateFields(this.body);
    const b = this.body;
    b.querySelectorAll('[data-sel]').forEach(x => x.onclick = () => { const id = x.dataset.sel; st.exp.sel[id] = !st.exp.sel[id]; this.save(); this.render(); });
    b.querySelectorAll('[data-ent]').forEach(x => x.onclick = () => this.entries(x.dataset.ent));
    b.querySelectorAll('[data-deljob]').forEach(x => x.onclick = () => {
      const id = x.dataset.deljob;
      if (!confirm(`Eliminare «${st.jobs[id].name}»? Tutte le voci di questo lavoro verranno cancellate.`)) return;
      delete st.jobs[id]; delete st.exp.sel[id]; this.save(); this.render();
    });
    b.querySelector('#xaddjob').onclick = () => this.newJob();
    const period = (id, key) => {
      const inp = b.querySelector(id);
      inp.addEventListener('change', () => {
        const iso = readDate(inp);
        inp.classList.toggle('invalid', iso === null);
        if (iso !== null) { st.exp[key] = iso; this.save(); }
      });
    };
    period('#xfrom', 'from'); period('#xto', 'to');
    b.querySelector('#xgen').onclick = () => { if (this.periodOk()) this.showText(this.buildText()); };
    b.querySelector('#xxls').onclick = () => { if (this.periodOk()) this.downloadExcel(); };
  }

  periodOk() {
    const f = readDate(this.body.querySelector('#xfrom')), t = readDate(this.body.querySelector('#xto'));
    const msg = this.body.querySelector('#xdm');
    if (f === null || t === null) { msg.textContent = 'Scrivi le date nel formato gg/mm/aaaa (oppure lasciale vuote).'; return false; }
    msg.textContent = ''; return true;
  }

  // ---------- raccolta dati ----------
  groups() {
    const { from, to } = this.st.exp, inR = iso => (!from || iso >= from) && (!to || iso <= to), bk = this.book, out = [];
    for (const it of this.items()) {
      if (!this.st.exp.sel[it.id]) continue;
      const rows = []; let tot = 0;
      if (it.native) {
        for (const r of it.native.rows) {
          const ore = dayHours(r); if (!ore || !r.d || !inR(r.d)) continue;
          const t = v => { if (!v) return ''; const [h, m] = v.split(':').map(Number); return h + (m || 0) / 60; };
          rows.push({ iso: r.d, entM: t(r.a), pauM: t(r.b), entP: t(r.c), uscP: t(r.e), ore, nota: r.note || '' }); tot += ore;
        }
      } else if (!it.custom) {
        const s = bk.sheets[SHEET];
        for (let r = it.r1; r <= Math.min(it.r2, s.maxRow); r++) {
          const dv = bk.val(SHEET, it.dateCol + r); if (typeof dv !== 'number') continue;
          const hv = bk.val(SHEET, it.hoursCol + r); if (typeof hv !== 'number' || hv === 0) continue;
          const iso = isoOf(dv); if (!inR(iso)) continue;
          const colOf = off => { const v = bk.val(SHEET, bk.nc(bk.cn(it.dateCol) + off) + r); return typeof v === 'number' ? v : ''; };
          rows.push({ iso, entM: colOf(1), pauM: colOf(2), entP: colOf(3), uscP: colOf(4), ore: hv, nota: it.dateCol === 'C' ? (s.cells['I' + r] || '') : '' });
          tot += hv;
        }
      } else {
        (this.st.jobs[it.id].rows || []).forEach(r => { if (!r.ore || !inR(r.d)) return; rows.push({ iso: r.d, ore: Number(r.ore), nota: r.note || '' }); tot += Number(r.ore); });
      }
      if (rows.length) out.push({ name: it.name, custom: it.custom, rows, tot });
    }
    return out;
  }

  buildText() {
    const gs = this.groups(); if (!gs.length) return '';
    const parts = gs.map(g => `${g.name}\n${g.rows.map(r => `${fmtIso(r.iso)}: ${fmtNum(r.ore)} h${g.custom && r.nota ? ` (${r.nota})` : ''}`).join('\n')}\nTotale ${g.name}: ${fmtNum(g.tot)} h`);
    let out = parts.join('\n\n');
    if (gs.length > 1) out += `\n\nTotale complessivo: ${fmtNum(gs.reduce((a, g) => a + g.tot, 0))} h`;
    return out;
  }

  // ---------- finestrelle ----------
  modal(title, bodyHtml, buttons) {
    const ov = document.createElement('div'); ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal"><h3>${esc(title)}</h3>${bodyHtml}<div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.c || ''}" data-i="${i}">${b.l}</button>`).join('')}</div></div>`;
    document.body.appendChild(ov); bindDateFields(ov);
    const close = () => ov.remove();
    ov.querySelectorAll('[data-i]').forEach(el => el.onclick = () => buttons[el.dataset.i].f(close, ov));
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    return ov;
  }

  newJob() {
    this.modal('Nuovo lavoro', '<label class="fl"><span>Nome</span><input id="xnj" type="text" autocomplete="off"><em id="xnjm"></em></label>', [
      { l: 'Annulla', f: c => c() },
      { l: 'Crea', c: 'primary', f: (c, ov) => {
        const nm = ov.querySelector('#xnj').value.trim();
        if (!nm) { ov.querySelector('#xnjm').textContent = 'Scrivi un nome'; return; }
        const id = 'j' + Date.now() + Math.floor(Math.random() * 1000);
        this.st.jobs[id] = { name: nm, rows: [] }; this.st.exp.sel[id] = true; this.save(); c(); this.render();
      } }
    ]);
  }

  entries(jobId) {
    const job = this.st.jobs[jobId];
    const list = job.rows.map((r, i) => `<div class="it ln" data-edit="${i}"><span>${esc(fmtIso(r.d))}</span><b>${esc(fmtNum(r.ore))} h${r.note ? ' · ' + esc(r.note) : ''}</b></div>`).join('') || '<p class="empty" style="margin:0">Nessuna voce.</p>';
    const ov = this.modal(job.name, `<div class="lst">${list}</div><button class="add" id="xaddrow">+ Aggiungi voce</button>`, [{ l: 'Chiudi', f: c => { c(); this.render(); } }]);
    ov.querySelector('#xaddrow').onclick = () => { ov.remove(); this.editEntry(jobId, null); };
    ov.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => { ov.remove(); this.editEntry(jobId, +el.dataset.edit); });
  }

  editEntry(jobId, idx) {
    const job = this.st.jobs[jobId], r = idx != null ? job.rows[idx] : { d: '', ore: '', note: '' };
    const body = `<label class="fl"><span>Data</span>${dateFieldHTML({ iso: r.d, attrs: 'id="fd"' })}</label>
      <label class="fl"><span>Ore</span><input id="fo" type="text" inputmode="decimal" value="${r.ore !== '' && r.ore != null ? fmtNum(r.ore) : ''}"></label>
      <label class="fl"><span>Nota (facoltativa)</span><input id="fn" type="text" value="${esc(r.note || '')}"></label><em id="fm" class="xmsg" style="color:#c0392b"></em>`;
    this.modal(idx != null ? 'Modifica voce' : 'Nuova voce', body, [
      { l: 'Annulla', f: c => { c(); this.entries(jobId); } },
      ...(idx != null ? [{ l: 'Elimina', c: 'danger', f: c => { job.rows.splice(idx, 1); this.save(); c(); this.entries(jobId); } }] : []),
      { l: 'Salva', c: 'primary', f: (c, ov) => {
        const d = readDate(ov.querySelector('#fd')), os = ov.querySelector('#fo').value.trim().replace(',', '.'), n = ov.querySelector('#fn').value.trim(), m = ov.querySelector('#fm');
        if (!d) { m.textContent = 'Inserisci una data valida (gg/mm/aaaa)'; return; }
        if (os === '' || isNaN(Number(os))) { m.textContent = 'Inserisci un numero di ore valido'; return; }
        const row = { d, ore: Number(os), note: n };
        if (idx != null) job.rows[idx] = row; else job.rows.push(row);
        job.rows.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
        this.save(); c(); this.entries(jobId);
      } }
    ]);
  }

  showText(text) {
    if (!text) { this.modal('Esportazione', '<p style="margin:0 0 12px;color:var(--mu)">Nessun dato nel periodo o nei lavori selezionati.</p>', [{ l: 'Chiudi', f: c => c() }]); return; }
    const ov = this.modal('Esportazione', `<textarea id="xo" readonly rows="14"></textarea><em class="xmsg" id="xom"></em>`, [
      { l: 'Chiudi', f: c => c() },
      { l: 'Copia', f: () => { const t = ov.querySelector('#xo'); t.select(); try { navigator.clipboard.writeText(text); } catch { document.execCommand?.('copy'); } ov.querySelector('#xom').textContent = 'Copiato'; } },
      ...(navigator.share ? [{ l: 'Condividi', c: 'primary', f: () => { navigator.share({ text }).catch(() => {}); } }] : [])
    ]);
    ov.querySelector('#xo').value = text;
  }

  // ---------- Excel ----------
  downloadExcel() {
    const msg = this.body.querySelector('#xxlsm'); msg.textContent = '';
    const gs = this.groups();
    if (!gs.length) { msg.textContent = 'Nessun dato nel periodo o nei lavori selezionati.'; return; }
    const used = new Set(), sheets = [];
    const sheetName = n => { let s = n.replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'Foglio', b = s, i = 2; while (used.has(s)) { s = (b.slice(0, 28) + ' ' + i).slice(0, 31); i++; } used.add(s); return s; };
    if (gs.length > 1) sheets.push({ name: sheetName('Riepilogo'), widths: [28, 14], rows: [['Lavoro', 'Totale ore'], ...gs.map(g => [g.name, g.tot]), ['Totale complessivo', gs.reduce((a, g) => a + g.tot, 0)]] });
    for (const g of gs) {
      if (!g.custom) sheets.push({ name: sheetName(g.name), widths: [11, 15, 13, 17, 16, 12, 30], rows: [['Giorno', 'Entrata mattina', 'Pausa mattina', 'Entrata pomeriggio', 'Uscita pomeriggio', 'Ore giornata', 'Note'], ...g.rows.map(r => [fmtIso(r.iso), r.entM, r.pauM, r.entP, r.uscP, r.ore, r.nota]), ['Totale', '', '', '', '', g.tot, '']] });
      else sheets.push({ name: sheetName(g.name), widths: [11, 10, 30], rows: [['Giorno', 'Ore', 'Note'], ...g.rows.map(r => [fmtIso(r.iso), r.ore, r.nota]), ['Totale', g.tot, '']] });
    }
    const blob = buildXlsx(sheets);
    const a = document.createElement('a'), d = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob); a.download = `Ore lavoro ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    msg.textContent = 'File scaricato.';
  }
}
