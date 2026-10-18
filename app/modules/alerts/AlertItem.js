import { Entry } from '../../models/Entry.js';

export const REPEATS = [['none', 'Non si ripete'], ['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']];
export const COLORS = { '': 'Nessuno', '#dc2626': 'Rosso', '#ea580c': 'Arancione', '#ca8a04': 'Giallo', '#15803d': 'Verde', '#2563eb': 'Blu', '#7c3aed': 'Viola', '#be185d': 'Rosa', '#475569': 'Grigio' };

const p2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Prossima data di un avviso che si ripete (il giorno del mese resta quello di partenza: il 31 cade l'ultimo giorno dei mesi corti). */
export function nextDate(date, repeat, anchor) {
  const [y, m, d] = date.split('-').map(Number), day = anchor || d;
  if (repeat === 'daily') return iso(new Date(y, m - 1, d + 1));
  if (repeat === 'weekly') return iso(new Date(y, m - 1, d + 7));
  const t = new Date(y + (repeat === 'yearly' ? 1 : 0), m - 1 + (repeat === 'monthly' ? 1 : 0), 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return iso(t);
}

/** Un avviso: una scadenza o promemoria con data (es. bollo auto, assicurazione...), anche ripetuto, colorato o fissato in alto. */
export class AlertItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.date = data.date || '';
    this.notes = data.notes || '';
    this.done = !!data.done;
    this.repeat = data.repeat || 'none';      // none | daily | weekly | monthly | yearly
    this.anchor = Number(data.anchor) || 0;    // giorno del mese di partenza (per le ripetizioni mensili/annuali)
    this.color = data.color || '';
    this.pinned = !!data.pinned;
  }
}
