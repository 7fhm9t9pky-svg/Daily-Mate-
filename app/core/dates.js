/** Date in ora locale (non UTC): le stringhe ISO sono sempre "AAAA-MM-GG". */
const p = n => String(n).padStart(2, '0');

export const toIso = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const todayIso = () => toIso(new Date());
export const fromIso = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
export const daysUntil = iso => Math.round((fromIso(iso) - fromIso(todayIso())) / 864e5);

/** 16/10/2026 */
export const fmtShort = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

/** "martedì 13 ottobre" */
export const fmtLong = iso => fromIso(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

/** "tra 3 giorni", "oggi", "domani", "scaduto da 2 giorni" */
export function relative(iso) {
  if (!iso) return '';
  const n = daysUntil(iso);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}

export const timeToMin = t => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
export const minToTime = n => `${p(Math.floor(n / 60) % 24)}:${p(n % 60)}`;
