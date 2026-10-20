import { serialToDate } from './LavoroBook.js';
import { convert } from './wealth.js';

const EXPENSE_TPLS = ['home', 'personal', 'pet', 'car', 'travel', 'gifts', 'health', 'kids', 'hobby', 'tech', 'groceries', 'taxes'];
const WINDOW = 14;                                           // si chiedono solo le scadenze degli ultimi 14 giorni (le piu' vecchie sono dimenticate)
const r2 = v => Math.round(v * 100) / 100;
const serialOf = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 25569;
const dateOf = v => { const u = serialToDate(v); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
export const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const isRestricted = book => book.st.custom.some((d, k) => { if (d.deleted) return false; for (let p = book.base + k, g = 0; p !== null && g < 50; p = book.parentOf(p), g++) if (book.parentOf(p) === 'fixed') return true; return false; });
export const state = book => (book.st.fixed ||= { done: {}, watch: {}, log: [] });

const rowsOf = (book, i) => { const o = []; for (let r = 4; r <= 300; r++) { const n = book.val(i, 'A' + r); if (n == null || n === '') { if (r > 44) break; continue; } o.push(r); } return o; };
const numAt = (book, i, a) => { const v = book.val(i, a); return typeof v === 'number' ? v : null; };
/** Importo in euro di una casella (se l'hai scritto in un'altra valuta, usa il controvalore). */
const eurOf = (book, i, a) => book.st.cur?.[i + '!' + a]?.eur ?? numAt(book, i, a);

/** Tutte le voci con una scadenza (abbonamenti, bollette, spese pianificate): { key, i, r, kind, name, amount, due(serial), period, page }. */
export function scan(book, now = new Date()) {
  const S = state(book), today = serialOf(now), out = [];
  let changed = false;
  const inFixed = i => { for (let p = i, g = 0; p !== null && p !== undefined && g < 50; p = book.parentOf(p), g++) if (book.parentOf(p) === 'fixed') return true; return false; };
  const restrict = book.st.custom.some((d, k) => !d.deleted && inFixed(book.base + k));      // se hai messo delle pagine dentro "Resoconto spese fisse", contano solo quelle
  book.st.custom.forEach((d, k) => {
    if (d.deleted || !d.tpl) return;
    const i = book.base + k;
    if (restrict && !inFixed(i)) return;
    for (const r of rowsOf(book, i)) {
      const name = String(book.val(i, 'A' + r)), amount = eurOf(book, i, 'B' + r); if (!amount) continue;
      if (d.tpl === 'subs') {
        const due = numAt(book, i, 'D' + r); if (!due) continue;
        out.push({ key: `${i}|${r}|${due}`, i, r, kind: 'subs', name, amount, due, period: String(book.val(i, 'C' + r) || 'Mese'), page: d.name });
      } else if (d.tpl === 'bills') {
        const due = numAt(book, i, 'C' + r); if (!due || book.val(i, 'D' + r) === 'Pagata') continue;
        out.push({ key: `${i}|${r}|${due}`, i, r, kind: 'bills', name, amount, due, page: d.name });
      } else if (EXPENSE_TPLS.includes(d.tpl)) {
        const due = numAt(book, i, 'D' + r); if (!due) continue;
        const key = `${i}|${r}|${due}`;
        if (due > today) { if (!S.watch[key]) { S.watch[key] = 1; changed = true; } out.push({ key, i, r, kind: 'planned', name, amount, due, page: d.name }); }
        else if (S.watch[key]) out.push({ key, i, r, kind: 'planned', name, amount, due, page: d.name });
      }
    }
  });
  if (changed) book.onChange?.(book.st);
  return out.filter(x => !S.done[x.key]);
}

/** Scadenza finta per provare: un abbonamento di oggi (il pagamento e' vero, ma lo si puo' eliminare riaccreditando i soldi). */
export function demoItem(now = new Date()) {
  return { key: 'demo|' + Date.now(), i: -1, r: 0, kind: 'demo', name: 'Abbonamento di esempio', amount: 9.99, due: serialOf(now), period: 'Mese', page: 'Prova' };
}

/** Quelle da chiedere adesso: scadute o in scadenza oggi, non piu' vecchie di 14 giorni. */
export function dueNow(book, now = new Date()) {
  const today = serialOf(now);
  return scan(book, now).filter(x => x.due <= today && x.due >= today - WINDOW).sort((a, b) => a.due - b.due);
}

export function upcoming(book, days = 30, now = new Date()) {
  const today = serialOf(now);
  return scan(book, now).filter(x => x.due > today && x.due <= today + days).sort((a, b) => a.due - b.due);
}

/** Dove puo' essere scalato il pagamento: i conti dell'utente (o le banche del foglio dell'amministratore). */
export function targets(book) {
  if (book.useWealth()) return (book.st.wealth.items || []).filter(it => it.kind !== 'crypto' && !it.inv).map(it => ({ id: 'i:' + it.id, label: (it.bank ? it.bank + ' · ' : '') + it.name }));
  return [['A21', 'BPM'], ['C16', 'Trade Republic'], ['B16', 'Trading 212'], ['D16', 'Revolut']].filter(([a]) => book.num(0, a) != null).map(([a, l]) => ({ id: 'c:' + a, label: l }));
}

function deduct(book, target, eur) {
  const rates = book.rates, ov = book.st.wealth.ov;
  if (target.startsWith('i:')) {
    const it = book.st.wealth.items.find(x => x.id === target.slice(2)); if (!it) return null;
    const native = convert(eur, 'EUR', it.cur, rates, ov); if (native == null) throw new Error('Mi mancano i cambi per ' + it.cur);
    it.amount = r2((Number(it.amount) || 0) - native);
    return { t: 'i', id: it.id, native };
  }
  const a = target.slice(2), cur = book.st.cur[`0!${a}`], v = book.num(0, a); if (v == null) return null;
  let native = eur;
  if (cur) { native = convert(eur, 'EUR', cur.cur, rates, ov); if (native == null) throw new Error('Mi mancano i cambi per ' + cur.cur); book.st.cur[`0!${a}`] = { ...cur, amt: r2(cur.amt - native), eur: r2(cur.eur - eur) }; }
  book.put(0, a, r2(v - eur));
  return { t: 'c', a, native, eur };
}

function refund(book, rf, eur) {
  if (!rf) return;
  if (rf.t === 'i') { const it = book.st.wealth.items.find(x => x.id === rf.id); if (it) it.amount = r2((Number(it.amount) || 0) + rf.native); }
  else { const cur = book.st.cur[`0!${rf.a}`]; if (cur) book.st.cur[`0!${rf.a}`] = { ...cur, amt: r2(cur.amt + rf.native), eur: r2(cur.eur + eur) }; const v = book.num(0, rf.a); if (v != null) book.put(0, rf.a, r2(v + eur)); }
}

/** Prossimo rinnovo di un abbonamento. */
function nextDue(due, period) {
  const d = dateOf(due);
  if (period === 'Settimana') { d.setDate(d.getDate() + 7); return serialOf(d); }
  const k = period === 'Anno' ? 12 : period === '3 mesi' ? 3 : 1, t = new Date(d.getFullYear(), d.getMonth() + k, 1);
  t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return serialOf(t);
}

/** Registra il pagamento: scala dalla banca scelta (se c'e'), scrive nel resoconto, porta avanti il rinnovo. */
export async function pay(book, item, target, now = new Date()) {
  const S = state(book);
  await book.loadRates?.();
  const rf = target ? deduct(book, target, item.amount) : null;
  S.done[item.key] = 1;
  S.log.push({ id: Math.random().toString(36).slice(2, 9), d: isoOf(now), due: isoOf(dateOf(item.due)), name: item.name + (item.kind === 'demo' ? ' (prova)' : ''), amount: item.amount, page: item.page, kind: item.kind,
    bank: target ? targets(book).find(t => t.id === target)?.label || '' : '', rf, deducted: !!rf });
  if (item.kind === 'demo') { /* niente da aggiornare nelle pagine */ }
  else if (item.kind === 'subs') book.put(item.i, 'D' + item.r, nextDue(item.due, item.period));
  else if (item.kind === 'bills') book.put(item.i, 'D' + item.r, 'Pagata');
  book.commit();
}

export function skip(book, item) { state(book).done[item.key] = 1; book.commit(); }

/** Annulla un pagamento registrato: rimette i soldi sul conto. */
export function undo(book, id) {
  const S = state(book), e = S.log.find(x => x.id === id); if (!e) return;
  refund(book, e.rf, e.amount);
  S.log = S.log.filter(x => x.id !== id);
  book.commit();
}

/** Scadenze ancora da pagare in un mese (da oggi, se e' il mese corrente). */
export function inMonth(book, y, m, now = new Date()) {
  const today = serialOf(now), a = Math.max(today + 1, serialOf(new Date(y, m, 1))), z = serialOf(new Date(y, m + 1, 0));
  return scan(book, now).filter(x => x.due >= a && x.due <= z).sort((a, b) => a.due - b.due);
}
