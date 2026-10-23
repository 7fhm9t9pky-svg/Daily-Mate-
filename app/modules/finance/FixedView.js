import { Component } from '../../ui/Component.js';
import { state, inMonth, undo, isRestricted, changeBank, targets } from './fixed.js';
import { tileHTML, askNewPage, dndHandlers } from './FinanceView.js';
import { enableTileDnD } from './dnd.js';
import { MES } from './LavoroBook.js';
import { sheetVisible } from './FinanceView.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const itd = iso => iso.slice(8) + '/' + iso.slice(5, 7);

/** "Resoconto spese fisse": cosa e' stato pagato (e da quale banca) mese per mese, e cosa sta per scadere. */
export class FixedView extends Component {
  constructor({ book, onBack, onOpen }) { super(); this.book = book; this.onBack = onBack; this.onOpen = onOpen; const n = new Date(); this.y = n.getFullYear(); this.m = n.getMonth(); }

  render() {
    const el = document.createElement('section');
    el.className = 'page sheet-page';
    el.innerHTML = '<div class="page-head"><button class="back" data-act="back">‹ Entrate e uscite</button><h1>Resoconto spese fisse</h1></div><div class="sheet-body"></div>';
    el.querySelector('[data-act=back]').onclick = () => this.onBack();
    el.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-step]')) { this.m += +t.closest('[data-step]').dataset.step; if (this.m < 0) { this.m = 11; this.y--; } if (this.m > 11) { this.m = 0; this.y++; } return this.refresh(); }
      const tl = t.closest('.sheet-tile[data-i]'); if (tl) return this.onOpen?.(+tl.dataset.i);
      if (t.closest('[data-newsub]')) { askNewPage('Resoconto spese fisse').then(d => { if (d) this.onOpen?.(this.book.addCustom({ ...d, parent: 'fixed' })); }); return; }
      const ch = t.closest('[data-bank]');
      if (ch) { this.#pickBank(ch.dataset.bank); return; }
      const u = t.closest('[data-undo]');
      if (u) { const e = state(this.book).log.find(x => x.id === u.dataset.undo); if (e && confirm(e.deducted ? `Elimino questo pagamento e rimetto ${eur(e.amount)} su ${e.bank}?` : 'Elimino questo pagamento dal resoconto?')) { undo(this.book, e.id); this.refresh(); } }
    });
    this.body = el.querySelector('.sheet-body');
    return el;
  }

  afterMount() { this.refresh(); }

  /** Finestra per scegliere la banca giusta di un pagamento gia' registrato. */
  #pickBank(id) {
    const e = state(this.book).log.find(x => x.id === id); if (!e) return;
    const opts = targets(this.book), cur = opts.find(o => o.label === e.bank)?.id || '';
    const ov = document.createElement('div'); ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal"><h3>Con quale banca hai pagato?</h3><p class="tpl-sub">${esc(e.name)} · ${eur(e.amount)}. Rimetto i soldi sulla banca di prima e li tolgo da quella nuova.</p>
      <label class="field"><select name="b">${opts.map(o => `<option value="${esc(o.id)}"${o.id === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}<option value=""${cur ? '' : ' selected'}>Nessuna (non scalare)</option></select></label>
      <div class="modal-actions"><button class="btn" data-x="no">Annulla</button><button class="btn primary" data-x="ok">Salva</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', async ev => {
      const x = ev.target.closest('[data-x]')?.dataset.x;
      if (ev.target === ov || x === 'no') return ov.remove();
      if (x === 'ok') { try { await changeBank(this.book, id, ov.querySelector('select').value || null); ov.remove(); this.refresh(); } catch (err) { alert(err.message || 'Non sono riuscito a cambiarla'); } }
    });
  }

  refresh() {
    const S = state(this.book), pre = this.y + '-' + String(this.m + 1).padStart(2, '0');
    const log = S.log.filter(e => e.d.startsWith(pre)).sort((a, b) => b.d.localeCompare(a.d));
    const tot = log.reduce((a, e) => a + e.amount, 0), by = {};
    log.forEach(e => { const k = e.bank || 'Non scalato da nessun conto'; by[k] = (by[k] || 0) + e.amount; });
    const up = inMonth(this.book, this.y, this.m);
    let h = `<p class="hint">💡 Quando arriva il giorno di un abbonamento, di una bolletta o di una spesa con la data nel futuro, l'app ti chiede con quale banca hai pagato e scala i soldi da sola. Qui trovi tutto.</p>
      <div class="cal-nav"><button class="btn" data-step="-1">‹</button><b>${MES[this.m][0].toUpperCase() + MES[this.m].slice(1)} ${this.y}</b><button class="btn" data-step="1">›</button></div>
      <div class="tiles"><div class="tl auto big"><small>Pagato nel mese</small><b>${eur(tot)}</b></div>${Object.entries(by).map(([k, v]) => `<div class="tl auto"><small>${esc(k)}</small><b>${eur(v)}</b></div>`).join('')}</div>
      <h2 class="s">Pagamenti del mese</h2><div class="lst">${log.map(e => `<div class="it ln"><span>${itd(e.d)} · ${esc(e.name)}<small> ${esc(e.page || '')}${e.bank ? ' · ' + esc(e.bank) : ' · non scalato'}</small></span><b>${eur(e.amount)}</b><button class="undo" data-bank="${e.id}">✎ Cambia banca</button> <button class="undo" data-undo="${e.id}">🗑 Elimina${e.deducted ? ' e riaccredita' : ''}</button></div>`).join('') || '<p class="empty-s">Ancora nessun pagamento registrato questo mese.</p>'}</div>
      <h2 class="s">Scadenze di ${MES[this.m]} ancora da pagare</h2><div class="lst">${up.map(x => `<div class="it ln"><span>${itd(new Date(Date.UTC(1899, 11, 30) + x.due * 864e5).toISOString().slice(0, 10))} · ${esc(x.name)}<small> ${esc(x.page)}</small></span><b>${eur(x.amount)}</b></div>`).join('') || '<p class="empty-s">Nessuna scadenza in arrivo questo mese.</p>'}</div>`;
    const kids = this.book.childrenOf('fixed').filter(x => sheetVisible(this.book, x));
    h += `<h2 class="s">Le tue spese fisse, a modo tuo</h2><p class="set-note">${isRestricted(this.book) ? 'Le scadenze vengono chieste solo per le pagine messe qui dentro.' : 'Trascina qui dentro (tieni premuto un quadretto) le pagine che vuoi raggruppare, per esempio Abbonamenti, Telefono, Auto. Finché qui non c\'è nulla controllo tutte le tue pagine; dopo, solo queste.'}</p>
      <div class="dnd-up" data-dnd-up="1">⬆ Trascina qui per portare fuori da “Resoconto spese fisse”</div>
      <div class="sheet-grid sub-grid">${kids.map(x => tileHTML(this.book, x)).join('')}<button class="sheet-tile add-tile" data-newsub="1"><h3>＋ Nuova pagina qui dentro</h3><div class="k">Modello pronto o da zero</div></button></div>`;
    this.body.innerHTML = h;
    enableTileDnD(this.body.querySelector('.sub-grid'), dndHandlers(this.book, 'fixed', () => this.refresh()));
  }
}
