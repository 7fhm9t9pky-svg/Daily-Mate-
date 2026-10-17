import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { parseNum } from '../../core/format.js';
import { tileHTML, askNewPage, sheetVisible } from './FinanceView.js';
import { FIAT, CRYPTO, KINDS, curLabel, eurPer, convert, money, wealthTotals, isCrypto } from './wealth.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const opts = list => list.map(c => ({ value: c, label: curLabel(c) }));
const FIAT_OPTS = opts(FIAT), CRYPTO_OPTS = opts(CRYPTO);

/**
 * "Patrimonio" per gli utenti: l'utente scrive dove ha i suoi soldi (contanti, conto o carta, cripto),
 * in quale valuta, e se sono soldi che puo' investire. Tutto viene convertito nella valuta che sceglie
 * in alto. I cambi arrivano dal server ma si possono scrivere a mano.
 */
export class WealthView extends Component {
  constructor({ book, title, onBack, onOpen }) { super(); this.book = book; this.title = title; this.onBack = onBack; this.onOpen = onOpen; this.w = book.st.wealth; }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = `<div class="page-head"><button class="back" data-act="back">‹ Finanze</button><h1>${esc(this.title)}</h1></div><div class="sheet-body"></div>`;
    el.querySelector('[data-act=back]').onclick = () => this.onBack();
    this.body = el.querySelector('.sheet-body');
    this.body.addEventListener('click', e => this.#click(e));
    this.body.addEventListener('change', e => { const b = e.target.closest('[data-base]'); if (b) { this.w.base = b.value; this.save(); } });
    return el;
  }

  async afterMount() { this.refresh(); await this.book.loadRates(); if (this.el.isConnected) this.refresh(); }

  save() { this.book.commit(); this.refresh(); }

