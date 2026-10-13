import { Repository } from '../models/Repository.js';

/** Parla con /api/groups e tiene in memoria l'elenco dei miei gruppi. */
export class GroupService {
  constructor(auth) { this.auth = auth; this.cache = null; this.at = 0; }

  api(path, opts = {}) {
    return this.auth.api(path, { ...opts, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  }

  /** Stato completo: gruppi miei + richieste. Se il server non risponde usa l'ultimo noto. */
  async state(force = false) {
    if (!force && this.cache && Date.now() - this.at < 15000) return this.cache;
    try { this.cache = await this.api('/api/groups'); this.at = Date.now(); }
    catch { this.cache = this.cache || { groups: [], incoming: [], outgoing: [] }; }
    return this.cache;
  }
  invalidate() { this.at = 0; }

  /** Campo "Condividi con" per i form; null se non faccio parte di nessun gruppo. */
  async shareField() {
    const { groups } = await this.state(true);
    if (!groups.length) return null;
    return { key: 'groupId', label: 'Condividi con', type: 'select',
      options: [{ value: '', label: 'Solo io (privato)' }, ...groups.map(g => ({ value: g.id, label: '👥 ' + g.name }))] };
  }
}

/**
 * Come Repository, ma unisce gli elementi personali a quelli condivisi nei
 * miei gruppi. Un elemento con `groupId` vive sul server nel gruppo, gli altri
 * restano nei dati personali.
 */
export class SharedRepository {
  constructor(storage, namespace, EntryClass, svc) {
    this.local = new Repository(storage, namespace, EntryClass);
    this.ns = namespace; this.E = EntryClass; this.svc = svc;
    this.shared = []; this.at = 0;
  }

  async #loadShared() {
    if (Date.now() - this.at < 15000) return this.shared;
    try {
      const r = await this.svc.api(`/api/groups/items/${this.ns}`);
      this.shared = r.items.map(d => this.E.fromJSON(d)); this.at = Date.now();
    } catch { /* offline: restano gli ultimi noti */ }
    return this.shared;
  }
  invalidate() { this.at = 0; }

  async getAll() { return [...await this.local.getAll(), ...await this.#loadShared()]; }
  async get(id) { return (await this.getAll()).find(e => e.id === id) || null; }
  async query(p) { return (await this.getAll()).filter(p); }

  async #dropShared(e) {
    await this.svc.api(`/api/groups/${e.groupId}/items/${this.ns}/${e.id}`, { method: 'DELETE' });
    this.shared = this.shared.filter(x => x.id !== e.id);
  }

  async save(entry) {
    const prev = this.shared.find(x => x.id === entry.id);
    if (entry.groupId) {
      entry.touch();
      if (!entry.ownerId) entry.ownerId = this.svc.auth.user?.id || '';
      if (prev && prev.groupId !== entry.groupId) await this.#dropShared(prev);
      await this.svc.api(`/api/groups/${entry.groupId}/items/${this.ns}/${entry.id}`, { method: 'PUT', body: { item: entry.toJSON() } });
      if ((await this.local.get(entry.id))) await this.local.delete(entry.id);
      this.at = 0; await this.#loadShared();
      return entry;
    }
    if (prev) { await this.#dropShared(prev); entry.ownerId = ''; }
    return this.local.save(entry);
  }

  async delete(id) {
    const prev = this.shared.find(x => x.id === id);
    if (prev) { await this.#dropShared(prev); return; }
    await this.local.delete(id);
  }
}
