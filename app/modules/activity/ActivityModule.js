import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { lineChart } from '../../ui/charts.js';
import { SERIES_CATALOG } from '../finance/FinanceModule.js';
import { byUnit, pct } from '../../core/format.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SETTINGS_KEY = 'activity_charts';
const UNITS = [{ value: 'eur', label: 'Euro (€)' }, { value: 'pct', label: 'Percentuale (%)' }, { value: 'num', label: 'Numero' }];
const KINDS = [
  { value: 'catalog', label: 'Grafico pronto dal foglio Finanze' },
  { value: 'sheet', label: 'Dati di una scheda del foglio Finanze' },
  { value: 'manual', label: 'Miei dati (li scrivo io)' }
];
const catalogOptions = () => Object.entries(SERIES_CATALOG).map(([value, m]) => ({ value, label: m.title }));

/** Grafici che compaiono la prima volta: quelli dello schizzo della Home. */
const DEFAULTS = () => [
  { id: 'd-patrimonio', kind: 'catalog', key: 'patrimonio', title: '' },
  { id: 'd-investimenti', kind: 'catalog', key: 'investimenti', title: '' },
  { id: 'd-entrate', kind: 'catalog', key: 'entrate', title: '' },
  { id: 'd-uscite', kind: 'catalog', key: 'uscite', title: '' }
];

class ActivityView extends Component {
  constructor(module) { super(); this.m = module; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `<div class="act-grid" id="act-grid"></div>
      <p class="empty" id="act-empty" hidden>Nessun grafico: premi + per aggiungerne uno.</p>
      <button class="link-btn" id="act-reset" hidden>Ripristina i grafici predefiniti</button>
      <button class="fab" id="act-add" aria-label="Aggiungi grafico">+</button>`;
    el.querySelector('#act-add').onclick = () => this.m.edit(null).then(() => this.draw());
    el.querySelector('#act-reset').onclick = async () => { if (confirm('Ripristinare i 4 grafici predefiniti?')) { await this.m.save(DEFAULTS()); this.draw(); } };
    el.querySelector('#act-grid').addEventListener('click', async e => {
      const card = e.target.closest('[data-id]'); if (!card) return;
      await this.m.edit((await this.m.list()).find(d => d.id === card.dataset.id));
      this.draw();
    });
    return el;
  }

  async afterMount() { await this.draw(); }

  async draw() {
    const cards = await this.m.getCards();
    this.el.querySelector('#act-grid').innerHTML = cards.map(c => `
      <div class="card act-card" data-id="${c.def.id}">
        <div class="act-head"><h3>${esc(c.title)}</h3>${c.delta ? `<span class="chip ${c.delta.good ? 'good' : 'bad'}">${c.delta.text}</span>` : ''}</div>
        <div class="act-val">${c.value}<small>${esc(c.sub)}</small></div>
        ${lineChart(c.points.map(p => [p.l, p.v]))}
      </div>`).join('');
    this.el.querySelector('#act-empty').hidden = cards.length > 0;
    this.el.querySelector('#act-reset').hidden = cards.length >= 4;
  }
}

/**
 * Attività: resoconto grafico degli andamenti mostrati in Home (patrimonio,
 * investimenti, entrate, uscite). Con il tasto + se ne aggiungono altri.
 * L'elenco dei grafici e' un'impostazione dell'utente (salvata sul suo account).
 */
export class ActivityModule extends Module {
  constructor() { super({ id: 'activity', name: 'Attività' }); }

  async list() { return (await this.app.settings.get(SETTINGS_KEY)) || DEFAULTS(); }
  async save(list) { await this.app.settings.set(SETTINGS_KEY, list); }
  async getView() { return new ActivityView(this); }

  /** Un grafico con tutti i dati pronti da mostrare (usato da questa pagina e dalla Home). */
  async getCards(limit = 50) {
    const fin = this.app.registry.get('finance');
    const cards = [];
    for (const def of (await this.list()).slice(0, limit)) {
      const s = await fin.getSeries(def);
      const base = def.title || SERIES_CATALOG[def.key]?.title || 'Grafico';
      const monthly = s.points.some(p => p.m != null) && def.key !== 'patrimonio';
      const pts = s.points, n = pts.length;
      let delta = null;
      if (n >= 2 && pts[n - 2].v) {
        const d = (pts[n - 1].v - pts[n - 2].v) / Math.abs(pts[n - 2].v) * 100;
        delta = { text: `${d >= 0 ? '▲' : '▼'} ${pct(d)} su ${pts[n - 2].l || 'prima'}`, good: s.goodDown ? d <= 0 : d >= 0 };
      }
      cards.push({
        def, points: pts, title: base,
        shortTitle: monthly && s.head?.sub ? `${base} ${s.head.sub[0].toUpperCase()}${s.head.sub.slice(1)}` : base,
        value: s.head ? byUnit(s.head.value, s.unit) : '—', sub: s.head?.sub || '', delta
      });
    }
    return cards;
  }

  /** Aggiunge (def = null) o modifica un grafico. */
  async edit(def) {
    const list = await this.list();
    let kind = def?.kind;
    if (!def) {
      const first = await FormModal.open({ title: 'Nuovo grafico', fields: [{ key: 'kind', label: 'Che grafico vuoi?', type: 'select', options: KINDS }], values: { kind: 'catalog' } });
      if (!first) return;
      kind = first.kind;
    }
    const sheets = (await this.app.registry.get('finance').book().catch(() => null))?.sheets || [];
    const fields = {
      catalog: [{ key: 'key', label: 'Grafico', type: 'select', options: catalogOptions() }, { key: 'title', label: 'Nome (facoltativo)', type: 'text' }],
      sheet: [
        { key: 'title', label: 'Nome del grafico', type: 'text' },
        { key: 's', label: 'Scheda', type: 'select', options: sheets.map((s, i) => ({ value: String(i), label: s.name })) },
        { key: 'xc', label: 'Colonna delle etichette (es. A)', type: 'text' },
        { key: 'yc', label: 'Colonna dei valori (es. B)', type: 'text' },
        { key: 'r1', label: 'Dalla riga', type: 'number' },
        { key: 'r2', label: 'Alla riga', type: 'number' },
        { key: 'unit', label: 'Tipo di valore', type: 'select', options: UNITS }
      ],
      manual: [
        { key: 'title', label: 'Nome del grafico', type: 'text' },
        { key: 'unit', label: 'Tipo di valore', type: 'select', options: UNITS },
        { key: 'points', label: 'Valori: una riga per punto, es. “gen 1200”', type: 'textarea' }
      ]
    }[kind];
    const defaults = { catalog: { key: 'guadagno' }, sheet: { s: '0', xc: 'A', yc: 'B', r1: 2, r2: 50, unit: 'eur' }, manual: { unit: 'eur', points: '' } }[kind];
    const result = await FormModal.open({ title: def ? 'Modifica grafico' : 'Nuovo grafico', fields, values: def ? { ...def, s: String(def.s ?? '0') } : defaults, allowDelete: !!def });
    if (!result) return;
    if (result.__delete) return this.save(list.filter(d => d.id !== def.id));
    const next = { ...(def || {}), ...result, kind, id: def?.id || 'g' + Date.now() };
    if (!next.title && kind !== 'catalog') next.title = 'Grafico';
    await this.save(def ? list.map(d => d.id === def.id ? next : d) : [...list, next]);
  }
}
