import { dueNow, targets, pay, skip } from './fixed.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const when = v => { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

/** Finestra "Oggi scadono…": per ogni voce scegli la banca con cui hai pagato (o "già pagato"/"più tardi"). */
export async function askDue(book) {
  await book.loadRates?.();
  let items = dueNow(book); if (!items.length) return;
  const opts = targets(book);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  const draw = () => {
    items = dueNow(book).filter(x => !overlay._later?.has(x.key));
    if (!items.length) { overlay.remove(); return; }
    overlay.innerHTML = `<div class="modal"><h3>Scadenze da registrare</h3><p class="tpl-sub">Scegli con quale banca hai pagato: scalo io i soldi e li segno nel “Resoconto spese fisse”.</p>
      ${items.map(x => `<div class="due" data-k="${esc(x.key)}"><div class="due-h"><b>${esc(x.name)}</b><span>${eur(x.amount)}</span></div><small>${esc(x.page)} · scade il ${when(x.due)}</small>
        <select>${opts.length ? opts.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('') : '<option value="">Nessun conto: scrivilo in Patrimonio</option>'}</select>
        <div class="due-b"><button class="btn primary" data-do="pay"${opts.length ? '' : ' disabled'}>Pagato: scala</button><button class="btn" data-do="skip">Già pagato (non scalare)</button><button class="btn" data-do="later">Più tardi</button></div></div>`).join('')}
      <div class="modal-actions"><button class="btn" data-do="close">Chiudi</button></div></div>`;
  };
  overlay._later = new Set(); draw();
  overlay.addEventListener('click', async e => {
    const b = e.target.closest('[data-do]'); if (!b) { if (e.target === overlay) overlay.remove(); return; }
    if (b.dataset.do === 'close') return overlay.remove();
    const box = b.closest('[data-k]'), item = items.find(x => x.key === box.dataset.k); if (!item) return;
    try {
      if (b.dataset.do === 'pay') await pay(book, item, box.querySelector('select').value || null);
      else if (b.dataset.do === 'skip') await pay(book, item, null);
      else overlay._later.add(item.key);
    } catch (err) { alert(err.message || 'Non sono riuscito a registrare il pagamento'); }
    draw();
  });
}
