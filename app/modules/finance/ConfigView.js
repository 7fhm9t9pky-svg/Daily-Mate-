import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { parseNum } from '../../core/format.js';
import { setStdRate, stdRate } from './WorkView.js';
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
    const bk = this.book, banks = bk.banks(), keep = this.el.closest('.app-main')?.scrollTop ?? 0, std = stdRate();
    let h = `<p class="lead">Scrivi qui una volta sola i dati che non cambiano mai. Le altre pagine li usano da sole, così ti restano da compilare solo le cifre.</p>`;

    h += `<h2 class="s">🏦 Le mie banche e i miei conti</h2>
      <p class="set-note">Usati in <b>Entrate e uscite</b> (le prime due diventano i nomi delle colonne: ora «${esc(bk.bankName(0))}» e «${esc(bk.bankName(1))}») e come suggerimenti quando aggiungi un conto in <b>Patrimonio</b>.</p><div class="lst">`;
    banks.forEach((b, i) => { h += `<div class="it ln" data-bank="${i}"><span>${esc(b)}</span><b>${i < 2 ? `<small>colonna ${i + 1} di Entrate e uscite</small>` : ''}</b></div>`; });
    if (!banks.length) h += `<p class="empty-s">Nessuna banca scritta. In Entrate e uscite compaiono «Banca 1» e «Banca 2».</p>`;
    h += `</div><button class="add" data-newbank="1">+ Aggiungi una banca o un conto</button>`;

    h += `<h2 class="s">💶 Paga oraria standard</h2>
      <p class="set-note">In <b>Ore lavoro</b> ogni lavoro e ogni giornata propongono questa paga. Quando serve, scegli “Scrivo io” e scrivi una paga diversa.</p>
      <div class="lst"><div class="it ln" data-rate="1"><span>La mia paga standard</span><b>${std > 0 ? esc(eur(std)) + ' all\'ora' : 'Non impostata'}</b></div></div>`;

    h += `<h2 class="s">🌍 Valuta preferita</h2>
      <p class="set-note">In <b>Patrimonio</b> tutti gli importi vengono convertiti in questa valuta. La puoi cambiare quando vuoi.</p>
      <div class="w-cur"><label>Mostra i totali in <select data-base>${FIAT.map(c => `<option value="${c}"${c === bk.st.wealth.base ? ' selected' : ''}>${esc(curLabel(c))}</option>`).join('')}</select></label></div>`;

    this.body.innerHTML = h;
    const sc = this.el.closest('.app-main'); if (sc) sc.scrollTop = keep;
  }

  async #click(e) {
    const q = s => e.target.closest(s);
    if (q('[data-newbank]')) return this.bankForm(null);
    const b = q('[data-bank]'); if (b) return this.bankForm(+b.dataset.bank);
    if (q('[data-rate]')) return this.rateForm();
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

  async rateForm() {
    const r = await FormModal.open({
      title: 'Paga oraria standard',
      fields: [{ key: 'v', label: 'Quanto prendi all\'ora? (€)', type: 'text' }],
      values: { v: String(this.c.rate || '').replace('.', ',') }, allowDelete: stdRate() > 0
    });
    if (!r) return;
    if (r.__delete) this.c.rate = '';
    else {
      const v = String(r.v).trim() === '' ? 0 : parseNum(r.v);
      if (v === null || v < 0) { alert('Scrivi un numero (es. 8,50)'); return; }
      this.c.rate = v || '';
    }
    setStdRate(this.c.rate); this.save();
  }
}
