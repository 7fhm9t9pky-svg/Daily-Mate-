import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { reloadKeepingLogin } from '../../core/AuthClient.js';
import { ExportPanel } from './ExportPanel.js';
import { fmtShort, todayIso } from '../../core/dates.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const hrs = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n || 0) + ' h';
const mins = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

/** Ore di una giornata: (pausa − entrata mattina) + (uscita − entrata pomeriggio). */
export function dayHours(r) {
  const a = mins(r.a), b = mins(r.b), c = mins(r.c), e = mins(r.e);
  let m = 0;
  if (a !== null && b !== null && b > a) m += b - a;
  if (c !== null && e !== null && e > c) m += e - c;
  return m / 60;
}

/** Paga oraria standard (si imposta in Finanze > Configurazione). Un lavoro senza paga sua usa questa. */
let STD = 0;
export const setStdRate = n => { STD = Number(n) > 0 ? Number(n) : 0; };
export const stdRate = () => STD;
export const jobRate = j => (j.std || !(num(j.rate) > 0)) ? STD : num(j.rate);
export const dayRate = (job, r) => r.rate === '' || r.rate == null ? jobRate(job) : num(r.rate);
export const dayPay = (job, r) => dayHours(r) * dayRate(job, r);

export function workTotals(work) {
  const jobs = work.jobs.map(j => ({ job: j, ore: j.rows.reduce((s, r) => s + dayHours(r), 0), paga: j.rows.reduce((s, r) => s + dayPay(j, r), 0) }));
  const ore = jobs.reduce((s, x) => s + x.ore, 0), paga = jobs.reduce((s, x) => s + x.paga, 0);
  const acconti = work.adv.reduce((s, a) => s + num(a.amount), 0);
  return { jobs, ore, paga, acconti, saldo: paga - acconti };
}

/**
 * "Ore lavoro" per gli utenti: all'inizio e' vuoto. Con "Crea orario di lavoro" dai il nome
 * e la paga oraria standard; poi ore totali, paghe, acconti e saldo si collegano da soli
 * (totali = somma di tutti gli orari), come nel foglio originale.
 */
export class WorkView extends Component {
  constructor({ book, title, onBack }) { super(); setStdRate(book.st.cfg.rate); this.book = book; this.title = title; this.onBack = onBack; this.w = book.st.work; }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = `<div class="page-head"><button class="back" data-act="back">‹ Finanze</button><h1>${esc(this.title)}</h1></div><div class="sheet-body"></div>`;
    el.querySelector('[data-act=back]').onclick = () => this.onBack();
    this.body = el.querySelector('.sheet-body');
    this.body.addEventListener('click', e => this.#click(e));
    return el;
  }

  async afterMount() { this.refresh(); }