  refresh() {
    const bk = this.book, w = this.w, rates = bk.rates, base = w.base, T = bk.wealthTotals(), keep = this.el.closest('.app-main')?.scrollTop ?? 0;
    const tile = (l, v, big) => `<div class="tl auto${big ? ' big' : ''}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
    let h = `<p class="hint">💡 Scrivi dove tieni i tuoi soldi: contanti, conti o carte, cripto. Ogni importo può avere la sua valuta e viene convertito automaticamente in quella che scegli qui sotto.</p>
      <div class="w-cur"><label>Mostra tutto in <select data-base>${FIAT_OPTS.map(o => `<option value="${o.value}"${o.value === base ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label></div>`;
    h += '<div class="tiles">' + tile('Patrimonio totale', money(T.total, base), true)
      + tile('Soldi disponibili', money(T.liquid, base)) + tile('Soldi da investire', money(T.invest, base))
      + tile('Già investiti', money(T.invested, base)) + tile('Crediti da riscuotere', money(T.credits, base)) + tile('Lavoro da ricevere', money(T.work, base))
      + tile('Contanti', money(T.cash, base)) + tile('Conti e carte', money(T.digital, base)) + tile('Cripto', money(T.crypto, base)) + '</div>';
    if (T.missing.length) h += `<p class="hint warn">⚠ Manca il cambio per: ${T.missing.map(esc).join(', ')}. Queste cifre non sono nel totale: tocca la valuta in “Cambi” e scrivi tu il valore.</p>`;
    h += `<p class="set-note">Il patrimonio totale = soldi disponibili + soldi già investiti (dalla pagina Investimenti) + quello che devi ancora incassare (crediti e lavoro: arretrati + paga del periodo − acconti).</p>`;

    const rowHTML = (it, K) => {
      const conv = it.cur !== base ? convert(Number(it.amount) || 0, it.cur, base, rates, w.ov) : null;
      return `<div class="it ln" data-item="${it.id}"><span>${esc(it.name || K.label)}${it.inv ? ' <em class="chip">da investire</em>' : ''}</span><b>${esc(money(Number(it.amount) || 0, it.cur))}${it.cur !== base ? `<small>${conv == null ? 'cambio mancante' : '≈ ' + esc(money(conv, base))}</small>` : ''}</b></div>`;
    };
    for (const [kind, K] of Object.entries(KINDS)) {
      const rows = w.items.filter(i => i.kind === kind);
      h += `<h2 class="s">${K.icon} ${esc(K.plural)}</h2>`;
      if (kind === 'cash') {
        h += `<div class="lst">${rows.map(it => rowHTML(it, K)).join('') || '<p class="empty-s">Niente qui per ora.</p>'}</div><button class="add" data-new="cash">+ ${esc(K.add)}</button>`;
        continue;
      }
      // conti e cripto: raggruppati per banca, ogni banca puo' avere piu' conti (ognuno con la sua valuta)
      const groups = new Map();
      for (const it of rows) { const k = (it.bank || '').trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
      if (!rows.length) h += `<div class="lst"><p class="empty-s">Niente qui per ora.</p></div>`;
      for (const [bank, list] of groups) {
        let sub = 0, miss = false;
        for (const it of list) { const v = convert(Number(it.amount) || 0, it.cur, base, rates, w.ov); if (v == null) miss = true; else sub += v; }
        h += `<div class="bk"><div class="bk-h"><b>${esc(bank || (kind === 'crypto' ? 'Senza wallet o piattaforma' : 'Senza banca'))}</b><span>${list.length > 1 || bank ? esc(money(sub, base)) + (miss ? ' +?' : '') : ''}</span></div><div class="lst">${list.map(it => rowHTML(it, K)).join('')}</div>${bank ? `<button class="bk-add" data-new="${kind}" data-bank="${esc(bank)}">+ Altro conto in ${esc(bank)}</button>` : ''}</div>`;
      }
      h += `<button class="add" data-new="${kind}">+ ${esc(kind === 'crypto' ? K.add : 'Aggiungi un conto o una carta (anche di una nuova banca)')}</button>`;
    }

    h += `<h2 class="s">🤝 Crediti (soldi che ti devono)</h2><div class="lst">`;
    for (const c of w.credits) h += `<div class="it ln" data-credit="${c.id}"><span>${esc(c.name || 'Credito')}</span><b>${esc(money(Number(c.amount) || 0, c.cur))}${c.cur !== base ? `<small>${convert(Number(c.amount) || 0, c.cur, base, rates, w.ov) == null ? 'cambio mancante' : '≈ ' + esc(money(convert(Number(c.amount) || 0, c.cur, base, rates, w.ov), base))}</small>` : ''}</b></div>`;
    if (!w.credits.length) h += `<p class="empty-s">Nessun credito. Aggiungi chi ti deve dei soldi e quanto.</p>`;
    h += `</div><button class="add" data-newcredit="1">+ Aggiungi un credito</button>`;

    // cambi delle valute usate
    const used = [...new Set([base, ...w.items.map(i => i.cur), ...w.credits.map(c => c.cur)])].filter(c => c !== 'EUR');
    if (used.length) {
      const when = rates?.updated ? new Date(rates.updated).toLocaleDateString('it-IT') : null;
      h += `<h2 class="s">Cambi</h2><p class="set-note">${when ? `Cambi aggiornati automaticamente (ultimo aggiornamento: ${when}).` : 'I cambi automatici non sono disponibili in questo momento: scrivili tu.'} Tocca una riga per scrivere un cambio tuo.</p><div class="lst">`;
      for (const c of used) {
        const r = eurPer(c, rates, w.ov), mine = w.ov[c] > 0;
        h += `<div class="it ln" data-rate="${c}"><span>1 ${esc(c)} <em class="chip">${mine ? 'scritto da te' : 'automatico'}</em></span><b>${r == null ? 'manca' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: r < 1 ? 5 : 2 }).format(r) + ' €'}</b></div>`;
      }
      h += '</div>';
    }

    const kids = this.book.childrenOf(0).filter(x => sheetVisible(this.book, x));
    h += `<h2 class="s">Sottopagine</h2><div class="sheet-grid">${kids.map(x => tileHTML(this.book, x)).join('')}<button class="sheet-tile add-tile" data-newsub="1"><h3>＋ Nuova sottopagina</h3><div class="k">Aggiungi una pagina dentro questa</div></button></div>`;
    this.body.innerHTML = h;
    const sc = this.el.closest('.app-main'); if (sc) sc.scrollTop = keep;
  }

  #click(e) {
    const q = s => e.target.closest(s), w = this.w;
    const n = q('[data-new]'); if (n) return this.itemForm(null, n.dataset.new, n.dataset.bank || '');
    const it = q('[data-item]'); if (it) return this.itemForm(w.items.find(x => x.id === it.dataset.item));
    if (q('[data-newcredit]')) return this.creditForm(null);
    const cr = q('[data-credit]'); if (cr) return this.creditForm(w.credits.find(x => x.id === cr.dataset.credit));
    const rt = q('[data-rate]'); if (rt) return this.rateForm(rt.dataset.rate);
    const tl = q('.sheet-tile[data-i]'); if (tl) return this.onOpen?.(+tl.dataset.i);
    if (q('[data-newsub]')) askNewPage(this.title).then(d => { if (d) this.onOpen?.(this.book.addCustom({ ...d, parent: 0 })); });
  }

  async itemForm(item, kind = item?.kind, bank = '') {
    const r = await FormModal.open({
      title: item ? 'Modifica' : KINDS[kind].add,
      fields: [
        { key: 'bank', suggest: this.book.banks(), label: 'Banca o piattaforma (lascia vuoto per i contanti)', type: 'text' },
        { key: 'name', label: kind === 'cash' ? 'Nome (es. Portafoglio, Salvadanaio)' : kind === 'crypto' ? 'Nome (es. Wallet principale)' : 'Nome del conto (es. Conto corrente, Carta, Risparmio)', type: 'text' },
        { key: 'kind', label: 'Che tipo di soldi sono?', type: 'select', options: Object.entries(KINDS).map(([k, K]) => ({ value: k, label: K.label })) },
        { key: 'cur', label: 'Valuta', type: 'select', optionsBy: { field: 'kind', map: { cash: FIAT_OPTS, digital: FIAT_OPTS, crypto: CRYPTO_OPTS } } },
        { key: 'amount', label: 'Quanto?', type: 'text' },
        { key: 'inv', label: 'Sono soldi che posso investire', type: 'checkbox' }
      ],
      values: item ? { ...item, amount: String(item.amount).replace('.', ',') } : { name: '', bank, kind, cur: kind === 'crypto' ? 'BTC' : this.w.base, amount: '', inv: false }, allowDelete: !!item
    });
    if (!r) return;
    if (r.__delete) { this.w.items = this.w.items.filter(x => x !== item); return this.save(); }
    const amount = String(r.amount).trim() === '' ? 0 : parseNum(r.amount);
    if (amount === null || amount < 0) { alert('Scrivi un importo valido (solo numeri)'); return; }
    const bankName = r.kind === 'cash' ? '' : r.bank.trim().slice(0, 30);
    const data = { id: item?.id || uid(), name: r.name.trim(), bank: bankName, kind: r.kind, cur: r.cur, amount, inv: !!r.inv };
    if (bankName && !this.book.banks().some(b => b.toLowerCase() === bankName.toLowerCase())) this.book.st.cfg.banks = [...this.book.banks(), bankName];   // la nuova banca va nella Configurazione
    if (item) Object.assign(item, data); else this.w.items.push(data);
    this.save();
  }

  async creditForm(c) {
    const r = await FormModal.open({
      title: c ? 'Credito' : 'Nuovo credito',
      fields: [{ key: 'name', label: 'Chi ti deve i soldi', type: 'text' }, { key: 'cur', label: 'Valuta', type: 'select', options: FIAT_OPTS }, { key: 'amount', label: 'Quanto ti deve?', type: 'text' }],
      values: c ? { ...c, amount: String(c.amount).replace('.', ',') } : { name: '', cur: this.w.base, amount: '' }, allowDelete: !!c
    });
    if (!r) return;
    if (r.__delete) { this.w.credits = this.w.credits.filter(x => x !== c); return this.save(); }
    const amount = String(r.amount).trim() === '' ? 0 : parseNum(r.amount);
    if (amount === null || amount < 0) { alert('Scrivi un importo valido (solo numeri)'); return; }
    const data = { id: c?.id || uid(), name: r.name.trim(), cur: r.cur, amount };
    if (c) Object.assign(c, data); else this.w.credits.push(data);
    this.save();
  }

  async rateForm(cur) {
    const mine = this.w.ov[cur] > 0, auto = eurPer(cur, this.book.rates, {});
    const r = await FormModal.open({
      title: `Cambio ${cur}`,
      fields: [
        { key: 'auto', label: 'Usa il cambio automatico', type: 'checkbox' },
        { key: 'v', label: `Quanti euro vale 1 ${cur}? (solo se non usi quello automatico)`, type: 'text' }
      ],
      values: { auto: !mine, v: String(mine ? this.w.ov[cur] : auto ?? '').replace('.', ',') }
    });
    if (!r || r.__delete) return;
    if (r.auto) delete this.w.ov[cur];
    else { const v = parseNum(r.v); if (v === null || v <= 0) { alert('Scrivi un numero maggiore di zero'); return; } this.w.ov[cur] = v; }
    this.save();
  }
}
void isCrypto; void wealthTotals;
