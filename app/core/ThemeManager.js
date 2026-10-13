/**
 * Tema = modalita' (chiaro / scuro / automatico) + colore principale.
 * Il verde del foglio "Lavoro" e' il predefinito; gli altri colori
 * sovrascrivono solo --acc / --acc2 / --soft.
 */
export const ACCENTS = {
  verde:  null, // usa i colori del tema (verde di Lavoro)
  blu:    { light: { '--acc': '#2f5fa8', '--acc2': '#4a86d8', '--soft': '#e1ebf8' }, dark: { '--acc': '#8db8f7', '--acc2': '#4a86d8', '--soft': '#1d2a3f' } },
  viola:  { light: { '--acc': '#5b4a9a', '--acc2': '#8570d1', '--soft': '#ece8f7' }, dark: { '--acc': '#b6a9f5', '--acc2': '#8570d1', '--soft': '#2a2540' } },
  rosso:  { light: { '--acc': '#a8402f', '--acc2': '#d1684f', '--soft': '#f8e6e1' }, dark: { '--acc': '#f2a08e', '--acc2': '#d1684f', '--soft': '#3a2220' } },
  grigio: { light: { '--acc': '#3f4a46', '--acc2': '#6a7872', '--soft': '#e6eae8' }, dark: { '--acc': '#c2cdc8', '--acc2': '#8a9791', '--soft': '#2a322f' } }
};
const OVERRIDABLE = ['--acc', '--acc2', '--soft'];

export class ThemeManager {
  constructor(settings) { this.settings = settings; this.current = {}; this.forced = {}; }

  /** Tema imposto dall'amministratore ({ mode, accent }): ha la precedenza sulla scelta dell'utente. */
  async setForced(f = {}) { this.forced = { mode: f.mode || '', accent: f.accent || '' }; this.apply(await this.get()); }

  async init() {
    this.apply(await this.get());
    // con tema "automatico" il colore deve seguire anche il cambio chiaro/scuro del telefono
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.apply(this.current));
  }

  apply({ mode = 'auto', accent = 'verde' } = {}) {
    this.current = { mode, accent };
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = mode;
    OVERRIDABLE.forEach(v => root.style.removeProperty(v));
    const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    const set = ACCENTS[accent]?.[dark ? 'dark' : 'light'];
    if (set) Object.entries(set).forEach(([k, v]) => root.style.setProperty(k, v));
  }

  async get() {
    const t = { mode: 'auto', accent: 'verde', ...((await this.settings.get('theme')) || {}) };
    if (this.forced?.mode) t.mode = this.forced.mode;
    if (this.forced?.accent) t.accent = this.forced.accent;
    return t;
  }

  async update(patch) {
    const own = { mode: 'auto', accent: 'verde', ...((await this.settings.get('theme')) || {}), ...patch };
    await this.settings.set('theme', own);
    const next = await this.get();
    this.apply(next);
    return next;
  }
}
