/**
 * Un unico oggetto "settings" persistito, con helper per: tema (gestito da
 * ThemeManager), impostazioni per-modulo, e ordine del layout per dispositivo.
 */
export class SettingsManager {
  #storage; #bus; #cache = null;

  constructor(storage, bus) { this.#storage = storage; this.#bus = bus; }

  async #load() {
    if (!this.#cache) this.#cache = (await this.#storage.get('settings')) || {};
    return this.#cache;
  }

  async get(key) { return (await this.#load())[key]; }

  async set(key, value) {
    const s = await this.#load();
    s[key] = value;
    await this.#storage.set('settings', s);
    this.#bus?.emit('settings:changed', { key, value });
  }

  async getModuleSettings(moduleId) {
    return (await this.get('modules'))?.[moduleId] || {};
  }

  async setModuleSettings(moduleId, value) {
    const all = (await this.get('modules')) || {};
    all[moduleId] = { ...(all[moduleId] || {}), ...value };
    await this.set('modules', all);
  }

  /** Ordine widget/moduli in dashboard, per device ('mobile' | 'desktop'). Pronto per un futuro drag&drop. */
  async getLayoutOrder(device) { return (await this.get('layout'))?.[device] || null; }

  async setLayoutOrder(device, order) {
    const l = (await this.get('layout')) || {};
    l[device] = order;
    await this.set('layout', l);
  }
}
