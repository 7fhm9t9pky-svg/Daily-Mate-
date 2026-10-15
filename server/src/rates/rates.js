import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../db.js';

/**
 * Cambi delle valute: euro come base.
 *  - valute normali: dalla BCE tramite frankfurter.dev (gratuito, senza chiave)
 *  - cripto: prezzo in euro da CoinGecko (gratuito, senza chiave)
 * Si aggiornano al massimo ogni 6 ore. Se internet non c'e' si usa l'ultimo valore salvato
 * (file data/rates.json); se non c'e' nulla l'app chiede all'utente di scrivere il cambio a mano.
 */
const FILE = path.join(DATA_DIR, 'rates.json');
const EVERY = 6 * 3600e3;
const FIAT_URLS = ['https://api.frankfurter.dev/v1/latest?base=EUR', 'https://api.frankfurter.app/latest?from=EUR'];
export const CRYPTO = {
  BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin', BNB: 'binancecoin', XRP: 'ripple',
  SOL: 'solana', ADA: 'cardano', DOGE: 'dogecoin', TON: 'the-open-network', LTC: 'litecoin', DOT: 'polkadot'
};

let cache = { updated: 0, fiat: {}, crypto: {} };
try { cache = { ...cache, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* prima volta */ }

const getJson = async url => {
  const r = await fetch(url, { headers: { 'User-Agent': 'daily-mate', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};

async function fetchFiat() {
  for (const u of FIAT_URLS) {
    try {
      const j = await getJson(u), out = {};
      for (const [k, v] of Object.entries(j.rates || {})) if (typeof v === 'number' && v > 0) out[k.toUpperCase()] = v;   // unita' per 1 euro
      if (Object.keys(out).length) return out;
    } catch { /* provo il prossimo */ }
  }
  return null;
}

async function fetchCrypto() {
  try {
    const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(CRYPTO).join(',')}&vs_currencies=eur`);
    const out = {};
    for (const [sym, id] of Object.entries(CRYPTO)) { const v = j?.[id]?.eur; if (typeof v === 'number' && v > 0) out[sym] = v; }   // euro per 1 moneta
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

let busy = null;
export function refresh() {
  busy ||= (async () => {
    const [fiat, crypto] = await Promise.all([fetchFiat(), fetchCrypto()]);
    // se un servizio non risponde tengo i valori vecchi di quel tipo
    if (fiat) cache.fiat = fiat;
    if (crypto) cache.crypto = crypto;
    if (fiat || crypto) { cache.updated = Date.now(); try { fs.writeFileSync(FILE, JSON.stringify(cache)); } catch { /* non grave */ } }
    else cache.lastFail = Date.now();
  })().finally(() => { busy = null; });
  return busy;
}

/** { updated, perEur: { USD: 1.11, ... }, eurPer: { BTC: 60000, ... } } - aggiorna se serve (aspetta solo la prima volta). */
export async function getRates() {
  const stale = Date.now() - cache.updated > EVERY && Date.now() - (cache.lastFail || 0) > 10 * 60e3;
  if (stale) { const p = refresh(); if (!cache.updated) await p; }
  return { updated: cache.updated, perEur: { EUR: 1, ...cache.fiat }, eurPer: cache.crypto };
}
