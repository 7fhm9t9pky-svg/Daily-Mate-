import { makeEngine } from './engine.js';
import { templateById } from './templates.js';
import { wealthTotals, money } from './wealth.js';
import { applyLabels } from './labels.js';
import { migratePays } from './pays.js';

export const MES = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/** Giorno di oggi come numero seriale Excel (usato dalla funzione TODAY() del foglio). */
export function todaySerial() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 25569;
}

const nf = (a, b, g) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: a, maximumFractionDigits: b, useGrouping: g });
export const isDateFmt = f => !!f && /[dmy]/i.test(f);
export const serialToDate = v => new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
export const isFormula = r => typeof r === 'string' && r[0] === '=';
/** Formula che dipende da altre celle/schede (le formule con soli numeri, tipo =580, non contano). */
export const isDependent = r => isFormula(r) && /(\$?[A-Z]{1,3}\$?\d+|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|!)/.test(r.replace(/"[^"]*"/g, ''));

/**
 * Il "libro" Lavoro: dati di partenza (seed) + modifiche dell'utente (ov/fm)
 * + motore di formule. Tutto lo stato modificabile e' in `state` = { ov, fm },
 * che viene salvato per-utente tramite onChange().
 */
export class LavoroBook {
  constructor(seed, saved, onChange) {
    this.D = seed;
    this.st = {
      ov: saved?.ov || {}, fm: saved?.fm || {},
      jobs: saved?.jobs || {},                                   // lavori aggiunti a mano per "Esporta ore"
      custom: saved?.custom || [],
      cur: saved?.cur || {},                                     // valuta scelta per le singole caselle importo: 'foglio!cella' -> {cur, amt, eur}
      work: Object.assign({ jobs: [], adv: [], owed: [] }, saved?.work || {}),   // "Ore lavoro" degli utenti                              // pagine create dall'utente con il tasto +
      cfg: Object.assign({ banks: null, rate: '' }, saved?.cfg),                  // Configurazione: banche, paga standard
      wealth: Object.assign({ base: 'EUR', items: [], credits: [], ov: {} }, saved?.wealth),     // "Patrimonio" degli utenti
      exp: Object.assign({ sel: { switch: true, cantiere: true }, from: '', to: '' }, saved?.exp || {})
    };
    migratePays(this.st.work, this.st.cfg.rate);                    // paghe nominate per lavoro
    this.onChange = onChange;
    this.base = this.D.sheets.length;                              // le schede "di fabbrica" sono le prime
    this.st.custom.forEach(def => this.#buildCustom(def));
    applyLabels(this.D.sheets);                                    // nomi piu' chiari (le modifiche dell'utente restano valide)
    for (const k in this.st.ov) {
      const [i, a] = k.split('|'); const c = this.D.sheets[i]?.cells;
      if (!c) continue;
      if (this.st.ov[k] === null) delete c[a]; else c[a] = this.st.ov[k];
    }
    for (const k in this.st.fm) { const [i, a] = k.split('|'); if (this.D.sheets[i]) this.D.sheets[i].fmt[a] = this.st.fm[k]; }
    this.D.sheets.forEach(s => { s.maxRow = Math.max(s.maxRow, 1000); });
    for (const c of this.D.charts) if (c.s === 4 && c.r1 === 3) c.r2 = 25;   // grafico annuale: anche gli anni aggiunti
    this.#engine();
  }

  #engine() {
    this.eng = makeEngine(this.D, todaySerial());
    this.Err = this.eng.Err; this.cn = this.eng.cn; this.nc = this.eng.nc;
  }

  /** Crea scheda + disposizione di una pagina "a piacimento": titolo, totale e un elenco di voci. */
  #buildCustom(def) {
    const tpl = def.tpl && templateById(def.tpl);
    if (tpl) {                                                       // modello pronto: scheda + disposizione con calcoli automatici
      const r = tpl.build(def.params || {}, def.name);
      this.D.sheets.push({ name: 'P' + def.id, cells: r.cells, fmt: r.fmt, maxRow: 1000, maxCol: 12, freeze: null, cf: [], merges: [], widths: {} });
      this.D.layout.push(r.layout);
      def.cols = r.cols; def.head = r.head; def.icon = tpl.icon;
      return this.D.sheets.length - 1;
    }
    const cols = (def.cols && def.cols.length ? def.cols : ['Voce', 'Importo']).slice(0, 6);
    const L = i => String.fromCharCode(65 + i), last = L(cols.length - 1);
    const cells = { A1: def.name }, fmt = {};
    cols.forEach((c, i) => { cells[L(i) + '3'] = c; if (i > 0) fmt[L(i) + '4'] = ''; });
    const items = [];
    if (def.total && cols.length > 1) { cells.K1 = 'Totale ' + cols[1].toLowerCase(); cells.K2 = '=SUM(B4:B1000)'; fmt.K2 = '#,##0.00'; items.push(['K1', 'K2']); }
    cols.forEach((c, i) => {
      if (i === 0) return;
      const f = /data|scad/i.test(c) ? 'dd/mm/yyyy' : i === 1 ? '#,##0.00' : '';
      for (let r = 4; r <= 300; r++) if (f) fmt[L(i) + r] = f;
    });
    this.D.sheets.push({ name: 'P' + def.id, cells, fmt, maxRow: 1000, maxCol: 12, freeze: null, cf: [], merges: [], widths: {} });
    const lay = [{ t: 'hero', ta: 'A1' }];
    if (items.length) lay.push({ t: 'stats', title: '', items, big: true });
    lay.push({ t: 'list', key: 'A', c1: 'A', c2: last, r1: 4, r2: 1000, hr: 3, title: '' });
    this.D.layout.push(lay);
    return this.D.sheets.length - 1;
  }

  /** Nome della banca n. k (0 = prima, 1 = seconda) come compare nelle colonne di "Entrate e uscite". */
  bankName(k) {
    const b = this.st.cfg.banks, owner = this.app?.isOwner?.();
    return (b && b[k]) || (owner ? ['BPM', 'TR'] : ['Banca 1', 'Banca 2'])[k];
  }

  /** Nomi delle banche scritti dall'utente (servono anche come suggerimenti in Patrimonio). */
  banks() { return (this.st.cfg.banks || (this.app?.isOwner?.() ? ['BPM', 'TR'] : [])).filter(Boolean); }

  /** Gli utenti (non l'amministratore) usano la pagina Patrimonio nuova al posto della scheda originale Home banking. */
  useWealth() { return !this.app?.isOwner?.(); }

  /** Cambi delle valute dal server (una volta sola per sessione). */
  loadRates() {
    this._rates ||= this.app.auth.api('/api/rates').then(r => (this.rates = r)).catch(() => { this._rates = null; return null; });
    return this._rates;
  }

  /** Capitale gia' investito (somma della colonna "Soldi investiti" nella scheda Investimenti). */
  investedEur() { let t = 0; for (let r = 2; r <= 1000; r++) { const v = this.num(2, 'C' + r); if (v != null) t += v; } return t; }

  wealthTotals(base) { return wealthTotals(this.st.wealth, this.rates, base || this.st.wealth.base, this.investedEur()); }

  /** L'amministratore tiene la scheda Ore lavoro originale; gli altri usano quella che si costruiscono da soli. */
  legacyHours() { return !!this.app?.isOwner?.() && this.st.work.mode !== 'new'; }

  /** Porta le ore della scheda originale (Switch Evolution e Cantiere) nel nuovo sistema: nome, paga e giornate. */
  importLegacyHours() {
    const s = this.D.sheets[1], iso = v => new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
    const hm = v => { const m = Math.round(v * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    const U = () => Math.random().toString(36).slice(2, 8);
    const blocks = [{ name: 'Switch Evolution', d: 'C', c: ['D', 'E', 'F', 'G'], note: 'I', pay: 'A10' }, { name: 'Cantiere', d: 'K', c: ['L', 'M', 'N', 'O'], note: null, pay: 'A13' }];
    for (const bl of blocks) {
      const m = /\*\s*(\d+(?:\.\d+)?)/.exec(String(s.cells[bl.pay] ?? ''));
      const job = { id: U(), name: bl.name, rate: m ? Number(m[1]) : 0, rows: [] };
      for (let r = 4; r <= 1000; r++) {
        const d = this.val(1, bl.d + r);
        const t = bl.c.map(c => { const v = this.val(1, c + r); return typeof v === 'number' ? hm(v) : ''; });
        if (!t.some(Boolean)) continue;
        job.rows.push({ id: U(), d: typeof d === 'number' ? iso(d) : '', a: t[0], b: t[1], c: t[2], e: t[3], rate: '', note: bl.note ? String(s.cells[bl.note + r] || '') : '' });
      }
      if (job.rows.length) { this.st.work.jobs.push(job); this.st.exp.sel['w:' + job.id] = true; }
    }
    const acc = Number(String(s.cells.A22 ?? '').replace(/^=/, ''));
    if (acc > 0) this.st.work.adv.push({ id: U(), d: '', amount: acc, note: 'Acconti già versati' });
    this.importLegacyOwed();
  }

  /** "Saldo Residuo" della scheda originale (soldi dei mesi prima che il capo ti deve ancora) -> arretrato nel nuovo sistema. */
  legacyOwedAmount() { const v = Number(String(this.D.sheets[1].cells.A19 ?? '').replace(/^=/, '')); return Number.isFinite(v) && v > 0 ? v : 0; }
  importLegacyOwed() {
    const v = this.legacyOwedAmount(), job = this.st.work.jobs[0]; if (!v || !job) return false;
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    this.st.work.owed.push({ id: Math.random().toString(36).slice(2, 8), job: job.id, amount: v, month: d.getMonth(), year: d.getFullYear(), note: 'Saldo residuo della scheda originale' });
    return true;
  }

  isCustom(i) { return i >= this.base; }
  customDef(i) { return this.st.custom[i - this.base] || null; }
  /** Indice della scheda "madre" (null = pagina principale di Finanze). */
  parentOf(i) { return this.isCustom(i) ? (this.customDef(i).parent ?? null) : null; }
  childrenOf(i) { return this.st.custom.map((d, k) => [d, this.base + k]).filter(([d, x]) => !d.deleted && (d.parent ?? null) === i).map(([, x]) => x); }

  addCustom({ name, parent = null, cols, total, tpl, params }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    const def = { id, name: String(name).trim().slice(0, 40) || 'Nuova pagina', parent, cols, total: !!total };
    if (tpl) { def.tpl = tpl; def.params = params || {}; }
    this.st.custom.push(def);
    const idx = this.#buildCustom(def);
    this.#engine(); this.commit();
    return idx;
  }

  renameCustom(i, name) {
    const d = this.customDef(i); if (!d) return;
    d.name = String(name).trim().slice(0, 40) || d.name;
    this.D.sheets[i].cells.A1 = d.name; this.eng.set(this.D.sheets[i].name, 'A1', d.name); this.commit();
  }

  deleteCustom(i) {
    const kill = x => { this.customDef(x).deleted = true; this.childrenOf(x).forEach(kill); };
    kill(i); this.commit();
  }

  get sheets() { return this.D.sheets; }
  get layout() { return this.D.layout; }

  /**
   * Disposizione di una scheda per questo utente. Cambia solo per chi non e' amministratore:
   * Home banking senza "Altre banche" e "Banca prioritaria" (sostituite dalle sottopagine),
   * Investimenti aperti senza "Famiglia". Gli elenchi degli anni sono ordinati e hanno piu' righe libere.
   */
  layoutFor(i) {
    let L = this.D.layout[i];
    if (this.isCustom(i)) return L;
    if (!this.app?.isOwner?.()) {
      if (i === 0) L = L.filter(x => !(x.t === 'kv' && (x.ta === 'A14' || x.ta === 'A19')));
      if (i === 2) L = L.filter(x => !(x.t === 'list' && x.title === 'Famiglia') && !(x.t === 'stats' && x.items?.[0]?.[0] === 'L4'));
    }
    return L.map(x => {
      if (i === 5 && x.t === 'list' && x.labels) {
        const a = this.bankName(0), b = this.bankName(1);
        return { ...x, labels: { ...x.labels, B: 'Entrate ' + a, C: 'Entrate ' + b, E: 'Uscite ' + a, F: 'Uscite ' + b } };
      }
      if (i === 4 && x.t === 'list' && x.title === 'Storico settimanale') return { ...x, title: 'Patrimonio settimana per settimana' };
      if (i === 4 && x.t === 'list' && x.r1 === 3) return { ...x, r2: 25, sortKey: true, years: true };
      if (i === 5 && x.t === 'list' && x.r1 === 3) return { ...x, r2: 18, sortKey: true, years: true };
      return x;
    });
  }
  get charts() { return this.D.charts; }

  val(i, a) { return this.eng.get(this.D.sheets[i].name, a); }

  /** Valore mostrato: se la cella e' dentro un'unione, quello della cella in alto a sinistra. */
  shown(i, a) {
    const s = this.D.sheets[i]; const v = this.val(i, a);
    if (v != null && v !== '') return v;
    const m = /^([A-Z]+)(\d+)$/.exec(a), c = this.cn(m[1]), r = +m[2];
    for (const [r1, c1, r2, c2] of s.merges) if (r >= r1 && r <= r2 && c >= c1 && c <= c2) return this.val(i, this.nc(c1) + r1);
    return v;
  }

  fmt(v, f) {
    if (v == null) return '';
    if (v instanceof this.Err) return (v.c === '#DIV/0!' || v.c === '#VALUE!') ? '—' : v.c;
    if (typeof v === 'boolean') return v ? 'VERO' : 'FALSO';
    if (typeof v === 'string') return v;
    if (isDateFmt(f)) {
      const x = serialToDate(v), p = n => String(n).padStart(2, '0');
      return f.includes('mmmm') ? x.getUTCDate() + ' ' + MES[x.getUTCMonth()]
        : f.includes('yyyy') ? p(x.getUTCDate()) + '/' + p(x.getUTCMonth() + 1) + '/' + x.getUTCFullYear()
        : x.getUTCDate() + '/' + (x.getUTCMonth() + 1);
    }
    if (f === '0') return nf(0, 0, false).format(v);
    if (f === '0.00') return nf(2, 2, false).format(v);
    if (f === '#,##0.00') return nf(2, 2, true).format(v);
    const r = Math.abs(v) >= 1 ? Math.round(v * 100) / 100 : Number(v.toPrecision(4));   // niente lunghe code di decimali
    return String(r).replace('.', ',');
  }

  /** Se la casella e' stata scritta in un'altra valuta, la mostra cosi' (es. "100,00 US$") invece dell'importo in euro. */
  inCur(i, a, v) {
    const c = this.st.cur[i + '!' + a];
    return c && typeof v === 'number' && Math.abs(c.eur - v) < 0.005 ? money(c.amt, c.cur) : null;
  }

  disp(i, a) { const v = this.shown(i, a); return this.inCur(i, a, v) ?? this.fmt(v, this.D.sheets[i].fmt[a]); }

  /** Numero di una cella (0 se vuota/errore): comodo per Home e riepiloghi. */
  num(i, a) { const v = this.val(i, a); return typeof v === 'number' ? v : null; }

  /** Anteprima di una formula senza salvarla. */
  preview(i, a, raw) {
    const s = this.D.sheets[i];
    this.eng.check(raw);
    const old = s.cells[a];
    this.eng.set(s.name, a, raw);
    const r = this.eng.get(s.name, a);
    this.eng.set(s.name, a, old === undefined ? null : old);
    return this.fmt(r, s.fmt[a]);
  }

  check(raw) { this.eng.check(raw); }

  put(i, a, v) { this.eng.set(this.D.sheets[i].name, a, v); this.st.ov[i + '|' + a] = v; }
  setFmt(i, a, f) { this.D.sheets[i].fmt[a] = f; this.st.fm[i + '|' + a] = f; }
  commit() { this.onChange?.(this.st); }
  resetState() { this.st.ov = {}; this.st.fm = {}; this.st.cur = {}; this.onChange?.(this.st); }
}
