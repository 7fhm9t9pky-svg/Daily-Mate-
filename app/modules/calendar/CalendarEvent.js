import { Entry } from '../../models/Entry.js';

/** Categorie proposte (il colore dell'evento segue la categoria, se non ne scegli uno tuo). */
export const CATEGORIES = {
  personal: { name: 'Personale', icon: '🙂', color: '#0f766e' },
  work: { name: 'Lavoro', icon: '💼', color: '#2563eb' },
  family: { name: 'Famiglia', icon: '👨‍👩‍👧', color: '#be185d' },
  health: { name: 'Salute', icon: '🩺', color: '#dc2626' },
  bills: { name: 'Scadenze e soldi', icon: '💶', color: '#b45309' },
  fun: { name: 'Svago e amici', icon: '🎉', color: '#7c3aed' },
  other: { name: 'Altro', icon: '📌', color: '#475569' }
};
export const COLORS = { '': 'Come la categoria', '#dc2626': 'Rosso', '#ea580c': 'Arancione', '#b45309': 'Ocra', '#15803d': 'Verde', '#0f766e': 'Verde acqua', '#2563eb': 'Blu', '#7c3aed': 'Viola', '#be185d': 'Rosa', '#475569': 'Grigio' };
export const REMINDERS = [['', 'Come nelle impostazioni'], ['none', 'Nessun promemoria'], ['0', 'All\'ora dell\'evento'], ['10', '10 minuti prima'], ['30', '30 minuti prima'], ['60', '1 ora prima'], ['120', '2 ore prima'], ['1440', 'Il giorno prima']];

export const colorOf = e => e.color || CATEGORIES[e.category]?.color || CATEGORIES.personal.color;

export class CalendarEvent extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.date = data.date || '';
    this.allDay = !!data.allDay;
    this.start = this.allDay ? '' : (data.start || data.time || '09:00'); // "time" = vecchio nome del campo
    this.end = this.allDay ? '' : (data.end || '');
    this.notes = data.notes || '';
    this.category = CATEGORIES[data.category] ? data.category : 'personal';
    this.color = data.color || '';
    this.repeat = data.repeat || 'none';          // none | daily | weekdays | weekly | biweekly | monthly | yearly
    this.until = data.until || '';                 // ultima data della ripetizione (vuoto = senza fine)
    this.skip = Array.isArray(data.skip) ? data.skip : [];   // giorni singoli tolti da una serie
    this.remind = data.remind == null ? '' : String(data.remind);   // '' = impostazioni, 'none', oppure minuti prima
  }
}
