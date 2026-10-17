import { serialToDate } from './LavoroBook.js';
import { workTotals } from './WorkView.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const EXPENSE_TPLS = ['home', 'personal', 'pet', 'car', 'travel', 'gifts', 'health', 'kids', 'hobby', 'tech', 'groceries', 'taxes'];
const dayOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dateOfSerial = v => { const u = serialToDate(v); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
const addMonths = (d, n, anchor) => { const t = new Date(d.getFullYear(), d.getMonth() + n, 1); t.setDate(Math.min(anchor, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return t; };
export const monthName = m => MESI[((m % 12) + 12) % 12];

/** Prossime scadenze di un abbonamento da `start` (data del prossimo rinnovo) con il suo ritmo. */
function renewals(start, period, from, to) {
  const out = []; let d = dayOf(start), k = 0, guard = 0;
  const step = () => {
    if (period === 'Settimana') { const t = new Date(d); t.setDate(t.getDate() + 7); return t; }
    k += period === 'Anno' ? 12 : period === '3 mesi' ? 3 : 1;
    return addMonths(start, k, start.getDate());
  };
  while (d < from && guard++ < 600) d = step();           // rinnovo gia' passato: porto avanti fino al prossimo
  while (d <= to && guard++ < 1200) { out.push(new Date(d)); d = step(); }
  return out;
}

/**
 * Prospettiva dei soldi: quanto avrai a fine mese e il mese dopo, partendo da quello che hai ora e togliendo
 * le spese sicure (abbonamenti e scadenze non pagate) e quelle che di solito fai (media delle tue spese registrate).
 */
export function forecast(book, now = new Date()) {
  const today = dayOf(now), y = today.getFullYear(), m = today.getMonth();
  const eom = new Date(y, m + 1, 0), nStart = new Date(y, m + 1, 1), nEnd = new Date(y, m + 2, 0);
  const owner = !book.useWealth();
  const pages = book.st.custom.map((d, k) => [d, book.base + k]).filter(([d]) => !d.deleted && d.tpl);
  const rows = (i, from = 4, to = 300) => { const o = []; for (let r = from; r <= to; r++) { const name = book.val(i, 'A' + r); if (name == null || name === '') { if (r > from + 40) break; continue; } o.push(r); } return o; };
  const n = (i, a) => { const v = book.val(i, a); return typeof v === 'number' ? v : null; };
  const s = v => { const x = book.val(...v); return typeof x === 'string' ? x : ''; };

  const sure = [], next = [], unknown = [], overdue = [];
  let subsMonthly = 0, subsCount = 0;
  for (const [d, i] of pages) {
    if (d.tpl === 'subs') {
      for (const r of rows(i)) {
        const amt = n(i, 'B' + r), dt = n(i, 'D' + r); if (!amt) continue;
        subsCount++; subsMonthly += n(i, 'E' + r) || amt;
        if (!dt) { unknown.push(String(book.val(i, 'A' + r))); continue; }
        const period = s([i, 'C' + r]) || 'Mese', name = String(book.val(i, 'A' + r));
        for (const x of renewals(dateOfSerial(dt), period, today, nEnd)) (x <= eom ? sure : next).push({ date: x, name, amount: amt, kind: 'abbonamento' });
      }
    } else if (d.tpl === 'bills') {
      for (const r of rows(i)) {
        const amt = n(i, 'B' + r), dt = n(i, 'C' + r); if (!amt || s([i, 'D' + r]) === 'Pagata' || !dt) continue;
        const x = dateOfSerial(dt), name = String(book.val(i, 'A' + r));
        if (x < today) { sure.push({ date: today, name: name + ' (scaduta)', amount: amt, kind: 'scadenza' }); overdue.push(name); }
        else if (x <= eom) sure.push({ date: x, name, amount: amt, kind: 'scadenza' });
        else if (x <= nEnd) next.push({ date: x, name, amount: amt, kind: 'scadenza' });
      }
    }
  }
  const byDate = (a, b) => a.date - b.date;
  sure.sort(byDate); next.sort(byDate);

  // spese abituali: media giornaliera delle spese registrate negli ultimi 60 giorni (pagine "spese")
  const from60 = new Date(today); from60.setDate(from60.getDate() - 60);
  let tot = 0, first = null, expRows = 0;
  for (const [d, i] of pages) {
    if (!EXPENSE_TPLS.includes(d.tpl)) continue;
    for (const r of rows(i)) {
      const amt = n(i, 'B' + r), dt = n(i, 'D' + r); if (!amt || !dt) continue;
      expRows++;
      const x = dateOfSerial(dt); if (x < from60 || x > today) continue;
      tot += amt; if (!first || x < first) first = x;
    }
  }
  let usualDaily = null, source = '';
  if (tot > 0) { const days = Math.max(14, Math.round((today - Math.max(first, from60)) / 864e5) + 1); usualDaily = tot / days; source = 'le spese che hai registrato negli ultimi mesi'; }
  else if (owner) {                                                     // amministratore: media dei mesi passati in "Entrate e uscite"
    const out = [];
    for (let k = 0; k < m; k++) { const g = n(5, 'G' + (22 + k)) || ((n(5, 'E' + (22 + k)) || 0) + (n(5, 'F' + (22 + k)) || 0)); if (g) out.push(g); }
    const last = out.slice(-3);
    if (last.length) { usualDaily = Math.max(0, last.reduce((a, b) => a + b, 0) / last.length - subsMonthly) / 30.4; source = 'la media delle tue uscite negli ultimi mesi (senza gli abbonamenti, già contati a parte)'; }
  }

  let liquid, credits = 0;
  if (owner) { credits = n(0, 'C31') || 0; liquid = (n(0, 'A6') || 0) - (n(0, 'B11') || 0) - (n(0, 'B26') || 0) - credits; }   // Totale originale meno investimenti e soldi ancora da incassare
  else { const T = book.wealthTotals('EUR'); liquid = T.liquid; credits = T.credits; }
  const W = workTotals(book.st.work);
  const incoming = [];
  if (W.totale > 0) incoming.push({ label: 'Da ricevere per il lavoro (arretrati + paga − acconti)', amount: W.totale });
  else if (owner && book.legacyHours?.() && (n(0, 'B26') || 0) > 0) incoming.push({ label: 'Paga da ricevere', amount: n(0, 'B26') });
  if (credits > 0) incoming.push({ label: 'Crediti da riscuotere', amount: credits });

  const sum = l => l.reduce((a, b) => a + b.amount, 0);
  const daysLeft = eom.getDate() - today.getDate(), nDays = nEnd.getDate();
  const sureTot = sum(sure), usualLeft = (usualDaily || 0) * daysLeft;
  const endMonth = liquid - sureTot - usualLeft;
  const nextSure = sum(next), nextUsual = (usualDaily || 0) * nDays;
  const F = { liquid, sure, sureTot, usualDaily, usualLeft, source, daysLeft, endMonth, month: monthName(m), nextMonth: monthName(m + 1),
    next, nextSure, nextUsual, endNext: endMonth - nextSure - nextUsual, incoming, incomingTot: sum(incoming), subsMonthly, subsCount, unknown, overdue, expRows };
  F.tips = tips(book, F, { owner, today, m, W });
  return F;
}

/** Consigli di Daily Mate, ricavati da quello che c'e' nei tuoi dati. */
function tips(book, F, { owner, today, m, W }) {
  const t = [], eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
  if (F.endMonth < 0) t.push({ i: '⚠️', t: `A fine ${F.month} potresti essere in rosso di circa ${eur(-F.endMonth)}: guarda se puoi spostare qualche spesa o incassare i soldi che ti devono.` });
  else if (F.usualDaily != null && F.endMonth > 0) t.push({ i: '🐖', t: `A fine ${F.month} ti restano circa ${eur(F.endMonth)}. Se ne metti da parte il 20% (${eur(F.endMonth * 0.2)}) fai un passo avanti senza sentire la differenza.` });
  if (F.usualDaily == null) t.push({ i: '✍️', t: 'Non vedo spese registrate: crea una pagina “Spese personali” o “Spesa alimentare” (＋ Nuova pagina) e segna quello che spendi. Con 2-3 settimane di dati la previsione diventa molto più precisa.' });
  if (F.overdue.length) t.push({ i: '🧾', t: `Hai scadenze già passate non pagate: ${F.overdue.slice(0, 3).join(', ')}. Pagale o segnale come “Pagata” per tenere la previsione pulita.` });
  if (F.unknown.length) t.push({ i: '🔁', t: `Per ${F.unknown.slice(0, 3).join(', ')} manca la data del prossimo rinnovo: aggiungila negli Abbonamenti e la conto nella previsione.` });
  if (F.subsCount >= 3) t.push({ i: '✂️', t: `I tuoi ${F.subsCount} abbonamenti costano circa ${eur(F.subsMonthly)} al mese (${eur(F.subsMonthly * 12)} l'anno). Ogni tanto controlla quali usi davvero.` });
  const old = (book.st.work.owed || []).filter(o => o.year * 12 + o.month < today.getFullYear() * 12 + today.getMonth() - 1);
  if (old.length) { const o = old[0], job = book.st.work.jobs.find(j => j.id === o.job)?.name || 'l\'azienda'; t.push({ i: '💼', t: `Gli arretrati di ${monthName(o.month)} ${o.year} da ${job} sono fermi da più di un mese: conviene ricordare di chiederli.` }); }
  else if (W.arretrati > 0) t.push({ i: '💼', t: `Hai ${eur(W.arretrati)} di arretrati da incassare: quando arrivano, elimina la voce in Ore lavoro e il saldo si aggiorna.` });
  if (owner) {
    if (book.num(4, 'B' + (29 + m)) == null) t.push({ i: '📅', t: `In Amministrazione non hai ancora salvato il patrimonio di ${monthName(m)}: a fine mese scrivilo, così il grafico resta aggiornato.` });
    if (/^=B3[0-9]$/.test(String(book.sheets[4].cells.B5 || '')) && String(book.sheets[4].cells.B5) !== '=B' + (29 + m)) t.push({ i: '🔗', t: `Il totale “2026” in Amministrazione punta a una riga fissa (${book.sheets[4].cells.B5.slice(1)}), non al mese in corso: ti conviene farlo puntare a ${monthName(m)}.` });
  }
  return t.slice(0, 7);
}
