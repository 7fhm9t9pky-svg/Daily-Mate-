import { StorageAdapter } from './StorageAdapter.js';

const PREFIX = 'dailymate:';

/** Backend di default: window.localStorage, con namespace e serializzazione JSON. */
export class LocalStorageAdapter extends StorageAdapter {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      console.error('LocalStorageAdapter.get fallito per', key, e);
      return null;
    }
  }

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('LocalStorageAdapter.set fallito per', key, e);
      return false;
    }
  }

  async remove(key) {
    localStorage.removeItem(PREFIX + key);
  }
}
