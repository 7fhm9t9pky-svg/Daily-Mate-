import { reloadKeepingLogin } from '../../core/AuthClient.js';
import { Module } from '../Module.js';
import { LavoroBook, MES } from './LavoroBook.js';
import { FinanceView, sheetTitle, sheetVisible } from './FinanceView.js';
import { SheetView } from './SheetView.js';
import { WorkView, dayHours, dayPay } from './WorkView.js';
import { ConfigView } from './ConfigView.js';
import { WealthView } from './WealthView.js';

import { parseNum } from '../../core/format.js';

const STATE_KEY = 'lavoro_state';
const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Grafici "pronti" che si possono scegliere nella pagina Attività. */
export const SERIES_CATALOG = {
  patrimonio:   { title: 'Patrimonio', unit: 'eur' },
  investimenti: { title: 'Investimenti', unit: 'pct' },
  entrate:      { title: 'Entrate', unit: 'eur' },
  uscite:       { title: 'Uscite', unit: 'eur', goodDown: true },
  guadagno:     { title: 'Guadagno mensile', unit: 'eur' },
  contoke:      { title: 'Conto KE', unit: 'eur' }
};

/** "gen 1200" per riga -> [{l, v}] (per i grafici con dati inseriti a mano) */
export function parsePoints(text) {
  return String(text || '').split('\n').map(r => r.trim()).filter(Boolean).map(r => {
    const m = /^(.*?)[\s;:]+(-?[\d.,]+\s*[€%]?)$/.exec(r);
    const v = m ? parseNum(m[2]) : parseNum(r);
    return v == null ? null : { l: m ? m[1].trim() : '', v };
  }).filter(Boolean);
}

/**
 * Finanze: il foglio "Lavoro" diviso in schede. La pagina mostra un quadretto per
 * ogni scheda; toccandolo si apre la scheda con gli stessi dati e le stesse formule.
 * I dati di partenza arrivano dal server (/api/seed/lavoro): completi per il
 * proprietario, vuoti per tutti gli altri. Le modifiche sono salvate per-utente.
 */
export class FinanceModule extends Module {
  constructor() {
    super({ id: 'finance', name: 'Finanze' });
    this._book = null; this._loading = null; this._timer = null;
  }

  async book() {
    if (this._book) return this._book;
    this._loading ||= this.#load();
    return this._loading;
  }

  async #load() {
    const headers = this.app.auth?.token ? { Authorization: `Bearer ${this.app.auth.token}` } : {};
    const res = await fetch('/api/seed/lavoro', { headers });
    if (!res.ok) throw new Error('Impossibile caricare il foglio Finanze');
    const seed = await res.json();
    const saved = await this.app.storage.get(STATE_KEY);
    this._book = new LavoroBook(seed, saved, st => this.#save(st));
    this._book.app = this.app;
    return this._book;
  }

  #save(st) {
    clearTimeout(this._timer);
    this._pending = st;
    if (!this._flushBound) {            // se chiudi o ricarichi la pagina subito, le modifiche non si perdono
      this._flushBound = true;
      const flush = () => this.#flush();
      addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
    this._timer = setTimeout(() => this.#flush(), 400);
  }

  #flush() {
    const st = this._pending; if (!st) return;
    this._pending = null; clearTimeout(this._timer);
    this.app.storage.set(STATE_KEY, { ov: st.ov, fm: st.fm, jobs: st.jobs, exp: st.exp, custom: st.custom, work: st.work, wealth: st.wealth, cfg: st.cfg });
  }

