function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Classe base per ogni "cosa salvabile" nell'app (task, voce di diario,
 * evento, transazione...). Tutte le sottoclassi ereditano id + timestamp.
 */
export class Entry {
  constructor(data = {}) {
    this.id = data.id || uid();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    // condivisione in un gruppo (vuoto = elemento personale)
    this.groupId = data.groupId || '';
    this.groupName = data.groupName || '';
    this.ownerId = data.ownerId || '';
    this.canEdit = data.canEdit === undefined ? true : !!data.canEdit;
  }

  touch() { this.updatedAt = new Date().toISOString(); }

  toJSON() {
    const o = { ...this }; delete o.canEdit; delete o.groupName;
    if (!o.groupId) { delete o.groupId; delete o.ownerId; }
    return o;
  }

  static fromJSON(data) { return new this(data); }
}
