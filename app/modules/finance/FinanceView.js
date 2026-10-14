import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { workTotals } from './WorkView.js';
import { TEMPLATES, TEMPLATE_GROUPS, templateById } from './templates.js';
import { parseNum } from '../../core/format.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Numero con formato "contabile" anche se la cella del foglio non ha un formato proprio. */
function nice(b, i, a) {
  const v = b.shown(i, a), f = b.sheets[i].fmt[a];
  return b.fmt(v, typeof v === 'number' && !/[dmy]/i.test(f || '') ? '#,##0.00' : f);
}

/** Per ogni scheda del foglio: titolo del quadretto e "numero chiave" da mostrare. */
const SHEET_INFO = [
  { title: 'Home banking', head: b => [nice(b, 0, 'A5'), nice(b, 0, 'A6')] },
  { title: 'Ore lavoro', head: b => [nice(b, 1, 'A1'), nice(b, 1, 'A2')] },
  { title: 'Investimenti aperti', head: b => [nice(b, 2, 'K1'), nice(b, 2, 'K2')] },
  { title: 'PIM azionario', head: b => [nice(b, 3, 'F1'), nice(b, 3, 'F2')] },
  { title: 'Amministrazione', head: b => {
    for (let r = 40; r >= 29; r--) { const v = b.num(4, 'B' + r); if (v != null) return [b.disp(4, 'A' + r), nice(b, 4, 'B' + r)]; }
    return ['Patrimonio mensile', '—'];
  } },
  { title: 'Entrate e uscite', head: b => ['Guadagno ' + b.disp(5, 'A4'), nice(b, 5, 'H4')] },
  { title: 'Trading 212', head: b => {
    let t = 0; for (let r = 2; r <= 1000; r++) { const v = b.num(6, 'B' + r); if (v != null) t += v; }
    return ['Totale ricaricato', b.fmt(t, '#,##0.00')];
  } },
  { title: 'Conto KE', head: b => [nice(b, 7, 'C1'), nice(b, 7, 'C2')] },
  { title: 'Risparmio', head: b => [nice(b, 8, 'F1'), nice(b, 8, 'F2')] }
];

export const BASE_SHEETS = [0, 1, 2, 4, 5, 8];   // cosa vede un utente normale se l'amministratore non ha scelto altro

export function sheetTitle(book, i) {
  if (book.isCustom(i)) return book.customDef(i).name;
  return book.app?.ui?.sheetLabels?.[i] || SHEET_INFO[i]?.title || book.sheets[i].name;
}

/** Schede "di fabbrica" visibili a questo utente (le pagine create da lui si vedono sempre). */
export function sheetVisible(book, i) {
  if (book.isCustom(i)) return !book.customDef(i).deleted;
  const app = book.app, allowed = app?.ui?.sheets;
  if (i === 6 || i === 7) return !!app?.isOwner?.();   // Trading 212 e Conto KE: solo dell'amministratore
  return allowed ? allowed.includes(i) : (app?.isOwner?.() ? true : BASE_SHEETS.includes(i));
}

/** Galleria "Nuova pagina": modelli pronti raggruppati + pagina vuota. Ritorna il modello scelto, 'blank' o null. */
function pickTemplate(parentTitle) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const card = t => `<button class="tpl" data-t="${t.id}"><span class="tpl-i">${t.icon}</span><span class="tpl-t"><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span></button>`;
    const groups = TEMPLATE_GROUPS.map(g => `<h4 class="tpl-g">${esc(g)}</h4>${TEMPLATES.filter(t => t.group === g).map(card).join('')}`).join('');
    overlay.innerHTML = `<div class="modal tpl-modal"><h3>${parentTitle ? `Nuova sottopagina di “${esc(parentTitle)}”` : 'Cosa vuoi tenere sotto controllo?'}</h3>
      <p class="tpl-sub">Scegli un modello pronto: i calcoli si fanno da soli, tu inserisci solo i dati.</p>
      <div class="tpl-list">${groups}<h4 class="tpl-g">Tutto tuo</h4>
      <button class="tpl" data-t="blank"><span class="tpl-i">✏️</span><span class="tpl-t"><b>Pagina vuota</b><small>Decidi tu come si chiamano le colonne (es. Voce, Importo, Data).</small></span></button></div>
      <div class="modal-actions"><button class="btn" data-act="cancel">Annulla</button></div></div>`;
    document.body.appendChild(overlay);
    const close = v => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-act="cancel"]')) return close(null);
      const b = e.target.closest('.tpl'); if (b) close(b.dataset.t === 'blank' ? 'blank' : templateById(b.dataset.t));
    });
  });
}

const serialOf = iso => iso ? Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5) + 25569 : 0;

