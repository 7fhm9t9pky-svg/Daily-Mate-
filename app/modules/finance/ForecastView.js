import { Component } from '../../ui/Component.js';
import { forecast } from './forecast.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const gm = d => `${d.getDate()}/${d.getMonth() + 1}`;

/** "Prospettiva": quanto avrai a fine mese e il mese dopo, con le spese sicure (abbonamenti, scadenze) e quelle abituali. */
export class ForecastView extends Component {
  constructor({ book, onBack }) { super(); this.book = book; this.onBack = onBack; }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = '<div class="page-head"><button class="back" data-act="back">‹ Finanze</button><h1>Prospettiva</h1></div><div class="sheet-body"></div>';
    el.querySelector('[data-act=back]').onclick = () => this.onBack();
    this.body = el.querySelector('.sheet-body');
    return el;
  }

  async afterMount() { this.refresh(); if (this.book.useWealth()) { await this.book.loadRates(); if (this.el.isConnected) this.refresh(); } }

  refresh() {
    const F = forecast(this.book);
    const tile = (l, v, big, cls = '') => `<div class="tl auto${big ? ' big' : ''} ${cls}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
    const list = (rows, empty) => `<div class="lst">${rows.map(r => `<div class="it ln"><span>${gm(r.date)} · ${esc(r.name)}${r.kind === 'abbonamento' ? ' <em class="chip">abbonamento</em>' : ''}</span><b>${eur(r.amount)}</b></div>`).join('') || `<p class="empty-s">${empty}</p>`}</div>`;
    let h = `<p class="hint">💡 Parto dai soldi che hai ora, tolgo le spese sicure (abbonamenti con il giorno di rinnovo e scadenze non pagate) e quelle che di solito fai. Più spese registri, più la stima è precisa.</p>`;
    h += '<div class="tiles">' + tile('Soldi disponibili ora', eur(F.liquid))
      + tile(`Stima a fine ${F.month}`, F.usualDaily == null && !F.sure.length ? eur(F.liquid) : eur(F.endMonth), true, F.endMonth < 0 ? 'neg' : '')
      + tile('Spese sicure fino a fine mese', eur(F.sureTot)) + tile(`Spese abituali (${F.daysLeft} giorni)`, F.usualDaily == null ? '—' : eur(F.usualLeft)) + '</div>';
    h += `<p class="set-note">Spese abituali: ${F.usualDaily == null ? 'non ho abbastanza spese registrate per stimarle.' : `circa ${eur(F.usualDaily)} al giorno, in base a ${esc(F.source)}.`}</p>`;
    if (F.incomingTot > 0) h += `<h2 class="s">Soldi che potrebbero arrivare (non li ho contati)</h2><div class="lst">${F.incoming.map(x => `<div class="it ln"><span>${esc(x.label)}</span><b>${eur(x.amount)}</b></div>`).join('')}</div><p class="set-note">Se arrivano tutti, a fine ${F.month} avresti circa ${eur(F.endMonth + F.incomingTot)}.</p>`;
    const T = F.total, sg = n => (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',');
    h += `<h2 class="s">Patrimonio totale (stima)</h2><div class="tiles">` + tile('Patrimonio totale oggi', eur(T.now)) + tile(`Stima a fine ${F.month}`, eur(T.end), true, T.end < T.now ? 'neg' : '') + tile(`Stima a fine ${F.nextMonth}`, eur(T.endNext)) + '</div>'
      + `<p class="set-note">Somma: soldi disponibili dopo le spese, quello che devi ancora incassare e gli investimenti. ${T.basis === 'storico' ? `Per gli investimenti ho guardato le ultime ${T.weeks} rilevazioni settimanali: in media ${sg(T.slope)} punti % a settimana, quindi a fine ${F.month} valgono circa ${eur(T.invEnd)} (oggi ${eur(T.invNow)}). È una stima: i mercati possono fare diversamente.` : 'Non ho ancora uno storico degli investimenti, quindi li considero fermi al valore di oggi: dopo qualche settimana la stima terrà conto di come vanno.'}</p>`;
    h += `<h2 class="s">Da pagare entro fine ${F.month}</h2>${list(F.sure, 'Nessuna spesa sicura in arrivo questo mese.')}`;
    h += `<h2 class="s">Il mese dopo: ${F.nextMonth}</h2><div class="tiles">` + tile('Spese sicure', eur(F.nextSure)) + tile('Spese abituali', F.usualDaily == null ? '—' : eur(F.nextUsual))
      + tile(`Stima a fine ${F.nextMonth}`, eur(F.endNext), true, F.endNext < 0 ? 'neg' : '') + '</div>' + list(F.next, 'Nessuna spesa sicura già segnata per il mese dopo.');
    h += '<h2 class="s">💡 Consigli per te</h2>' + (F.tips.map(t => `<div class="tip"><span>${t.i}</span><p>${esc(t.t)}</p></div>`).join('') || '<p class="empty-s">Per ora va tutto bene.</p>');
    this.body.innerHTML = h;
  }
}
