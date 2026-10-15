/**
 * Paghe orarie: ogni lavoro puo' averne piu' d'una, con un nome (es. "Paga Swievo", "Paga Swievo 10%", "Paga cantiere").
 * job.pays = [{ id, name, rate }], job.defPay = la paga proposta di solito.
 * Una giornata usa la paga scelta (row.pay), quella di solito, oppure un importo scritto a mano (row.rate).
 */
export const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const jobPays = j => j.pays || [];
export const defaultPay = j => { const p = jobPays(j); return p.find(x => x.id === j.defPay) || p[0] || null; };
export const jobRate = j => num(defaultPay(j)?.rate);
export const payOf = (job, r) => (r.rate === '' || r.rate == null) ? (jobPays(job).find(x => x.id === r.pay) || defaultPay(job)) : null;
export const dayRate = (job, r) => (r.rate === '' || r.rate == null) ? num(payOf(job, r)?.rate) : num(r.rate);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newId = uid;

/** Dai lavori "vecchio stile" (una sola paga, oppure la paga standard) ai lavori con le paghe nominate. */
export function migratePays(work, stdRate) {
  for (const j of work.jobs) {
    if (j.pays) continue;
    j.pays = [];
    const id = uid();
    if (!j.std && num(j.rate) > 0) j.pays.push({ id, name: 'Paga ' + j.name, rate: num(j.rate) });
    else if (num(stdRate) > 0) j.pays.push({ id, name: 'Paga standard', rate: num(stdRate) });
    if (j.pays.length) j.defPay = id;
  }
}
