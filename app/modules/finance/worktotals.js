import { num, jobRate, dayRate } from './pays.js';

const mins = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

/** Ore di una giornata: (pausa − entrata mattina) + (uscita − entrata pomeriggio). */
export function dayHours(r) {
  const a = mins(r.a), b = mins(r.b), c = mins(r.c), e = mins(r.e);
  let m = 0;
  if (a !== null && b !== null && b > a) m += b - a;
  if (c !== null && e !== null && e > c) m += e - c;
  return m / 60;
}

export const dayPay = (job, r) => dayHours(r) * dayRate(job, r);

export function workTotals(work) {
  const jobs = work.jobs.map(j => ({ job: j, ore: j.rows.reduce((s, r) => s + dayHours(r), 0), paga: j.rows.reduce((s, r) => s + dayPay(j, r), 0) }));
  const ore = jobs.reduce((s, x) => s + x.ore, 0), paga = jobs.reduce((s, x) => s + x.paga, 0);
  const acconti = work.adv.reduce((s, a) => s + num(a.amount), 0);
  const arretrati = (work.owed || []).reduce((s, a) => s + num(a.amount), 0);          // soldi dei mesi prima che ti devono ancora
  return { jobs, ore, paga, acconti, arretrati, saldo: arretrati - acconti, totale: paga + arretrati - acconti };   // saldo = soldi dei mesi prima meno acconti; totale = con anche la paga di questo periodo
}