  refresh() {
    const w = this.w, T = workTotals(w), keep = this.el.closest('.app-main')?.scrollTop ?? 0;
    let h = '';
    if (!w.jobs.length) {
      h = `<p class="empty">Non hai ancora nessun orario di lavoro.<br>Creane uno con il nome della tua azienda: poi ore, paga, acconti e saldo si calcolano da soli.</p>
        <button class="add" data-newjob="1">+ Crea orario di lavoro</button>`;
    } else {
      const tile = (l, v, big) => `<div class="tl${big ? ' big' : ''}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
      h += '<button class="xbtn" data-export="1">⇪ Esporta ore</button>';
      h += '<div class="tiles">' + tile('Ore totali', hrs(T.ore), true) + T.jobs.map(x => tile('Ore ' + x.job.name, hrs(x.ore))).join('')
        + T.jobs.map(x => tile('Paga ' + x.job.name, eur(x.paga))).join('')
        + tile('Paga tot.', eur(T.paga)) + tile('Acconti', eur(T.acconti)) + tile('Saldo residuo', eur(T.saldo)) + '</div>';
      for (const { job: j, ore } of T.jobs) {
        h += `<h2 class="s">${esc(j.name)}</h2><p class="set-note">Paga oraria standard: <b>${eur(jobRate(j))}</b>${j.std || !(num(j.rate) > 0) ? ' (standard)' : ''} · ${hrs(ore)} · <a href="#" data-editjob="${j.id}">modifica</a></p><div class="lst">`;
        for (const r of j.rows.slice().sort((x, y) => (y.d || '').localeCompare(x.d || ''))) {
          const pr = (a, b) => (a && b ? `${a}–${b}` : a || b ? `${a || b}` : '—');
          h += `<div class="it" data-row="${j.id}|${r.id}"><h4>${fmtShort(r.d) || '—'}</h4><div class="gr">
            <div class="c"><small>Mattina</small><b>${esc(pr(r.a, r.b))}</b></div>
            <div class="c"><small>Pomeriggio</small><b>${esc(pr(r.c, r.e))}</b></div>
            <div class="c"><small>Ore giornata</small><b>${hrs(dayHours(r))}</b></div>
            <div class="c"><small>Paga (${eur(dayRate(j, r))}/h)</small><b>${eur(dayPay(j, r))}</b></div>
            ${r.note ? `<div class="c w"><small>Note</small><b>${esc(r.note)}</b></div>` : ''}</div></div>`;
        }
        h += `</div><button class="add" data-newday="${j.id}">+ Nuovo giorno</button>`;
      }
      h += `<h2 class="s">Acconti</h2><div class="lst">${w.adv.slice().sort((x, y) => (y.d || '').localeCompare(x.d || '')).map(a => `<div class="it ln" data-adv="${a.id}"><span>${fmtShort(a.d) || '—'}${a.note ? ' · ' + esc(a.note) : ''}</span><b>${eur(num(a.amount))}</b></div>`).join('')}</div>
        <button class="add" data-newadv="1">+ Nuovo acconto</button>
        <button class="add" data-newjob="1">+ Crea un altro orario di lavoro</button>`;
    }
    if (this.book.app?.isOwner?.()) {
      h += `<button class="add" data-toold="1">‹ Torna alla scheda originale (Switch Evolution / Cantiere)</button>`;
    }
    this.body.innerHTML = h;
    const sc = this.el.closest('.app-main'); if (sc) sc.scrollTop = keep;
  }

  save() { this.book.commit(); this.refresh(); }

  async #click(e) {
    const t = e.target, q = s => t.closest(s), w = this.w;
    if (q('[data-export]')) { new ExportPanel({ book: this.book, onClose: () => this.refresh() }).open(); return; }
    if (q('[data-toold]')) { if (!confirm('Tornare alla scheda originale?')) return; delete this.w.mode; this.book.commit(); setTimeout(() => reloadKeepingLogin(), 900); return; }
    if (q('[data-newjob]')) return this.jobForm(null);
    const ej = q('[data-editjob]'); if (ej) { e.preventDefault(); return this.jobForm(w.jobs.find(j => j.id === ej.dataset.editjob)); }
    const nd = q('[data-newday]'); if (nd) return this.dayForm(w.jobs.find(j => j.id === nd.dataset.newday), null);
    const row = q('[data-row]'); if (row) { const [jid, rid] = row.dataset.row.split('|'); const j = w.jobs.find(x => x.id === jid); return this.dayForm(j, j.rows.find(r => r.id === rid)); }
    if (q('[data-newadv]')) return this.advForm(null);
    const ad = q('[data-adv]'); if (ad) return this.advForm(w.adv.find(a => a.id === ad.dataset.adv));
  }

  async jobForm(job) {
    const r = await FormModal.open({
      title: job ? 'Orario di lavoro' : 'Nuovo orario di lavoro',
      fields: [{ key: 'name', label: 'Nome (es. azienda o cantiere)', type: 'text' },
        { key: 'mode', label: 'Paga oraria', type: 'select', options: [{ value: 'std', label: STD > 0 ? `Standard (${eur(STD)} all'ora)` : 'Standard (da impostare in Configurazione)' }, { value: 'own', label: 'Scrivo io' }] },
        { key: 'rate', label: 'Paga oraria di questo lavoro (€ all\'ora)', type: 'text', showIf: { field: 'mode', value: 'own' } }],
      values: job ? { name: job.name, mode: job.std || !(num(job.rate) > 0) ? 'std' : 'own', rate: String(job.rate || '').replace('.', ',') } : { name: '', mode: 'std', rate: '' }, allowDelete: !!job
    });
    if (!r) return;
    if (r.__delete) { if (!confirm(`Eliminare «${job.name}» con tutte le sue giornate?`)) return; this.w.jobs = this.w.jobs.filter(j => j !== job); delete this.book.st.exp.sel['w:' + job.id]; return this.save(); }
    if (!r.name.trim()) { alert('Scrivi un nome'); return; }
    const std = r.mode === 'std';
    if (!std && !(num(r.rate) > 0)) { alert('Scrivi la paga oraria (un numero maggiore di zero) oppure scegli Standard'); return; }
    if (job) { job.name = r.name.trim(); job.std = std; job.rate = std ? '' : num(r.rate); } else { const id = uid(); this.w.jobs.push({ id, name: r.name.trim(), std, rate: std ? '' : num(r.rate), rows: [] }); this.book.st.exp.sel['w:' + id] = true; }
    this.save();
  }

  async dayForm(job, row) {
    const r = await FormModal.open({
      title: `${job.name}: giornata`,
      fields: [
        { key: 'd', label: 'Giorno', type: 'date' },
        { key: 'a', label: 'Mattina · entrata', type: 'time' }, { key: 'b', label: 'Mattina · pausa (uscita)', type: 'time' },
        { key: 'c', label: 'Pomeriggio · entrata', type: 'time' }, { key: 'e', label: 'Pomeriggio · uscita', type: 'time' },
        { key: 'mode', label: 'Paga di questa giornata', type: 'select', options: [{ value: 'job', label: `Standard (${eur(jobRate(job))} all'ora)` }, { value: 'own', label: 'Scrivo io' }] },
        { key: 'rate', label: 'Paga oraria di questa giornata (€ all\'ora)', type: 'text', showIf: { field: 'mode', value: 'own' } },
        { key: 'note', label: 'Note', type: 'textarea' }
      ],
      values: row ? { ...row, mode: row.rate === '' || row.rate == null ? 'job' : 'own', rate: String(row.rate ?? '').replace('.', ',') } : { d: todayIso(), a: '', b: '', c: '', e: '', mode: 'job', rate: '', note: '' }, allowDelete: !!row
    });
    if (!r) return;
    if (r.__delete) { job.rows = job.rows.filter(x => x !== row); return this.save(); }
    const nr = { id: row?.id || uid(), d: r.d, a: r.a, b: r.b, c: r.c, e: r.e, rate: r.mode === 'own' && String(r.rate).trim() !== '' ? num(r.rate) : '', note: r.note.trim() };
    if (row) Object.assign(row, nr); else job.rows.push(nr);
    this.save();
  }

  async advForm(adv) {
    const r = await FormModal.open({
      title: 'Acconto',
      fields: [{ key: 'd', label: 'Data', type: 'date' }, { key: 'amount', label: 'Importo (€)', type: 'number' }, { key: 'note', label: 'Note', type: 'text' }],
      values: adv ? { ...adv } : { d: todayIso(), amount: '', note: '' }, allowDelete: !!adv
    });
    if (!r) return;
    if (r.__delete) { this.w.adv = this.w.adv.filter(x => x !== adv); return this.save(); }
    const na = { id: adv?.id || uid(), d: r.d, amount: num(r.amount), note: r.note.trim() };
    if (adv) Object.assign(adv, na); else this.w.adv.push(na);
    this.save();
  }
}
