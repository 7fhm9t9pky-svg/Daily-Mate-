import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { parseNum } from '../../core/format.js';
import { num, jobPays, defaultPay, newId } from './pays.js';
import { FIAT, curLabel } from './wealth.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);

/**
 * Configurazione: i dati che non cambiano mai (le tue banche, la paga oraria standard, la valuta preferita)
 * si scrivono qui una volta sola e le altre pagine li usano da sole, cosi' resta da compilare solo il resto.
 */
export class ConfigView extends Component {
  constructor({ book, onBack }) { super(); this.book = book; this.onBack = onBack; this.c = book.st.cfg; }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = `<div class="page-head"><button class="back" data-act="back">‹ Finanze</button><h1>Configurazione</h1></div><div class="sheet-body"></div>`;
    el.querySelector('[data-act=back]').onclick = () => this.onBack();
    this.body = el.querySelector('.sheet-body');
    this.body.addEventListener('click', e => this.#click(e));
    this.body.addEventListener('change', e => { const b = e.target.closest('[data-base]'); if (b) { this.book.st.wealth.base = b.value; this.save(); } });
    return el;
  }

  async afterMount() { this.refresh(); }
  save() { this.book.commit(); this.refresh(); }

  refresh() {
    const bk = this.book, banks = bk.banks(), keep = this.el.closest('.app-main')?.scrollTop ?? 0, jobs = bk.st.work.jobs;
    let h = `<p class="lead">Scrivi qui una volta sola i dati che non cambiano mai. Le altre pagine li usano da sole, così ti restano da compilare solo le cifre.</p>`;

    h += `<h2 class="s">🏦 Le mie banche e i miei conti</h2>
      <p class="set-note">Usati in <b>Entrate e uscite</b> (le prime due diventano i nomi delle colonne: ora «${esc(bk.bankName(0))}» e «${esc(bk.bankName(1))}») e come suggerimenti quando aggiungi un conto in <b>Patrimonio</b>.</p><div class="lst">`;
    banks.forEach((b, i) => { h += `<div class="it ln" data-bank="${i}"><span>${esc(b)}</span><b>${i < 2 ? `<small>colonna ${i + 1} di Entrate e uscite</small>` : ''}</b></div>`; });
    if (!banks.length) h += `<p class="empty-s">Nessuna banca scritta. In Entrate e uscite compaiono «Banca 1» e «Banca 2».</p>`;
    h += `</div><button class="add" data-newbank="1">+ Aggiungi una banca o un conto</button>`;

    h += `<h2 class="s">💶 Lavori e paghe</h2>
      <p class="set-note">Crea i tuoi lavori e, per ognuno, tutte le paghe che ti servono (es. «Paga Swievo», «Paga Swievo 10%», «Paga cantiere»). In <b>Ore lavoro</b>, per ogni giornata, scegli la paga da un menu oppure scrivi un importo diverso.${bk.legacyHours() ? ' <b>Nota:</b> stai usando la scheda originale di Ore lavoro; le paghe valgono dopo il passaggio al nuovo sistema.' : ''}</p>`;
    for (const j of jobs) {
      h += `<h2 class="s">${esc(j.name)} <a href="#" class="lnk" data-editjob="${j.id}">modifica</a></h2><div class="lst">`;
      const dp = defaultPay(j);
      for (const p of jobPays(j)) h += `<div class="it ln" data-pay="${j.id}|${p.id}"><span>${esc(p.name)}${dp?.id === p.id && jobPays(j).length > 1 ? ' <em class="chip">di solito</em>' : ''}</span><b>${esc(eur(num(p.rate)))} all'ora</b></div>`;
      if (!jobPays(j).length) h += `<p class="empty-s">Nessuna paga per questo lavoro.</p>`;
      h += `</div><button class="add" data-newpay="${j.id}">+ Aggiungi una paga per «${esc(j.name)}»</button>`;
    }
    if (!jobs.length) h += `<p class="empty-s">Nessun lavoro. Aggiungi il primo con la sua paga oraria.</p>`;
    h += `<button class="add" data-newjob="1">+ Aggiungi un lavoro</button>`;

    h += `<h2 class="s">🌍 Valuta preferita</h2>
      <p class="set-note">In <b>Patrimonio</b> tutti gli importi vengono convertiti in questa valuta. La puoi cambiare quando vuoi.</p>
      <div class="w-cur"><label>Mostra i totali in <select data-base>${FIAT.map(c => `<option value="${c}"${c === bk.st.wealth.base ? ' selected' : ''}>${esc(curLabel(c))}</option>`).join('')}</select></label></div>`;

    this.body.innerHTML = h;
    const sc = this.el.closest('.app-main'); if (sc) sc.scrollTop = keep;
  }

