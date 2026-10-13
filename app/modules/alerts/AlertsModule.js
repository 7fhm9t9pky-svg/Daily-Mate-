import { ListModule } from '../ListModule.js';
import { SharedRepository } from '../../core/GroupService.js';
import { AlertItem } from './AlertItem.js';
import { daysUntil, fmtShort, relative, todayIso } from '../../core/dates.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Avvisi: scadenze e promemoria con data, ordinati dalla più vicina. */
export class AlertsModule extends ListModule {
  constructor({ storage, groups }) {
    super({
      id: 'alerts', name: 'Avvisi', repo: new SharedRepository(storage, 'alerts', AlertItem, groups),
      itemName: 'avviso', emptyText: 'Nessun avviso: aggiungi una scadenza con “+ Nuovo”.'
    });
    this.EntryClass = AlertItem; this.groups = groups;
  }

  getFields() {
    return [
      { key: 'title', label: 'Avviso', type: 'text' },
      { key: 'date', label: 'Data', type: 'date' },
      { key: 'done', label: 'Fatto', type: 'checkbox' },
      { key: 'notes', label: 'Note', type: 'textarea' }
    ];
  }

  defaultValues() { return { date: todayIso(), done: false }; }

  renderRow(item) {
    let cls = '';
    if (!item.done && item.date) { const n = daysUntil(item.date); if (n < 0) cls = 'warn'; else if (n <= 7) cls = 'soon'; }
    return `<span class="box${item.done ? ' on' : ''}" data-toggle>${item.done ? '✓' : ''}</span>
      <span class="t${item.done ? ' done' : ''}">${esc(item.title) || '(senza titolo)'}${item.notes ? `<small>${esc(item.notes.slice(0, 70))}</small>` : ''}${item.groupName ? `<small>👥 ${esc(item.groupName)}</small>` : ''}</span>
      <span class="m ${cls}">${fmtShort(item.date)}<br>${item.done ? '' : relative(item.date)}</span>`;
  }

  async onToggle(item) { item.done = !item.done; await this.repo.save(item); }

  sort(items) {
    return items.slice().sort((a, b) => (a.done - b.done) || (a.date || '9999').localeCompare(b.date || '9999'));
  }

  /** I prossimi avvisi non ancora fatti (per la Home). */
  async upcoming(limit = 3) {
    return this.sort((await this.repo.getAll()).filter(a => !a.done && a.date)).slice(0, limit);
  }
}
