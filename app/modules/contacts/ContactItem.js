import { Entry } from '../../models/Entry.js';

/** Una persona della rubrica (nome, telefono, email, ruolo, note). */
export class ContactItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.phone = data.phone || '';
    this.email = data.email || '';
    this.role = data.role || '';
    this.notes = data.notes || '';
  }
}
