/**
 * Repository generico: CRUD su una lista di Entry persistita come un unico
 * array JSON sotto una chiave (namespace) dello StorageAdapter.
 * Ogni modulo istanzia il proprio Repository passando la classe Entry giusta.
 */
export class Repository {
  #storage; #namespace; #EntryClass; #cache = null;

  constructor(storage, namespace, EntryClass) {
    this.#storage = storage;
    this.#namespace = namespace;
    this.#EntryClass = EntryClass;
  }

  async #load() {
    if (this.#cache) return this.#cache;
    const raw = await this.#storage.get(this.#namespace);
    this.#cache = Array.isArray(raw) ? raw.map(d => this.#EntryClass.fromJSON(d)) : [];
    return this.#cache;
  }

  async #persist() {
    await this.#storage.set(this.#namespace, this.#cache.map(e => e.toJSON()));
  }

  async getAll() { return [...(await this.#load())]; }

  async get(id) { return (await this.#load()).find(e => e.id === id) || null; }

  async save(entry) {
    const list = await this.#load();
    const i = list.findIndex(e => e.id === entry.id);
    entry.touch();
    if (i === -1) list.push(entry); else list[i] = entry;
    await this.#persist();
    return entry;
  }

  async delete(id) {
    const list = await this.#load();
    this.#cache = list.filter(e => e.id !== id);
    await this.#persist();
  }

  async query(predicate) { return (await this.#load()).filter(predicate); }
}
