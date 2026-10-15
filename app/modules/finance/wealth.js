/**
 * Patrimonio degli utenti: contanti, conti e carte (digitale) e cripto, ognuno nella sua valuta,
 * convertiti nella valuta che l'utente preferisce.
 * Cambi: `rates` arriva dal server ({ perEur: {USD: 1.1}, eurPer: {BTC: 60000} }), l'utente puo' scrivere
 * un cambio suo (`ov`: valuta -> quanti euro vale 1 unita').
 */
export const FIAT = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'ILS', 'INR', 'IDR', 'KRW', 'MXN', 'BRL', 'ZAR', 'THB', 'MYR', 'PHP', 'ISK'];
export const FIAT_NAMES = {
  EUR: 'Euro', USD: 'Dollaro USA', GBP: 'Sterlina', CHF: 'Franco svizzero', JPY: 'Yen', CAD: 'Dollaro canadese', AUD: 'Dollaro australiano', NZD: 'Dollaro neozelandese',
  CNY: 'Yuan', HKD: 'Dollaro di Hong Kong', SGD: 'Dollaro di Singapore', SEK: 'Corona svedese', NOK: 'Corona norvegese', DKK: 'Corona danese', PLN: 'Zloty', CZK: 'Corona ceca',
  HUF: 'Fiorino ungherese', RON: 'Leu rumeno', TRY: 'Lira turca', ILS: 'Shekel', INR: 'Rupia indiana', IDR: 'Rupia indonesiana', KRW: 'Won', MXN: 'Peso messicano',
  BRL: 'Real', ZAR: 'Rand', THB: 'Baht', MYR: 'Ringgit', PHP: 'Peso filippino', ISK: 'Corona islandese'
};
export const CRYPTO = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'SOL', 'ADA', 'DOGE', 'TON', 'LTC', 'DOT'];
export const CRYPTO_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', USDC: 'USD Coin', BNB: 'BNB', XRP: 'XRP', SOL: 'Solana', ADA: 'Cardano', DOGE: 'Dogecoin', TON: 'Toncoin', LTC: 'Litecoin', DOT: 'Polkadot' };
export const KINDS = {
  cash: { label: 'Contanti', plural: 'Contanti', icon: '💵', add: 'Aggiungi contanti' },
  digital: { label: 'Conto o carta (digitale)', plural: 'Conti e carte', icon: '🏦', add: 'Aggiungi un conto o una carta' },
  crypto: { label: 'Cripto', plural: 'Cripto', icon: '🪙', add: 'Aggiungi cripto' }
};
export const isCrypto = c => CRYPTO.includes(c);
export const curLabel = c => `${c} · ${FIAT_NAMES[c] || CRYPTO_NAMES[c] || c}`;

/** Quanti euro vale 1 unita' di `cur` (null se il cambio non c'e'). */
export function eurPer(cur, rates, ov = {}) {
  if (ov[cur] > 0) return ov[cur];
  if (cur === 'EUR') return 1;
  if (isCrypto(cur)) return rates?.eurPer?.[cur] ?? null;
  const p = rates?.perEur?.[cur];
  return p > 0 ? 1 / p : null;
}

export function convert(amount, from, to, rates, ov) {
  if (from === to) return amount;
  const a = eurPer(from, rates, ov), b = eurPer(to, rates, ov);
  return a == null || b == null ? null : amount * a / b;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Totali nella valuta `base`. `invested` = capitale gia' investito (in euro, dalla scheda Investimenti). */
export function wealthTotals(w, rates, base, invested = 0) {
  const T = { base, cash: 0, digital: 0, crypto: 0, invest: 0, missing: [], credits: 0 };
  const add = (it, key) => {
    const v = convert(num(it.amount), it.cur, base, rates, w.ov);
    if (v == null) { if (!T.missing.includes(it.cur)) T.missing.push(it.cur); return null; }
    if (key) T[key] += v;
    return v;
  };
  for (const it of w.items) { const v = add(it, it.kind); if (v != null && it.inv) T.invest += v; }
  for (const c of w.credits || []) add(c, 'credits');
  T.liquid = T.cash + T.digital + T.crypto;
  const inv = convert(invested, 'EUR', base, rates, w.ov);
  T.invested = inv ?? 0;
  T.total = T.liquid + T.invested;
  return T;
}

export function money(n, cur) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (isCrypto(cur)) return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 8 }).format(n) + ' ' + cur;
  try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(n) >= 1000 || cur === 'JPY' || cur === 'KRW' ? 0 : 2 }).format(n); }
  catch { return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n) + ' ' + cur; }
}
