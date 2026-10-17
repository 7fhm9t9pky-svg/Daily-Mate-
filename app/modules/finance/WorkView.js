import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { reloadKeepingLogin } from '../../core/AuthClient.js';
import { ExportPanel } from './ExportPanel.js';
import { fmtShort, todayIso } from '../../core/dates.js';
import { parseNum } from '../../core/format.js';
import { num, jobPays, defaultPay, jobRate, dayRate, payOf, newId } from './pays.js';
import { dayHours, dayPay, workTotals } from './worktotals.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const hrs = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n || 0) + ' h';

export { dayHours, dayPay, workTotals } from './worktotals.js';
export { jobRate, dayRate };

/**
 * "Ore lavoro" per gli utenti: all'inizio e' vuoto. Con "Crea orario di lavoro" dai il nome
 * e la paga oraria standard; poi ore totali, paghe, acconti e saldo si collegano da soli
 * (totali = somma di tutti gli orari), come nel foglio originale.
 */
export class WorkView extends Component {
  constructor({ book, title, onBack }) { super(); this.book = book; this.title = title; this.onBack = onBack; this.w = book.st.work; }

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
        + tile('Paga tot.', eur(T.paga)) + tile('Arretrati (mesi prima)', eur(T.arretrati)) + tile('Acconti', eur(T.acconti)) + tile('Saldo residuo (mesi prima − acconti)', eur(T.saldo), true) + tile('Con anche la paga di questo periodo', eur(T.totale)) + '</div>'
        + '<p class="set-note">Saldo residuo = arretrati dei mesi prima − acconti già ricevuti. Sotto trovi anche il totale se ci aggiungi la paga di questo periodo.</p>';
      for (const { job: j, ore } of T.jobs) {
        h += `<h2 class="s">${esc(j.name)}</h2><p class="set-note">${jobPays(j).length ? 'Paghe: ' + jobPays(j).map(p => `${esc(p.name)} ${eur(num(p.rate))}`).join(' · ') : 'Nessuna paga: creala in Configurazione'} · ${hrs(ore)} · <a href="#" data-editjob="${j.id}">modifica</a> · <a href="#/finance/config">paghe</a></p><div class="lst">`;
        for (const r of j.rows.slice().sort((x, y) => (y.d || '').localeCompare(x.d || ''))) {
          const pr = (a, b) => (a && b ? `${a}–${b}` : a || b ? `${a || b}` : '—');
          h += `<div class="it" data-row="${j.id}|${r.id}"><h4>${fmtShort(r.d) || '—'}</h4><div class="gr">
            <div class="c"><small>Mattina</small><b>${esc(pr(r.a, r.b))}</b></div>
            <div class="c"><small>Pomeriggio</small><b>${esc(pr(r.c, r.e))}</b></div>
            <div class="c"><small>Ore giornata</small><b>${hrs(dayHours(r))}</b></div>
            <div class="c"><small>${esc(payOf(j, r)?.name || 'Paga scritta da te')} (${eur(dayRate(j, r))}/h)</small><b>${eur(dayPay(j, r))}</b></div>
            ${r.note ? `<div class="c w"><small>Note</small><b>${esc(r.note)}</b></div>` : ''}</div></div>`;
        }
        h += `</div><button class="add" data-newday="${j.id}">+ Nuovo giorno</button>`;
      }
      const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
      const owed = (w.owed || []).slice().sort((x, y) => (y.year * 12 + y.month) - (x.year * 12 + x.month));
      h += `<h2 class="s">Arretrati: soldi dei mesi prima che ti devono ancora</h2><div class="lst">${owed.map(o => `<div class="it ln" data-owed="${o.id}"><span>${esc(w.jobs.find(j => j.id === o.job)?.name || 'Azienda')} · ${MESI[o.month] || ''} ${o.year || ''}${o.note ? ' · ' + esc(o.note) : ''}</span><b>${eur(num(o.amount))}</b></div>`).join('') || '<p class="empty-s">Nessun arretrato. Se il tuo capo ti deve ancora dei soldi di mesi passati, aggiungili qui.</p>'}</div>
        <button class="add" data-newowed="1">+ Aggiungi un arretrato (azienda, mese, importo)</button>`;
      if (!owed.length && this.book.legacyOwedAmount?.() > 0) h += `<button class="add" data-importowed="1">⤓ Porta qui il saldo residuo della scheda originale (${eur(this.book.legacyOwedAmount())})</button>`;
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
    if (q('[data-newowed]')) return this.owedForm(null);
    if (q('[data-importowed]')) { this.book.importLegacyOwed(); return this.save(); }
    const od = q('[data-owed]'); if (od) return this.owedForm((w.owed || []).find(x => x.id === od.dataset.owed));
    if (q('[data-newadv]')) return this.advForm(null);
    const ad = q('[data-adv]'); if (ad) return this.advForm(w.adv.find(a => a.id === ad.dataset.adv));
  }

  async jobForm(job) {
    const r = await FormModal.open({
      title: job ? 'Lavoro' : 'Nuovo lavoro',
      fields: [{ key: 'name', label: 'Nome (es. Swievo, cantiere)', type: 'text' },
        ...(job ? [] : [{ key: 'rate', label: 'Paga oraria (€ all\'ora) — poi potrai creare altre paghe in Configurazione', type: 'text' }])],
      values: job ? { name: job.name } : { name: '', rate: '' }, allowDelete: !!job
    });
    if (!r) return;
    if (r.__delete) { if (!confirm(`Eliminare «${job.name}» con tutte le sue giornate?`)) return; this.w.jobs = this.w.jobs.filter(j => j !== job); this.w.owed = (this.w.owed || []).filter(o => o.job !== job.id); delete this.book.st.exp.sel['w:' + job.id]; return this.save(); }
    if (!r.name.trim()) { alert('Scrivi un nome'); return; }
    if (job) job.name = r.name.trim();
    else {
      const id = newId(), pid = newId(), rate = String(r.rate).trim() === '' ? 0 : parseNum(r.rate);
      if (rate === null || rate < 0) { alert('Scrivi la paga come numero (es. 8,50)'); return; }
      this.w.jobs.push({ id, name: r.name.trim(), pays: rate > 0 ? [{ id: pid, name: 'Paga ' + r.name.trim(), rate }] : [], defPay: rate > 0 ? pid : '', rows: [] });
      this.book.st.exp.sel['w:' + id] = true;
    }
    this.save();
  }

  async dayForm(job, row) {
    const r = await FormModal.open({
      title: `${job.name}: giornata`,
      fields: [
        { key: 'd', label: 'Giorno', type: 'date' },
        { key: 'a', label: 'Mattina · entrata', type: 'time' }, { key: 'b', label: 'Mattina · pausa (uscita)', type: 'time' },
        { key: 'c', label: 'Pomeriggio · entrata', type: 'time' }, { key: 'e', label: 'Pomeriggio · uscita', type: 'time' },
        { key: 'mode', label: 'Paga di questa giornata', type: 'select', options: [...jobPays(job).map(p => ({ value: p.id, label: `${p.name} — ${eur(num(p.rate))} all'ora` })), { value: 'own', label: jobPays(job).length ? 'Scrivo io' : 'Scrivo io (nessuna paga creata: la crei in Configurazione)' }] },
        { key: 'rate', label: 'Paga oraria di questa giornata (€ all\'ora)', type: 'text', showIf: { field: 'mode', value: 'own' } },
        { key: 'note', label: 'Note', type: 'textarea' }
      ],
      values: row ? { ...row, mode: row.rate === '' || row.rate == null ? (payOf(job, row)?.id || 'own') : 'own', rate: String(row.rate ?? '').replace('.', ',') } : { d: todayIso(), a: '', b: '', c: '', e: '', mode: defaultPay(job)?.id || 'own', rate: '', note: '' }, allowDelete: !!row
    });
    if (!r) return;
    if (r.__delete) { job.rows = job.rows.filter(x => x !== row); return this.save(); }
    const nr = { id: row?.id || uid(), d: r.d, a: r.a, b: r.b, c: r.c, e: r.e, rate: r.mode === 'own' && String(r.rate).trim() !== '' ? num(r.rate) : '', pay: r.mode === 'own' ? '' : r.mode, note: r.note.trim() };
    if (row) Object.assign(row, nr); else job.rows.push(nr);
    this.save();
  }

  async owedForm(o) {
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    if (!this.w.jobs.length) { alert('Prima crea un lavoro (azienda) in Configurazione.'); return; }
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
    const r = await FormModal.open({
      title: o ? 'Arretrato' : 'Nuovo arretrato',
      fields: [
        { key: 'job', label: 'Quale azienda te li deve?', type: 'select', options: this.w.jobs.map(j => ({ value: j.id, label: j.name })) },
        { key: 'month', label: 'Di quale mese?', type: 'select', options: MESI.map((m, i) => ({ value: String(i), label: m })) },
        { key: 'year', label: 'Anno', type: 'text' },
        { key: 'amount', label: 'Quanto ti devono ancora? (€)', type: 'text' },
        { key: 'note', label: 'Note (facoltativo)', type: 'text' }
      ],
      values: o ? { job: o.job, month: String(o.month), year: String(o.year), amount: String(o.amount).replace('.', ','), note: o.note || '' } : { job: this.w.jobs[0].id, month: String(prev.getMonth()), year: String(prev.getFullYear()), amount: '', note: '' },
      allowDelete: !!o
    });
    if (!r) return;
    this.w.owed = this.w.owed || [];
    if (r.__delete) { this.w.owed = this.w.owed.filter(x => x !== o); return this.save(); }
    const amount = parseNum(r.amount), year = parseInt(r.year, 10);
    if (amount === null || amount <= 0) { alert('Scrivi quanto ti devono come numero (es. 450)'); return; }
    if (!(year > 2000 && year < 2100)) { alert('Scrivi l\'anno con 4 cifre (es. 2026)'); return; }
    const data = { id: o?.id || uid(), job: r.job, month: Number(r.month), year, amount, note: r.note.trim() };
    if (o) Object.assign(o, data); else this.w.owed.push(data);
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
