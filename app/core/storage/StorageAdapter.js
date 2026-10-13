/**
 * Interfaccia astratta di persistenza. Ogni backend concreto (LocalStorage,
 * IndexedDB, un futuro CloudAdapter...) estende questa classe.
 */
export class StorageAdapter {
  async get(_key) { throw new Error('StorageAdapter.get non implementato'); }
  async set(_key, _value) { throw new Error('StorageAdapter.set non implementato'); }
  async remove(_key) { throw new Error('StorageAdapter.remove non implementato'); }
}
