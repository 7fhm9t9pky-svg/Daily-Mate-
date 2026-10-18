import { ListModule } from '../ListModule.js';
import { Repository } from '../../models/Repository.js';
import { ContactItem } from './ContactItem.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Contatti: rubrica personale (medico, idraulico, capo, banca…) con chiamata e email in un tocco. */
export class ContactsModule extends ListModule {
  constructor({ storage }) {
    super({
      id: 'contacts', name: 'Contatti', repo: new Repository(storage, 'contacts', ContactItem),
      itemName: 'contatto', emptyText: 'Nessun contatto: aggiungi medico, idraulico, banca, datore di lavoro…'
    });
    this.EntryClass = ContactItem;
  }

  getFields() {
    return [
      { key: 'title', label: 'Nome', type: 'text' },
      { key: 'role', label: 'Chi è (es. medico, banca, capo)', type: 'text' },
      { key: 'phone', label: 'Telefono', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'notes', label: 'Note', type: 'textarea' }
    ];
  }

  renderRow(c) {
    return `<span class="t">${esc(c.title) || '(senza nome)'}<small>${esc(c.role)}${c.phone ? (c.role ? ' · ' : '') + esc(c.phone) : ''}${c.email ? ' · ' + esc(c.email) : ''}</small></span>
      ${c.phone ? `<a class="m" href="tel:${esc(c.phone.replace(/\s/g, ''))}" onclick="event.stopPropagation()">📞</a>` : ''}`;
  }

  sort(items) { return items.slice().sort((a, b) => a.title.localeCompare(b.title)); }
}
