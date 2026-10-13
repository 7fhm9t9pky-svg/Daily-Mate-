import { Entry } from '../../models/Entry.js';

/** Un avviso: una scadenza o promemoria con data (es. bollo auto, assicurazione...). */
export class AlertItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.date = data.date || '';
    this.notes = data.notes || '';
    this.done = !!data.done;
  }
}
