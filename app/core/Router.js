/** Routing minimale basato su hash: #/calendar, #/finance, #/finance/3 ... */
export class Router {
  constructor(app) { this.app = app; }

  init() {
    window.addEventListener('hashchange', () => this.#resolve());
    this.#resolve();
  }

  #resolve() {
    const [requested, arg] = location.hash.replace('#/', '').split('/');
    const id = requested || this.app.registry.list()[0]?.id;
    this.app.showModule(id, arg);
  }

  goTo(path) { location.hash = '#/' + path; }
}
