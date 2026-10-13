import { Entry } from '../../models/Entry.js';

export class CalendarEvent extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.date = data.date || '';
    this.start = data.start || data.time || '09:00'; // "time" = vecchio nome del campo
    this.end = data.end || '';
    this.notes = data.notes || '';
  }
}
