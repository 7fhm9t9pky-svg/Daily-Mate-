/** Semplice pub/sub usato da tutto il resto del core per comunicare senza dipendenze dirette. */
export class EventBus {
  #listeners = new Map();

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler); // unsubscribe
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.#listeners.get(event)?.forEach(fn => fn(payload));
  }
}
