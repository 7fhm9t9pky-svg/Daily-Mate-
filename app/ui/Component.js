/**
 * Classe base per ogni "vista" montabile nel DOM. render() costruisce
 * l'elemento, afterMount() (opzionale) fa il lavoro che richiede il DOM reale
 * (query dei figli, fetch iniziale dei dati...).
 */
export class Component {
  constructor() { this.el = null; }

  render() { throw new Error(`${this.constructor.name}.render non implementato`); }

  async mount(parent) {
    this.el = this.render();
    parent.appendChild(this.el);
    await this.afterMount?.();
    return this.el;
  }

  destroy() { this.el?.remove(); }
}
