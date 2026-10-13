import { EventBus } from './EventBus.js';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter.js';
import { SettingsManager } from './SettingsManager.js';
import { ThemeManager } from './ThemeManager.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { Router } from './Router.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Orchestratore principale: crea i servizi core e fa da "contesto" per i moduli.
 * Lo storage e' iniettato dall'esterno (main.js sceglie quello remoto per utente).
 */
export class App {
  constructor({ storage, auth } = {}) {
    this.bus = new EventBus();
    this.storage = storage || new LocalStorageAdapter();
    this.auth = auth || null;
    this.settings = new SettingsManager(this.storage, this.bus);
    this.theme = new ThemeManager(this.settings);
    this.registry = new ModuleRegistry();
    this.router = new Router(this);
    this.ui = auth?.user?.ui || {};   // interfaccia decisa dall'amministratore per questo utente

    this.drawerEl = document.getElementById('drawer');
    this.navEl = document.getElementById('app-nav');
    this.mainEl = document.getElementById('app-main');
    this.titleEl = document.getElementById('page-title');
    this.activeModuleId = null;
    this.activeView = null;
    this.#wireDrawer();
    // stato del salvataggio online (scritto in alto a destra)
    window.addEventListener('dm-sync', e => {
      const el = document.getElementById('sync'); if (!el) return;
      el.textContent = e.detail.text; el.classList.toggle('warn', e.detail.kind === 'warn');
      clearTimeout(this._syncT);
      if (e.detail.kind === 'ok') this._syncT = setTimeout(() => { el.textContent = ''; }, 2500);
    });
  }

  use(module) {
    this.registry.register(module);
    module.app = this;
    return this;
  }

  async start() {
    await this.theme.setForced(this.ui);
    await this.theme.init();
    this.profile = (await this.settings.get('profile')) || {};
    for (const m of this.registry.list()) await m.init?.();
    this.renderNav();
    this.router.init();
  }

  /** Nome mostrato nei saluti: quello scelto in Impostazioni, altrimenti quello dell'account. */
  displayName() {
    return this.profile?.name || this.auth?.user?.displayName || this.auth?.user?.username || '';
  }

  async setProfileName(name) {
    this.profile = { ...(this.profile || {}), name };
    await this.settings.set('profile', this.profile);
  }

  #wireDrawer() {
    document.getElementById('menu-btn').onclick = () => this.toggleDrawer(true);
    document.getElementById('drawer-bk').onclick = () => this.toggleDrawer(false);
  }

  toggleDrawer(open) { this.drawerEl.classList.toggle('open', open); }

  /** Pagine mostrate a questo utente (alcune possono essere nascoste dall'amministratore). */
  isHidden(id) { return (this.ui.hidden || []).includes(id); }
  moduleName(m) { return this.ui.labels?.[m.id] || m.name; }
  isAdmin() { return !!this.auth?.user?.isAdmin; }
  visibleModules() { return this.registry.list().filter(m => !this.isHidden(m.id)); }

  /** Applica una nuova configurazione dell'interfaccia (arriva dall'amministratore, anche mentre l'app e' aperta). */
  async applyUi(ui) {
    const finKey = o => JSON.stringify([o?.sheets, o?.sheetLabels]);
    const finChanged = finKey(ui) !== finKey(this.ui);
    this.ui = ui || {};
    if (this.auth?.user) this.auth.user.ui = this.ui;
    await this.theme.setForced(this.ui);
    this.renderNav();
    if (this.activeModuleId) {
      if (this.isHidden(this.activeModuleId)) this.router.goTo('home');
      else if (this.activeModuleId === 'home' || (this.activeModuleId === 'finance' && finChanged)) await this.showModule(this.activeModuleId, location.hash.split('/')[2]);
      else { const m = this.registry.get(this.activeModuleId); if (m) this.titleEl.textContent = this.moduleName(m); }
    }
  }

  renderNav() {
    this.navEl.innerHTML = `<h2>Daily Mate</h2>` + this.visibleModules().map(m => `
      <button class="nav-item${m.id === this.activeModuleId ? ' is-active' : ''}" data-module="${m.id}">${esc(this.moduleName(m))}</button>`).join('')
      + `<div class="nav-foot">${this.auth ? esc(this.displayName()) + (this.isAdmin() ? ' · <b>Amministratore</b>' : '') : ''}</div>`;
    this.navEl.querySelectorAll('[data-module]').forEach(btn => {
      btn.onclick = () => { this.toggleDrawer(false); this.router.goTo(btn.dataset.module); };
    });
  }

  async showModule(id, arg) {
    let module = this.registry.get(id) || this.registry.list()[0];
    if (module && this.isHidden(module.id)) module = this.registry.get('home') || this.registry.list()[0];
    if (!module) return;
    this.activeModuleId = module.id;
    this.renderNav();
    this.titleEl.textContent = this.moduleName(module);
    document.title = `${this.moduleName(module)} · Daily Mate`;
    this.activeView?.destroy?.();
    const view = await module.getView(arg);
    this.mainEl.innerHTML = '';
    this.mainEl.scrollTop = 0;
    this.activeView = view;
    await view.mount(this.mainEl); // la vista puo' scorrere da sola (es. il Calendario all'ora corrente)
  }
}
