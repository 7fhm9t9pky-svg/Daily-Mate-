import { Component } from '../../ui/Component.js';
import { dateFieldHTML, bindDateFields, readDate } from '../../ui/dateField.js';
import { ExportPanel } from './ExportPanel.js';
import { serialToDate, isDateFmt, isFormula, isDependent, todaySerial } from './LavoroBook.js';
import { tileHTML, askNewPage, sheetTitle, sheetVisible } from './FinanceView.js';
import { FormModal } from '../../ui/FormModal.js';
import { reloadKeepingLogin } from '../../core/AuthClient.js';
import { SHEET_HELP } from './labels.js';
import { FIAT, CRYPTO, curLabel, convert } from './wealth.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Dettaglio di UNA scheda del foglio Lavoro: stesse "carte" dell'artefatto
 * (titolo, riquadri, liste, grafici) con la possibilita' di toccare una voce per
 * modificarla, aggiungerne una nuova o eliminarla.
 */
export class SheetView extends Component {
  constructor({ book, index, title, onBack, onSaved, onOpen }) {
    super(); this.onOpen = onOpen;
    this.book = book; this.i = index; this.title = title; this.onBack = onBack; this.onSaved = onSaved;
    this.REG = [];
  }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = `
      <div class="page-head"><button class="back" data-act="back">‹ ${esc(this.#parentName())}</button><h1>${esc(this.title)}</h1></div>
      <div class="sheet-body"></div>`;
    el.querySelector('[data-act="back"]').onclick = () => this.onBack();
    this.body = el.querySelector('.sheet-body');
    this.body.addEventListener('click', e => this.#onClick(e));
    return el;
  }

  async afterMount() { this.refresh(); }

  #parentName() { const p = this.book.parentOf(this.i); return p === null ? 'Finanze' : sheetTitle(this.book, p); }

  // ---------- helpers di lettura ----------
  get s() { return this.book.sheets[this.i]; }
  val(a) { return this.book.val(this.i, a); }
  disp(a) { return this.book.disp(this.i, a); }
  reg(o) { return this.REG.push(o) - 1; }

