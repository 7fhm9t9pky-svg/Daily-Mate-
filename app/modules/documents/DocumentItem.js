import { Entry } from '../../models/Entry.js';

/** Un documento da tenere sotto controllo (nome, tipo, scadenza, dove si trova). */
export class DocumentItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.category = data.category || 'altro';
    this.expiry = data.expiry || '';
    this.notes = data.notes || '';
  }
}
