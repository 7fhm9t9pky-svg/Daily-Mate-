import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { lineChart } from '../../ui/charts.js';
import { SERIES_CATALOG, parsePoints } from '../finance/FinanceModule.js';
import { byUnit, pct } from '../../core/format.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SETTINGS_KEY = 'activity_charts';
const UNITS = [{ value: 'eur', label: 'Euro (€)' }, { value: 'pct', label: 'Percentuale (%)' }, { value: 'num', label: 'Numero' }];
const KINDS = (admin) => [
  { value: 'manual', label: 'Scrivo io i valori (etichetta + numero)' },
  { value: 'page', label: 'Dai dati di una mia pagina di Finanze' },
  { value: 'work', label: 'Dalle mie ore di lavoro (ore o paga)' },
  { value: 'catalog', label: 'Grafico già pronto di Finanze' },
  ...(admin ? [{ value: 'sheet', label: 'Avanzato: celle di una scheda del foglio' }] : [])
];
const catalogOptions = (admin) => Object.entries(SERIES_CATALOG).filter(([k]) => admin || k !== 'contoke').map(([value, m]) => ({ value, label: m.title }));
const esca = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Tabella semplice "etichetta + valore" con il tasto per aggiungere righe. Ritorna { title, unit, points } o null. */
function tableEditor({ title, unit, rows, del }) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'modal-overlay';
    const rowHtml = (l = '', v = '') => `<div class="te-row"><input type="text" class="te-l" placeholder="Etichetta (es. gen, Lunedì…)" value="${esca(l)}"><input type="text" inputmode="decimal" class="te-v" placeholder="Valore" value="${esca(v)}"><button type="button" class="te-x" aria-label="Togli riga">✕</button></div>`;
    ov.innerHTML = `<div class="modal"><h3>${del ? 'Modifica grafico' : 'Nuovo grafico'}</h3>
      <label class="fl"><span>Nome del grafico</span><input type="text" id="te-t" value="${esca(title)}"></label>
      <label class="fl"><span>Tipo di valore</span><select id="te-u">${UNITS.map(u => `<option value="${u.value}" ${u.value === unit ? 'selected' : ''}>${u.label}</option>`).join('')}</select></label>
      <div class="fl"><span>Valori del grafico</span><div id="te-rows">${rows.map(r => rowHtml(r.l, r.v)).join('') || rowHtml()}</div>
      <button type="button" class="add" id="te-add">+ Aggiungi riga</button></div>
      <div class="modal-actions"><button class="btn" data-a="x">Annulla</button>${del ? '<button class="btn danger" data-a="d">Elimina</button>' : ''}<button class="btn primary" data-a="s">Salva</button></div></div>`;
    document.body.appendChild(ov);
    const done = v => { ov.remove(); resolve(v); };
    ov.querySelector('#te-add').onclick = () => { ov.querySelector('#te-rows').insertAdjacentHTML('beforeend', rowHtml()); };
    ov.addEventListener('click', e => {
      if (e.target === ov) return done(null);
      const x = e.target.closest('.te-x'); if (x) x.closest('.te-row').remove();
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'x') done(null);
      if (a === 'd' && confirm('Eliminare questo grafico?')) done({ __delete: true });
      if (a === 's') {
        const pts = [...ov.querySelectorAll('.te-row')].map(r => [r.querySelector('.te-l').value.trim(), r.querySelector('.te-v').value.trim()]).filter(([, v]) => v !== '');
        done({ title: ov.querySelector('#te-t').value.trim(), unit: ov.querySelector('#te-u').value, points: pts.map(([l, v]) => `${l || '·'} ${v}`).join('\n') });
      }
    });
  });
}

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
    const list = await this.list(), admin = this.app.isOwner?.();
    let kind = def?.kind;
    if (!def) {
      const first = await FormModal.open({ title: 'Nuovo grafico', fields: [{ key: 'kind', label: 'Da dove prendo i dati?', type: 'select', options: KINDS(admin) }], values: { kind: 'manual' } });
      if (!first) return;
      kind = first.kind;
    }
    const save = async (res, extra = {}) => {
      if (!res) return;
      if (res.__delete) return this.save(list.filter(d => d.id !== def.id));
      const next = { ...(def || {}), ...res, ...extra, kind, id: def?.id || 'g' + Date.now() };
      if (!next.title && kind !== 'catalog') next.title = 'Grafico';
      await this.save(def ? list.map(d => d.id === def.id ? next : d) : [...list, next]);
    };
    const book = await this.app.registry.get('finance').book().catch(() => null);

    if (kind === 'manual') {
      const rows = parsePoints(def?.points).map(p => ({ l: p.l, v: String(p.v).replace('.', ',') }));
      return save(await tableEditor({ title: def?.title || '', unit: def?.unit || 'eur', rows, del: !!def }));
    }

    if (kind === 'page') {
      const pages = book ? book.sheets.map((s, i) => i).filter(i => book.isCustom(i) && !book.customDef(i).deleted) : [];
      if (!pages.length) { alert('Non hai ancora pagine tue: creane una in Finanze con “＋ Nuova pagina”, inserisci le voci, poi torna qui.'); return; }
      let page = def ? Number(def.page) : null;
      if (page === null) {
        const p = await FormModal.open({ title: 'Quale pagina?', fields: [{ key: 'page', label: 'Pagina di Finanze', type: 'select', options: pages.map(i => ({ value: String(i), label: book.customDef(i).name })) }], values: { page: String(pages[0]) } });
        if (!p) return; page = Number(p.page);
      }
      const d = book.customDef(page), L = i => String.fromCharCode(65 + i);
      const cols = d.cols.map((c, i) => ({ value: L(i), label: c }));
      const r = await FormModal.open({
        title: def ? 'Modifica grafico' : 'Nuovo grafico: ' + d.name,
        fields: [{ key: 'title', label: 'Nome del grafico', type: 'text' },
          { key: 'lc', label: 'Cosa mettere sull\'asse (etichette)', type: 'select', options: cols },
          { key: 'vc', label: 'Quale numero disegnare', type: 'select', options: cols.slice(1).length ? cols.slice(1) : cols },
          { key: 'unit', label: 'Tipo di valore', type: 'select', options: UNITS }],
        values: def ? { ...def } : { title: d.name, lc: 'A', vc: cols[1] ? 'B' : 'A', unit: 'eur' }, allowDelete: !!def
      });
      return save(r, { page });
    }

    if (kind === 'work') {
      const jobs = book?.st.work.jobs || [];
      if (!jobs.length) { alert('Non hai ancora un orario di lavoro: crealo in Finanze → Ore lavoro, poi torna qui.'); return; }
      const r = await FormModal.open({
        title: def ? 'Modifica grafico' : 'Nuovo grafico: ore di lavoro',
        fields: [{ key: 'title', label: 'Nome del grafico', type: 'text' },
          { key: 'job', label: 'Quale lavoro', type: 'select', options: [{ value: '', label: 'Tutti insieme' }, ...jobs.map(j => ({ value: j.id, label: j.name }))] },
          { key: 'measure', label: 'Cosa mostrare, giorno per giorno', type: 'select', options: [{ value: 'ore', label: 'Ore lavorate' }, { value: 'paga', label: 'Paga guadagnata (€)' }] }],
        values: def ? { ...def } : { title: 'Ore lavorate', job: '', measure: 'ore' }, allowDelete: !!def
      });
      return save(r);
    }

    const fields = {
      catalog: [{ key: 'key', label: 'Grafico', type: 'select', options: catalogOptions(admin) }, { key: 'title', label: 'Nome (facoltativo)', type: 'text' }],
      sheet: [
        { key: 'title', label: 'Nome del grafico', type: 'text' },
        { key: 's', label: 'Scheda', type: 'select', options: (book?.sheets || []).map((s, i) => ({ value: String(i), label: s.name })) },
        { key: 'xc', label: 'Colonna delle etichette (es. A)', type: 'text' },
        { key: 'yc', label: 'Colonna dei valori (es. B)', type: 'text' },
        { key: 'r1', label: 'Dalla riga', type: 'number' },
        { key: 'r2', label: 'Alla riga', type: 'number' },
        { key: 'unit', label: 'Tipo di valore', type: 'select', options: UNITS }
      ]
    }[kind];
    const defaults = { catalog: { key: 'guadagno' }, sheet: { s: '0', xc: 'A', yc: 'B', r1: 2, r2: 50, unit: 'eur' } }[kind];
    const result = await FormModal.open({ title: def ? 'Modifica grafico' : 'Nuovo grafico', fields, values: def ? { ...def, s: String(def.s ?? '0') } : defaults, allowDelete: !!def });
    return save(result);
  }
}