  #cfClass(col, row, v) {
    if (typeof v !== 'number') return '';
    for (const c of this.s.cf) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(c.rng); if (!m) continue;
      if (col < this.book.cn(m[1]) || col > this.book.cn(m[3]) || row < +m[2] || row > +m[4]) continue;
      const a = +c.f[0], b = +c.f[1];
      if (c.op === 'greaterThan' && v > a) return 'g';
      if (c.op === 'lessThan' && v < a) return 'r';
      if (c.op === 'between' && v >= Math.min(a, b) && v <= Math.max(a, b)) return 'y';
    }
    return '';
  }

  #rowHas(x, r, cols) {
    const s = this.s;
    if (s.cells[x.key + r] != null && s.cells[x.key + r] !== '') return true;
    for (const c of cols) {
      if (c === x.key) continue;
      const raw = s.cells[c + r]; if (raw == null || raw === '') continue;
      if (!isFormula(raw)) return true;
      const v = this.val(c + r); if (v != null && v !== 0 && v !== '') return true;
    }
    return false;
  }

  #freeRow(x, cols) {
    const rmax = Math.min(x.r2, this.s.maxRow);
    for (let r = x.r1; r <= rmax; r++) if (!this.#rowHas(x, r, cols)) return r;
    return null;
  }

  #isLocal(f, a) {
    const row = a.replace(/\D/g, ''); f = f.replace(/"[^"]*"/g, '');
    if (/[!:]/.test(f)) return false;
    return (f.match(/\$?[A-Z]{1,3}\$?\d+/g) || []).every(x => x.replace(/\D/g, '') === row);
  }

  // ---------- disegno ----------
  refresh() {
    this.REG = [];
    const keep = this.el.closest('.app-main')?.scrollTop ?? 0;
    const s = this.s; let h = '';
    if (!this.book.isCustom(this.i) && SHEET_HELP[this.i]) h += `<p class="lead">${esc(SHEET_HELP[this.i])}</p>`;
    for (const x of this.book.layoutFor(this.i)) {
      if (x.t === 'hero') h += this.#hero(x);
      else if (x.t === 'text') h += `<h2 class="s">${esc(this.disp(x.ta))}</h2>`;
      else if (x.t === 'hint') h += `<p class="hint">💡 ${esc(x.text)}</p>`;
      else if (x.t === 'bars') h += this.#bars(x);
      else if (x.t === 'chart') h += this.#chart(this.book.charts[x.i]);
      else if (x.t === 'stats') {
        if (x.title) h += `<h2 class="s">${esc(x.title)}</h2>`;
        h += '<div class="tiles">' + x.items.map((p, j) => this.#tile(p[0], p[1], x.big && j === 0)).join('') + '</div>';
      } else if (x.t === 'kv') {
        h += `<h2 class="s">${esc(this.disp(x.ta))}</h2><div class="tiles">`;
        for (let c = this.book.cn(x.c1); c <= this.book.cn(x.c2); c++) h += this.#tile(this.book.nc(c) + x.hr, this.book.nc(c) + x.vr, x.big && c === this.book.cn(x.c1));
        h += '</div>';
      } else if (x.t === 'list') h += this.#list(x);
    }
    if (this.i === 1) h = '<button class="xbtn" data-export="1">⇪ Esporta ore</button>' + h + '<button class="add" data-tonew="1">Passa al nuovo sistema ore (nomi e paga scelti da te)</button>';
    const kids = this.book.childrenOf(this.i).filter(x => sheetVisible(this.book, x));
    h += `<h2 class="s">Sottopagine</h2><div class="sheet-grid">${kids.map(x => tileHTML(this.book, x)).join('')}<button class="sheet-tile add-tile" data-newsub="1"><h3>＋ Nuova sottopagina</h3><div class="k">Aggiungi una pagina dentro questa</div></button></div>`;
    if (this.book.isCustom(this.i)) h += `<button class="add" data-editpage="1">✎ Rinomina o elimina questa pagina</button>`;
    this.body.innerHTML = h || `<p class="empty">Questa scheda è vuota.</p>`;
    const sc = this.el.closest('.app-main'); if (sc) sc.scrollTop = keep;
    void s;
  }

  #hero(x) {
    const name = this.book.app?.displayName?.() || '';
    const txt = this.i === 0 && name ? `Ciao ${name}` : this.disp(x.ta);
    const id = this.reg({ f: [x.ta], lab: { [x.ta]: 'Titolo' } });
    return `<div class="hero" data-k="${id}"><h1>${esc(txt)}</h1></div>`;
  }

  #bars(x) {
    const bk = this.book;
    const rows = x.items.map(([la, a]) => ({ l: this.disp(la), v: bk.num(this.i, a) || 0, t: this.disp(a) }));
    const mx = x.max ? (bk.num(this.i, x.max) || 0) : Math.max(0, ...rows.map(r => r.v));
    const vis = x.max ? rows : rows.filter(r => r.v > 0);
    if (!vis.length || mx <= 0) return '';
    return (x.title ? `<h2 class="s">${esc(x.title)}</h2>` : '') + '<div class="bars">' + vis.map(r =>
      `<div class="bar"><div class="bl"><span>${esc(r.l)}</span><b>${esc(r.t)}</b></div><div class="bt"><i style="width:${Math.max(2, Math.min(100, r.v / mx * 100))}%"></i></div></div>`).join('') + '</div>';
  }

  #tile(la, a, big) {
    if (this.#locked(a, null)) {          // calcolo automatico: si vede ma non si tocca
      return `<div class="tl auto${big ? ' big' : ''}"><small>${esc(la ? this.disp(la) : '')}</small><b>${esc(this.disp(a)) || '—'}</b></div>`;
    }
    const id = this.reg({ f: [a], lab: { [a]: la ? this.disp(la) : a } });
    return `<div class="tl${big ? ' big' : ''}" data-k="${id}"><small>${esc(la ? this.disp(la) : '')}</small><b>${esc(this.disp(a)) || '—'}</b></div>`;
  }

  #list(x) {
    const s = this.s, bk = this.book;
    const c1 = bk.cn(x.c1), c2 = bk.cn(x.c2), cols = [];
    for (let c = c1; c <= c2; c++) cols.push(bk.nc(c));
    const hd = c => x.labels && x.labels[c] ? x.labels[c] : (x.hr ? this.disp(c + x.hr) : '');
    const lab = {};
    cols.forEach(c => lab[c] = (x.flab && x.flab[c]) || hd(c) || (c === x.key ? 'Voce' : 'Valore'));
    const top = x.ta ? this.disp(x.ta) : x.title || '';
    let h = top ? `<h2 class="s">${esc(top)}</h2>` : '';
    const cap = x.hr && hd(x.key) && hd(x.key) !== top ? hd(x.key) : '';
    h += '<div class="lst">';
    const rmax = Math.min(x.r2, s.maxRow);
    let rowsN = []; for (let r = x.r1; r <= rmax; r++) if (this.#rowHas(x, r, cols)) rowsN.push(r);
    if (x.sortKey) rowsN.sort((p, q) => { const a = this.val(x.key + p), b = this.val(x.key + q); return (typeof a === 'number' ? a : 1e9) - (typeof b === 'number' ? b : 1e9) || p - q; });
    for (const r of rowsN) {
      const flds = cols.map(c => c + r), kv = bk.shown(this.i, x.key + r);
      const chips = cols.filter(c => c !== x.key).map(c => {
        const a = c + r, raw = s.cells[a], v = this.val(a);
        if (v == null || v === '') return null;
        if (isFormula(raw) && v === 0) return null;
        const cl = (x.cf ? this.#cfClass(bk.cn(c), r, v) : '') || '';
        return { c, txt: bk.inCur(this.i, a, v) ?? bk.fmt(v, s.fmt[a]), cl: cl + (v instanceof bk.Err ? ' e' : ''), l: typeof v === 'string' && v.length > 22 };
      }).filter(Boolean);
      const id = this.reg({ f: flds, lab, title: top || this.title, choices: x.choices });
      const title = bk.fmt(kv, s.fmt[x.key + r]);
      if (chips.length <= 1) h += `<div class="it ln" data-k="${id}"><span>${esc(title) || '—'}</span><b>${chips[0] ? esc(chips[0].txt) : ''}</b></div>`;
      else h += `<div class="it" data-k="${id}">${cap ? `<small>${esc(cap)}</small>` : ''}<h4>${esc(title) || '—'}</h4><div class="gr">${chips.map(k => `<div class="c ${k.cl}${k.l ? ' w' : ''}"><small>${esc(lab[k.c])}</small><b>${esc(k.txt)}</b></div>`).join('')}</div></div>`;
    }
    if (!rowsN.length && x.empty) h += `<p class="empty-s">${esc(x.empty)}</p>`;
    h += '</div>';
    if (this.#freeRow(x, cols) !== null) h += `<button class="add" data-add="${this.reg({ x, cols, lab, top })}">${esc(x.addLabel || (x.years ? '+ Aggiungi anno' : '+ Nuova voce'))}</button>`;
    return h;
  }

  #chart(c) {
    const bk = this.book, s = bk.sheets[c.s], P = [];
    for (let r = c.r1; r <= c.r2; r++) {
      const y = bk.val(c.s, c.yc + r);
      if (typeof y === 'number') P.push([bk.fmt(bk.val(c.s, c.xc + r), c.xf), y]);
    }
    void s;
    if (!P.length) return '';
    const W = 340, H = 190, l = 44, t = 10, b = 24, rr = 10;
    let lo = Math.min(...P.map(p => p[1])), hi = Math.max(...P.map(p => p[1]));
    if (lo === hi) { lo -= 1; hi += 1; }
    const X = i => l + (P.length < 2 ? (W - l - rr) / 2 : i * (W - l - rr) / (P.length - 1)), Y = v => t + (hi - v) * (H - t - b) / (hi - lo);
    const k = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Number(v.toFixed(1))).replace('.', ',');
    let g = '';
    for (let i = 0; i < 4; i++) { const v = lo + (hi - lo) * i / 3; g += `<line class="gr" x1="${l}" x2="${W - rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 4}" y="${Y(v) + 3}" text-anchor="end">${k(v)}</text>`; }
    const step = Math.max(1, Math.ceil(P.length / 5));
    const xs = P.map((p, i) => i % step === 0 || i === P.length - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(p[0].slice(0, 7))}</text>` : '').join('');
    return `<div class="card"><svg viewBox="0 0 ${W} ${H}" width="100%">${g}<polyline class="ln" points="${P.map((p, i) => X(i) + ',' + Y(p[1])).join(' ')}"/>${P.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p[1])}" r="2.5"/>`).join('')}${xs}</svg></div>`;
  }

  // ---------- interazione ----------
  #onClick(e) {
    if (e.target.closest('[data-export]')) { new ExportPanel({ book: this.book, onClose: () => this.refresh() }).open(); return; }
    if (e.target.closest('[data-tonew]')) {
      if (!confirm('Passare al nuovo sistema di Ore lavoro? Le ore della scheda originale restano salvate e puoi tornare indietro quando vuoi.')) return;
      const st = this.book.st.work;
      if (!st.jobs.length && confirm('Vuoi portare nel nuovo sistema le ore già inserite (Switch Evolution e Cantiere, con paga e acconti)?\n\nOK = sì, porta i dati. Annulla = parti da zero.')) this.book.importLegacyHours();
      st.mode = 'new'; this.book.commit(); setTimeout(() => reloadKeepingLogin(), 900); return;
    }
    const tl = e.target.closest('.sheet-tile[data-i]'); if (tl) { this.onOpen?.(+tl.dataset.i); return; }
    if (e.target.closest('[data-newsub]')) { askNewPage(this.title).then(d => { if (d) this.onOpen?.(this.book.addCustom({ ...d, parent: this.i })); }); return; }
    if (e.target.closest('[data-editpage]')) { this.#editPage(); return; }
    const ad = e.target.closest('[data-add]');
    if (ad) {
      const g = this.REG[ad.dataset.add], r = this.#freeRow(g.x, g.cols);
      this.#openForm(g.top || 'Nuova voce', g.cols.map(c => c + r), g.lab, false, { x: g.x, cols: g.cols, r }, g.x.choices); return;
    }
    const k = e.target.closest('[data-k]'); if (!k) return;
    const g = this.REG[k.dataset.k];
    this.#openForm(g.title || this.title, g.f, g.lab, g.f.length > 1, null, g.choices);
  }

  async #editPage() {
    const bk = this.book, d = bk.customDef(this.i);
    const r = await FormModal.open({ title: 'Pagina', fields: [{ key: 'name', label: 'Nome della pagina', type: 'text' }], values: { name: d.name }, allowDelete: true });
    if (!r) return;
    if (r.__delete) {
      if (!confirm('Eliminare questa pagina e le sue sottopagine? I dati inseriti non saranno più visibili.')) return;
      bk.deleteCustom(this.i); return this.onBack();
    }
    bk.renameCustom(this.i, r.name); this.title = d.name;
    this.el.querySelector('h1').textContent = d.name; this.refresh();
  }

  #parseIn(t, isDate) {
    if (isDate) return t ? Math.round(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 864e5) + 25569 : null;
    t = t.trim(); if (t === '') return null; if (t[0] === '=') return t;
    if (/^-?\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'));
    if (/^-?\d*\.\d+$/.test(t)) return Number(t);
    return t;
  }

  /** Casella "importo" (formato con decimali): qui si puo' scegliere la valuta. */
  #isMoney(a) {
    const col = a.replace(/\d/g, ''), M = f => f === '0.00' || f === '#,##0.00';
    if (M(this.s.fmt[a])) return true;
    if (this.i === 0 && !this.book.isCustom(0)) {            // scheda Patrimonio originale: "messi da parte", capitali nelle banche, crediti
      const r = Number(a.replace(/\D/g, ''));
      return ['A21', 'A26', 'B16', 'C16', 'D16'].includes(a) || (col === 'B' && r >= 31 && r <= 41);   // solo queste: la colonna A dei crediti contiene i nomi
    }
    for (const k in this.s.fmt) if (k.replace(/\d/g, '') === col && M(this.s.fmt[k])) return true;
    return false;
  }

  #colFmt(a) {
    const col = a.replace(/\d/g, '');
    for (const k in this.s.fmt) if (k.replace(/\d/g, '') === col && isDateFmt(this.s.fmt[k])) return this.s.fmt[k];
  }

  /** Formula "modello" per una cella di una riga nuova: quella di un'altra riga dello stesso elenco, adattata al numero di riga. */
  #refFormula(x, col, r) {
    const s = this.s;
    for (let rr = x.r1; rr <= Math.min(x.r2, s.maxRow); rr++) {
      const raw = s.cells[col + rr];
      if (isFormula(raw) && this.#isLocal(raw, col + rr)) return raw.replace(new RegExp('(\\$?[A-Z]{1,3}\\$?)' + rr + '(?!\\d)', 'g'), (m, p1) => p1 + r);
    }
    return undefined;
  }

  /** Calcoli automatici: bloccati per gli utenti nelle schede di fabbrica, sempre bloccati nelle pagine create con i modelli. */
  #locked(a, add) {
    const custom = this.book.isCustom(this.i);
    if (!custom && this.book.app?.isOwner?.()) return false;
    let raw = this.s.cells[a];
    if (raw == null && add) raw = this.#refFormula(add.x, a.replace(/\d+/, ''), add.r);
    return custom ? isFormula(raw) : isDependent(raw);
  }

  #openForm(title, flds, lab, clearable, add = null, choices = null) {
    const s = this.s, bk = this.book, i = this.i;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const fields = flds.map(a => {
      const raw0 = s.cells[a], raw = /^=-?\d+(\.\d+)?$/.test(raw0 ?? '') ? Number(raw0.slice(1)) : raw0, f = s.fmt[a] || (raw == null && !add?.x.years ? this.#colFmt(a) : undefined), dm = isDateFmt(f) && !isFormula(raw);
      let v = raw == null ? '' : dm && typeof raw === 'number' ? serialToDate(raw).toISOString().slice(0, 10) : typeof raw === 'number' ? String(raw).replace('.', ',') : raw;
      const col = a.replace(/\d+/, '');
      if (raw == null && add) {                       // valori proposti per una voce nuova (oggi, "Da pagare"...)
        const d = add.x.defaults?.[col];
        if (d === '@today') { const n = new Date(); v = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; } else if (d != null) v = d;
      }
      const label = esc(lab[a] || lab[col] || a);
      if (this.#locked(a, add)) return `<label class="fl"><span>${label}</span><input data-a="${a}" data-lock="1" type="text" value="" placeholder="Calcolato automaticamente" disabled><em></em></label>`;
      if (choices?.[col] && !isFormula(raw)) {
        const opts = ['', ...choices[col]]; if (v && !opts.includes(v)) opts.push(v);
        return `<label class="fl"><span>${label}</span><select data-a="${a}" data-f="">${opts.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o || 'Scegli…')}</option>`).join('')}</select><em></em></label>`;
      }
      if (!dm && !isFormula(raw) && !(typeof raw === 'string' && raw) && this.#isMoney(a)) {   // casella importo: con scelta della valuta
        const sv = bk.st.cur[i + '!' + a], same = sv && typeof raw === 'number' && Math.abs(sv.eur - raw) < 0.005;
        const cur = same ? sv.cur : 'EUR', shown = same ? String(sv.amt).replace('.', ',') : v;
        const opts = [...FIAT, ...CRYPTO].map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${esc(curLabel(c))}</option>`).join('');
        return `<label class="fl"><span>${label}</span><div class="cur-row"><input data-a="${a}" data-f="" data-money="1" type="text" inputmode="decimal" value="${esc(shown)}" autocomplete="off"><select data-cur="${a}" aria-label="Valuta">${opts}</select></div><em></em></label>`;
      }
      const input = dm ? dateFieldHTML({ iso: v, attrs: `data-a="${a}" data-f="${esc(f)}"` })
        : `<input data-a="${a}" data-f="" type="text" value="${esc(v)}" autocomplete="off">`;
      return `<label class="fl"><span>${label}</span>${input}<em></em></label>`;
    }).join('');
    overlay.innerHTML = `<div class="modal"><h3>${esc(title)}</h3>${fields}
      <div class="modal-actions">
        <button class="btn" data-act="cancel">Annulla</button>
        ${clearable ? '<button class="btn danger" data-act="delete">Elimina</button>' : ''}
        <button class="btn primary" data-act="save">Salva</button>
      </div></div>`;
    document.body.appendChild(overlay);
    bindDateFields(overlay);
    const close = () => overlay.remove();
    const inputs = [...overlay.querySelectorAll('[data-a]:not([data-lock])')];
    const isDate = inp => inp.dataset.date === '1';
    const inVal = inp => isDate(inp) ? readDate(inp) : inp.value;
    const preview = inp => {
      const em = inp.closest('label').querySelector('em'), a = inp.dataset.a, iv = inVal(inp);
      if (isDate(inp)) { em.textContent = iv === null ? 'Data non valida (gg/mm/aaaa)' : ''; return; }
      const v = this.#parseIn(iv, false);
      if (inp.dataset.money) {
        const cur = overlay.querySelector(`[data-cur="${a}"]`).value;
        if (cur !== 'EUR' && typeof v === 'number') { const e = convert(v, cur, 'EUR', bk.rates, bk.st.wealth.ov); em.textContent = e == null ? 'Cambio non disponibile: controlla la connessione' : `≈ ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(e)} (i totali sono in euro)`; } else em.textContent = '';
        return;
      }
      if (typeof v === 'string' && v[0] === '=') { try { em.textContent = '= ' + bk.preview(i, a, v); } catch { em.textContent = 'Formula non valida'; } } else em.textContent = '';
    };
    overlay.querySelectorAll('[data-cur]').forEach(sel => sel.addEventListener('change', () => preview(overlay.querySelector(`[data-a="${sel.dataset.cur}"]`))));
    if (overlay.querySelector('[data-cur]')) bk.loadRates().then(() => inputs.forEach(preview));
    inputs.forEach(inp => { preview(inp); inp.addEventListener('input', () => preview(inp)); inp.addEventListener('change', () => preview(inp)); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').onclick = close;
    overlay.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      if (!confirm('Eliminare questa voce? I totali si aggiornano subito.')) return;
      flds.forEach(a => {
        const raw = s.cells[a];
        if (isFormula(raw) && this.#isLocal(raw, a)) return; // le formule di riga restano
        if (this.#locked(a, null)) return;                      // le formule bloccate non si toccano
        if (raw != null) bk.put(i, a, null);
      });
      this.#done(close);
    });
    overlay.querySelector('[data-act="save"]').onclick = async () => {
      const changes = [], curs = {};
      if ([...inputs].some(x => x.dataset.money && overlay.querySelector(`[data-cur="${x.dataset.a}"]`).value !== 'EUR')) await bk.loadRates();
      for (const inp of inputs) {
        const iv = inVal(inp);
        if (isDate(inp) && iv === null) { inp.classList.add('invalid'); inp.closest('label').querySelector('em').textContent = 'Data non valida (gg/mm/aaaa)'; return; }
        const a = inp.dataset.a; let v = this.#parseIn(iv, isDate(inp)); const old = s.cells[a];
        if (inp.dataset.money) {
          const cur = overlay.querySelector(`[data-cur="${a}"]`).value;
          if (cur !== 'EUR' && typeof v === 'number') {
            const e = convert(v, cur, 'EUR', bk.rates, bk.st.wealth.ov);
            if (e == null) { inp.closest('label').querySelector('em').textContent = 'Cambio non disponibile ora: scegli Euro o riprova'; return; }
            curs[a] = { cur, amt: v, eur: Math.round(e * 100) / 100 }; v = curs[a].eur;
          } else curs[a] = null;
        }
        if ((v === null && old == null) || v === old) continue;
        if (typeof v === 'string' && v[0] === '=') { try { bk.check(v); } catch { inp.closest('label').querySelector('em').textContent = 'Formula non valida'; return; } }
        changes.push([a, v, inp.dataset.f]);
      }
      if (add) {                                          // nessun dato inserito (solo i valori proposti): non creo una voce vuota
        const isDef = ([a, v]) => { const d = add.x.defaults?.[a.replace(/\d+/, '')]; return d === '@today' ? v === todaySerial() : d != null && v === d; };
        if (changes.every(isDef)) { close(); return; }
      }
      for (const a in curs) { if (curs[a]) bk.st.cur[i + '!' + a] = curs[a]; else delete bk.st.cur[i + '!' + a]; }
      changes.forEach(([a, v, f]) => { bk.put(i, a, v); if (f && v !== null && !s.fmt[a]) bk.setFmt(i, a, f); });
      if (add) for (const c of add.cols) {              // riga nuova: le formule di calcolo (totali ecc.) arrivano da sole
        if (s.cells[c + add.r] != null) continue;
        const fm = this.#refFormula(add.x, c, add.r); if (fm) bk.put(i, c + add.r, fm);
      }
      this.#done(close);
    };
  }

  #done(close) { this.book.commit(); close(); this.refresh(); this.onSaved?.(); }
}
