import { Entry } from '../../models/Entry.js';

/** Un documento da tenere sotto controllo (nome, tipo, scadenza, dove si trova). */
export class DocumentItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.category = data.category || 'altro';
    this.expiry = data.expiry || '';
    this.notes = data.notes || '';
    this.text = data.text || '';                                   // testo scritto nell'app (come un file .txt)
    this.files = Array.isArray(data.files) ? data.files : [];      // foto / PDF: { name, type, data }
  }
}