  async #click(e) {
    const q = s => e.target.closest(s), w = this.book.st.work;
    if (q('[data-newbank]')) return this.bankForm(null);
    const b = q('[data-bank]'); if (b) return this.bankForm(+b.dataset.bank);
    if (q('[data-newjob]')) return this.jobForm(null);
    const ej = q('[data-editjob]'); if (ej) { e.preventDefault(); return this.jobForm(w.jobs.find(j => j.id === ej.dataset.editjob)); }
    const np = q('[data-newpay]'); if (np) return this.payForm(w.jobs.find(j => j.id === np.dataset.newpay), null);
    const pp = q('[data-pay]'); if (pp) { const [jid, pid] = pp.dataset.pay.split('|'); const j = w.jobs.find(x => x.id === jid); return this.payForm(j, jobPays(j).find(p => p.id === pid)); }
  }

  async bankForm(i) {
    const list = this.book.banks().slice(), isNew = i === null;
    const r = await FormModal.open({
      title: isNew ? 'Nuova banca o conto' : 'Banca o conto',
      fields: [{ key: 'name', label: 'Nome (es. BPM, Revolut, Trade Republic)', type: 'text' }],
      values: { name: isNew ? '' : list[i] }, allowDelete: !isNew
    });
    if (!r) return;
    if (r.__delete) list.splice(i, 1);
    else {
      const name = r.name.trim(); if (!name) { alert('Scrivi un nome'); return; }
      if (isNew) list.push(name.slice(0, 30)); else list[i] = name.slice(0, 30);
    }
    this.c.banks = list; this.save();
  }

  async jobForm(job) {
    const r = await FormModal.open({
      title: job ? 'Lavoro' : 'Nuovo lavoro',
      fields: [{ key: 'name', label: 'Nome del lavoro (es. Swievo, cantiere)', type: 'text' },
        ...(job ? [] : [{ key: 'pname', label: 'Nome della prima paga (facoltativo, es. Paga Swievo)', type: 'text' }, { key: 'rate', label: 'Quanto prendi all\'ora? (€)', type: 'text' }])],
      values: job ? { name: job.name } : { name: '', pname: '', rate: '' }, allowDelete: !!job
    });
    if (!r) return;
    const w = this.book.st.work;
    if (r.__delete) { if (!confirm(`Eliminare «${job.name}» con tutte le sue giornate?`)) return; w.jobs = w.jobs.filter(j => j !== job); w.owed = (w.owed || []).filter(o => o.job !== job.id); delete this.book.st.exp.sel['w:' + job.id]; return this.save(); }
    const name = r.name.trim(); if (!name) { alert('Scrivi un nome'); return; }
    if (job) job.name = name;
    else {
      const rate = String(r.rate).trim() === '' ? 0 : parseNum(r.rate);
      if (rate === null || rate < 0) { alert('Scrivi la paga come numero (es. 8,50)'); return; }
      const pid = newId(), id = newId();
      w.jobs.push({ id, name, pays: rate > 0 ? [{ id: pid, name: r.pname.trim() || 'Paga ' + name, rate }] : [], defPay: rate > 0 ? pid : '', rows: [] });
      this.book.st.exp.sel['w:' + id] = true;
    }
    this.save();
  }

  async payForm(job, pay) {
    const isNew = !pay;
    const r = await FormModal.open({
      title: isNew ? `Nuova paga per ${job.name}` : 'Paga',
      fields: [{ key: 'name', label: 'Nome della paga (es. Paga ' + job.name + ' 10%)', type: 'text' }, { key: 'rate', label: 'Quanto prendi all\'ora? (€)', type: 'text' },
        { key: 'def', label: 'È la paga che propongo di solito', type: 'checkbox' }],
      values: isNew ? { name: '', rate: '', def: !jobPays(job).length } : { name: pay.name, rate: String(pay.rate).replace('.', ','), def: defaultPay(job)?.id === pay.id }, allowDelete: !isNew
    });
    if (!r) return;
    if (r.__delete) {
      const used = job.rows.filter(x => (x.rate === '' || x.rate == null) && x.pay === pay.id).length;
      if (!confirm(`Eliminare «${pay.name}»?${used ? ` Le ${used} giornate che la usano mantengono l'importo già calcolato.` : ''}`)) return;
      job.rows.forEach(x => { if ((x.rate === '' || x.rate == null) && (x.pay === pay.id || (!x.pay && defaultPay(job)?.id === pay.id))) { x.rate = num(pay.rate); x.pay = ''; } });
      job.pays = jobPays(job).filter(p => p !== pay);
      if (job.defPay === pay.id) job.defPay = job.pays[0]?.id || '';
      return this.save();
    }
    const name = r.name.trim() || 'Paga ' + job.name, rate = parseNum(r.rate);
    if (rate === null || rate <= 0) { alert('Scrivi la paga come numero maggiore di zero (es. 8,50)'); return; }
    if (isNew) { pay = { id: newId(), name, rate }; job.pays = [...jobPays(job), pay]; } else { pay.name = name; pay.rate = rate; }
    if (r.def || !job.defPay) job.defPay = pay.id;
    this.save();
  }
}
