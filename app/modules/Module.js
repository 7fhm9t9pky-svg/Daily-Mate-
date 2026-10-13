/**
 * Classe base astratta di ogni pagina del menu (Home, Calendario, Documenti,
 * Avvisi, Finanze, Attivita', Impostazioni).
 * Un modulo sa: come si chiama, come costruire la propria vista, quali
 * impostazioni personalizzabili espone.
 */
export class Module {
  constructor({ id, name }) {
    if (new.target === Module) throw new Error('Module è astratta: estendila (es. ListModule)');
    this.id = id;
    this.name = name;
    this.app = null; // assegnato da App.use()
  }

  async init() {}

  /** `arg` e' l'eventuale parte finale dell'indirizzo (es. #/finance/3 -> "3"). */
  async getView(_arg) { throw new Error(`${this.constructor.name} deve implementare getView()`); }

  /** Schema per generare automaticamente un form impostazioni (usato dalla pagina Impostazioni). */
  getSettingsSchema() { return []; }
}
