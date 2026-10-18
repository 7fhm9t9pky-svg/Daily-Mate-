import { Entry } from '../../models/Entry.js';

/** Una nota: testo libero oppure elenco con spunte (lista della spesa, cose da fare...), colorata e fissabile in alto. */
export class NoteItem extends Entry {
  constructor(data = {}) {
    super(data);
    this.title = data.title || '';
    this.mode = data.mode === 'list' ? 'list' : 'text';
    this.text = data.text || '';
    this.items = Array.isArray(data.items) ? data.items.map(i => ({ id: i.id || Math.random().toString(36).slice(2, 8), t: String(i.t || ''), done: !!i.done })) : [];
    this.color = data.color || '';
    this.pinned = !!data.pinned;
  }
}