  async getView(arg) {
    let book;
    try { book = await this.book(); } catch (e) {
      return { async mount(parent) { parent.innerHTML = `<p class="empty">${e.message}. Riprova tra poco.</p>`; }, destroy() {} };
    }
    if (arg === 'config') return new ConfigView({ book, onBack: () => this.app.router.goTo('finance') });
    const i = arg !== undefined && arg !== '' ? Number(arg) : null;
    if (i === 0 && book.useWealth() && sheetVisible(book, 0)) {
      return new WealthView({ book, title: sheetTitle(book, 0), onBack: () => this.app.router.goTo('finance'), onOpen: n => this.app.router.goTo('finance/' + n) });
    }
    if (i === 1 && !book.legacyHours() && sheetVisible(book, 1)) {
      return new WorkView({ book, title: sheetTitle(book, 1), onBack: () => this.app.router.goTo('finance') });
    }
    if (i !== null && book.sheets[i] && sheetVisible(book, i)) {
      return new SheetView({
        book, index: i, title: sheetTitle(book, i),
        onBack: () => { const p = book.parentOf(i); this.app.router.goTo(p === null ? 'finance' : 'finance/' + p); },
        onOpen: n => this.app.router.goTo('finance/' + n),
        onSaved: () => {}
      });
    }
    return new FinanceView({ book, onOpen: n => this.app.router.goTo('finance/' + n) });
  }

  /**
   * Dati di un grafico della pagina Attività.
   * def = { kind: 'catalog'|'sheet'|'manual', ... } -> { points:[{l,v}], unit, goodDown, head:{value, sub} }
   */
  async getSeries(def) {
    const out = { points: [], unit: def.unit || 'num', goodDown: false, head: null };
    if (def.kind === 'manual') {
      out.points = parsePoints(def.points);
    } else if (def.kind === 'work') {
      // ore o paga per giornata dei miei orari di lavoro (un lavoro o tutti insieme)
      let b; try { b = await this.book(); } catch { return out; }
      const by = {};
      for (const j of b.st.work.jobs) {
        if (def.job && j.id !== def.job) continue;
        for (const r of j.rows) if (r.d) by[r.d] = (by[r.d] || 0) + (def.measure === 'paga' ? dayPay(j, r) : dayHours(r));
      }
      out.unit = def.measure === 'paga' ? 'eur' : 'num';
      out.points = Object.keys(by).sort().filter(d => by[d] > 0).slice(-30).map(d => ({ l: d.slice(8) + '/' + d.slice(5, 7), v: Math.round(by[d] * 100) / 100 }));
    } else if (def.kind === 'page') {
      // colonne di una mia pagina creata con il tasto +
      let b; try { b = await this.book(); } catch { return out; }
      const si = Number(def.page), sh = b.sheets[si];
      if (sh && b.isCustom(si)) for (let r = 4; r <= Math.min(1000, sh.maxRow); r++) {
        const v = b.num(si, def.vc + r); if (v == null) continue;
        const xa = def.lc + r;
        out.points.push({ l: b.fmt(b.shown(si, xa), sh.fmt[xa]), v });
      }
      out.points = out.points.slice(-40);
    } else {
      let b;
      try { b = await this.book(); } catch { return out; }
      if (def.kind === 'sheet') {
        const si = Number(def.s), sh = b.sheets[si];
        if (sh) for (let r = Number(def.r1); r <= Math.min(Number(def.r2), sh.maxRow); r++) {
          const v = b.num(si, String(def.yc).toUpperCase() + r); if (v == null) continue;
          const xa = String(def.xc).toUpperCase() + r;
          out.points.push({ l: b.fmt(b.shown(si, xa), sh.fmt[xa]), v });
        }
      } else {
        const meta = SERIES_CATALOG[def.key] || {};
        out.unit = meta.unit || 'num'; out.goodDown = !!meta.goodDown;
        const tot = (r, total, x, y) => {
          const d = b.num(5, total + r); if (d) return d;
          return ((b.num(5, x + r) || 0) + (b.num(5, y + r) || 0)) || null;
        };
        const monthly = fn => Array.from({ length: 12 }, (_, m) => fn(m)).map((v, m) => v == null ? null : { l: MESI3[m], v, m }).filter(Boolean);
        if (def.key === 'patrimonio') {
          out.points = monthly(m => b.num(4, 'B' + (29 + m)));
          if (b.useWealth()) await b.loadRates();
          out.head = { value: b.useWealth() ? b.wealthTotals('EUR').total : b.num(0, 'A6'), sub: 'oggi' };
        } else if (def.key === 'investimenti') {
          for (let r = 51; r <= 1000; r++) { const v = b.num(4, 'B' + r); if (v != null) out.points.push({ l: b.fmt(b.shown(4, 'A' + r), b.sheets[4].fmt['A' + r] || 'd/m'), v }); }
          out.points = out.points.slice(-14);
          out.head = { value: b.num(2, 'K2'), sub: 'andamento' };
        } else if (def.key === 'entrate') out.points = monthly(m => tot(22 + m, 'D', 'B', 'C'));
        else if (def.key === 'uscite') out.points = monthly(m => tot(22 + m, 'G', 'E', 'F'));
        else if (def.key === 'guadagno') out.points = monthly(m => { const e = tot(22 + m, 'D', 'B', 'C'), u = tot(22 + m, 'G', 'E', 'F'); return e == null && u == null ? null : (e || 0) - (u || 0); });
        else if (def.key === 'contoke') {
          for (let r = 2; r <= 1000; r++) { const v = b.num(7, 'B' + r); if (v != null) out.points.push({ l: b.fmt(b.shown(7, 'A' + r), b.sheets[7].fmt['A' + r] || 'd/m'), v }); }
        }
        // grafici mensili: il valore in evidenza e' quello del mese corrente (se c'e'), altrimenti l'ultimo inserito
        if (!out.head && out.points.length) {
          const cur = out.points.find(p => p.m === new Date().getMonth()) || out.points[out.points.length - 1];
          out.head = { value: cur.v, sub: cur.m != null ? MES[cur.m] : cur.l };
        }
      }
    }
    if (!out.head && out.points.length) { const last = out.points[out.points.length - 1]; out.head = { value: last.v, sub: last.l }; }
    return out;
  }

