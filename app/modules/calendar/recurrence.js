/** Eventi ripetuti: funzioni pure (usate dal calendario e dal server per i promemoria). Le date sono "AAAA-MM-GG". */
const p2 = n => String(n).padStart(2, '0');
const parts = iso => iso.split('-').map(Number);
const utc = iso => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const dim = (y, m) => new Date(y, m, 0).getDate();           // giorni del mese m (1-12)

export const REPEATS = [['none', 'Non si ripete'], ['daily', 'Ogni giorno'], ['weekdays', 'Dal lunedì al venerdì'], ['weekly', 'Ogni settimana'], ['biweekly', 'Ogni 2 settimane'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']];

/** L'evento `e` cade nel giorno `iso`? (tiene conto di ripetizione, data di fine e giorni saltati) */
export function occursOn(e, iso) {
  if (!e?.date || !iso) return false;
  if ((e.skip || []).includes(iso)) return false;
  const r = e.repeat || 'none';
  if (r === 'none') return e.date === iso;
  if (iso < e.date) return false;
  if (e.until && iso > e.until) return false;
  const n = daysBetween(e.date, iso), [y, m, d] = parts(iso), [, sm, sd] = parts(e.date);
  switch (r) {
    case 'daily': return true;
    case 'weekdays': { const w = new Date(y, m - 1, d).getDay(); return w >= 1 && w <= 5; }
    case 'weekly': return n % 7 === 0;
    case 'biweekly': return n % 14 === 0;
    case 'monthly': return d === Math.min(sd, dim(y, m));          // il 31 cade l'ultimo giorno dei mesi corti
    case 'yearly': return m === sm && d === Math.min(sd, dim(y, m));
    default: return e.date === iso;
  }
}

/** Tutte le occorrenze tra due date (estremi inclusi): [{ ...evento, date: giorno, series: id, origDate }] */
export function expand(events, from, to) {
  const out = [];
  for (const e of events) {
    if (!e?.date) continue;
    if ((e.repeat || 'none') === 'none') { if (e.date >= from && e.date <= to && !(e.skip || []).includes(e.date)) out.push(Object.assign(Object.create(Object.getPrototypeOf(e)), e, { series: e.id, origDate: e.date })); continue; }
    const start = e.date > from ? e.date : from;
    for (let t = utc(start), end = utc(to); t <= end; t += 864e5) {
      const dt = new Date(t), iso = `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
      if (occursOn(e, iso)) out.push(Object.assign(Object.create(Object.getPrototypeOf(e)), e, { date: iso, series: e.id, origDate: e.date }));
    }
  }
  return out;
}
