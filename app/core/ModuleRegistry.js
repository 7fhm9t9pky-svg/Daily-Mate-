/** Contenitore dei moduli attivi nell'app, indicizzati per id. */
export class ModuleRegistry {
  #modules = new Map();

  register(module) { this.#modules.set(module.id, module); return this; }
  get(id) { return this.#modules.get(id); }
  list() { return [...this.#modules.values()]; }
}