  /** Riporta il foglio ai dati di partenza (cancella le modifiche dell'utente). */
  async resetData() {
    const book = await this.book();
    book.resetState();
    await this.app.storage.remove(STATE_KEY);
    reloadKeepingLogin();
  }

  /** Numeri e serie per la Home (patrimonio, investimenti, entrate/uscite, punteggi del mese). */
  async getHomeData(m) {
    let b;
    try { b = await this.book(); } catch { return null; }
    const tot = (r, total, x, y) => {
      const d = b.num(5, total + r);
      if (d) return d;
      const s = (b.num(5, x + r) || 0) + (b.num(5, y + r) || 0);
      return s || null;
    };
    let patr = b.num(0, 'A6');
    if (b.useWealth()) { await b.loadRates(); patr = b.wealthTotals('EUR').total; }      // utenti: dalla pagina Patrimonio
    const P = Array.from({ length: 12 }, (_, k) => b.num(4, 'B' + (29 + k)));
    const E = Array.from({ length: 12 }, (_, k) => tot(22 + k, 'D', 'B', 'C'));
    const U = Array.from({ length: 12 }, (_, k) => tot(22 + k, 'G', 'E', 'F'));
    const W = [];
    for (let r = 51; r <= 1000; r++) { const v = b.num(4, 'B' + r); if (v != null) W.push(v); }
    const pct = (a, base) => (a != null && base) ? (a - base) / Math.abs(base) * 100 : null;
    const scores = {
      risparmio: E[m] && U[m] != null ? (E[m] - U[m]) / E[m] * 100 : null,
      patrimonio: m > 0 ? pct(P[m], P[m - 1]) : null,
      uscite: m > 0 ? pct(U[m], U[m - 1]) : null
    };
    return {
      patrimonio: patr, investPct: b.num(2, 'K2'),
      series: { patrimonio: P, investimenti: W.slice(-14), entrate: E, uscite: U },
      month: { entrate: E[m], uscite: U[m] }, scores
    };
  }
}
