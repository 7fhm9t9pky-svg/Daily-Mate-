import { ListModule } from '../ListModule.js';
import { SharedRepository } from '../../core/GroupService.js';
import { DocumentItem } from './DocumentItem.js';
import { daysUntil, fmtShort } from '../../core/dates.js';

const CATEGORY = { identita: 'Identità', auto: 'Auto', casa: 'Casa', salute: 'Salute', lavoro: 'Lavoro', fisco: 'Fisco e banche', altro: 'Altro' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Documenti: elenco di documenti con tipo, scadenza e note su dove trovarli. */
export class DocumentsModule extends ListModule {
  constructor({ storage, groups }) {
    super({
      id: 'documents', name: 'Documenti', repo: new SharedRepository(storage, 'documents', DocumentItem, groups),
      itemName: 'documento', emptyText: 'Nessun documento: aggiungi patente, assicurazioni, contratti…'
    });
    this.EntryClass = DocumentItem; this.groups = groups;
  }

  getFields() {
    return [
      { key: 'title', label: 'Documento', type: 'text' },
      { key: 'category', label: 'Tipo', type: 'select', options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) },
      { key: 'expiry', label: 'Scadenza (se c’è)', type: 'date' },
      { key: 'notes', label: 'Note / dove si trova', type: 'textarea' }
    ];
  }

  renderRow(item) {
    let cls = '', meta = '';
    if (item.expiry) {
      const n = daysUntil(item.expiry);
      cls = n < 0 ? 'warn' : n <= 30 ? 'soon' : '';
      meta = `scade ${fmtShort(item.expiry)}`;
    }
    return `<span class="t">${esc(item.title) || '(senza titolo)'}<small>${CATEGORY[item.category] || ''}${item.notes ? ' · ' + esc(item.notes.slice(0, 50)) : ''}${item.groupName ? ' · 👥 ' + esc(item.groupName) : ''}</small></span>
      <span class="m ${cls}">${meta}</span>`;
  }

  sort(items) {
    return items.slice().sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.title.localeCompare(b.title));
  }
}