/** Finestra "Nuova pagina": scelta del modello e poche domande. Torna i dati per addCustom o null. */
export async function askNewPage(parentTitle) {
  const t = await pickTemplate(parentTitle);
  if (!t) return null;
  if (t !== 'blank') {
    const fields = [{ key: 'name', label: 'Nome della pagina', type: 'text' }, ...t.fields.map(f => ({ key: f.key, label: f.label, type: f.type }))];
    const r = await FormModal.open({ title: `${t.icon} ${t.title}`, fields, values: { name: t.title } });
    if (!r || r.__delete) return null;
    if (!r.name.trim()) { alert('Scrivi il nome della pagina'); return null; }
    const params = {};
    for (const f of t.fields) {
      const raw = r[f.key];
      if (f.type === 'date') params[f.key] = serialOf(raw);
      else { const n = String(raw ?? '').trim() === '' ? 0 : parseNum(raw); if (n === null) { alert(`“${f.label}”: scrivi un numero`); return null; } params[f.key] = n; }
    }
    return { name: r.name, tpl: t.id, params };
  }
  const r = await FormModal.open({
    title: 'Pagina vuota',
    fields: [
      { key: 'name', label: 'Nome della pagina', type: 'text' },
      { key: 'c0', label: 'Come chiami le voci (prima colonna)', type: 'text' },
      { key: 'c1', label: 'Seconda colonna (di solito un importo)', type: 'text' },
      { key: 'c2', label: 'Altre colonne, separate da virgola (facoltativo, es. Data, Note)', type: 'text' },
      { key: 'total', label: 'Mostra il totale della seconda colonna', type: 'checkbox' }
    ],
    values: { name: '', c0: 'Voce', c1: 'Importo', c2: '', total: true }
  });
  if (!r || r.__delete) return null;
  if (!r.name.trim()) { alert('Scrivi il nome della pagina'); return null; }
  const cols = [r.c0.trim() || 'Voce', r.c1.trim() || 'Importo', ...String(r.c2 || '').split(',').map(x => x.trim()).filter(Boolean)].slice(0, 6);
  return { name: r.name, cols, total: r.total };
}

/** Quadretto di una scheda (usato in Finanze e nelle sottopagine). */
export function tileHTML(book, i, first = false) {
  let label = '', value = '—';
  try {
    if (book.isCustom(i)) { const d = book.customDef(i); if (d.head) [label, value] = [d.head[0], nice(book, i, d.head[1])]; else if (d.total && d.cols.length > 1) [label, value] = ['Totale ' + d.cols[1].toLowerCase(), nice(book, i, 'K2')]; else label = d.cols.join(' · '); }
    else if (i === 1 && !book.legacyHours()) { const t = workTotals(book.st.work); [label, value] = book.st.work.jobs.length ? ['Ore totali', new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(t.ore) + ' h'] : ['Crea il tuo orario', '—']; }
    else [label, value] = SHEET_INFO[i] ? SHEET_INFO[i].head(book) : ['', '—'];
  } catch { /* scheda senza dati */ }
  return `<button class="sheet-tile${first ? ' first' : ''}" data-i="${i}">
    <h3>${book.isCustom(i) && book.customDef(i).icon ? book.customDef(i).icon + ' ' : ''}${esc(sheetTitle(book, i))}</h3>
    <div class="v">${esc(value || '—')}</div>
    <div class="k">${esc(label || '')}</div>
  </button>`;
}

/** Pagina Finanze: un quadretto per ogni scheda del foglio Lavoro. */
export class FinanceView extends Component {
  constructor({ book, onOpen }) { super(); this.book = book; this.onOpen = onOpen; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    const bk = this.book;
    const ids = bk.sheets.map((_, i) => i).filter(i => bk.parentOf(i) === null && sheetVisible(bk, i));
    const tiles = ids.map((i, n) => tileHTML(bk, i, n === 0)).join('') + '<button class="sheet-tile add-tile" data-new="1"><h3>＋ Nuova pagina</h3><div class="k">Scegli un modello pronto o parti da zero</div></button>';
    el.innerHTML = `<p class="fin-sub">Tocca un quadretto per aprirlo. Con <b>＋ Nuova pagina</b> trovi modelli pronti: risparmio, casa, animali, auto, prestiti, scadenze…</p><div class="sheet-grid">${tiles}</div>`;
    el.querySelectorAll('.sheet-tile[data-i]').forEach(t => { t.onclick = () => this.onOpen(+t.dataset.i); });
    el.querySelector('[data-new]').onclick = async () => {
      const d = await askNewPage(null); if (!d) return;
      this.onOpen(this.book.addCustom(d));
    };
    return el;
  }
}
