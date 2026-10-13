/** Formattazione italiana di importi, percentuali e numeri. */
export const eur = n => {
  if (n == null || !isFinite(n)) return '—';
  const small = Math.abs(n) < 100 && n % 1 !== 0;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: small ? 2 : 0, maximumFractionDigits: small ? 2 : 0 }).format(n);
};
export const pct = n => {
  if (n == null || !isFinite(n)) return '—';
  const d = Math.abs(n) < 1 ? 2 : 1;
  return (n > 0 ? '+' : '') + new Intl.NumberFormat('it-IT', { maximumFractionDigits: d }).format(n) + '%';
};
export const num = n => (n == null || !isFinite(n)) ? '—' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n);
export const byUnit = (n, unit) => unit === 'eur' ? eur(n) : unit === 'pct' ? pct(n) : num(n);

/** "1.500,50" / "1500.5" / "12,5" -> numero (oppure null) */
export function parseNum(t) {
  let s = String(t).trim().replace(/[€%\s]/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
}
