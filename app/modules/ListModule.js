import { Module } from './Module.js';
import { Component } from '../ui/Component.js';
import { FormModal } from '../ui/FormModal.js';

/** Vista generica: lista di voci + pulsante "nuovo" + finestra di modifica/eliminazione. */
class ListModuleView extends Component {
  constructor(module) { super(); this.module = module; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <div class="page-head right"><button class="btn primary" data-act="add">+ Nuovo</button></div>
      <div class="module-list"></div>
      <p class="empty" hidden>${this.module.emptyText}</p>`;
    this.listEl = el.querySelector('.module-list');
    this.emptyEl = el.querySelector('.empty');
    el.querySelector('[data-act="add"]').onclick = () => this.openForm();
    this.listEl.addEventListener('click', e => this.#onRowClick(e));
    return el;
  }

  async afterMount() { await this.refresh(); if (this.module.app?.consumeQuick?.(this.module.id)) this.openForm(); }

  async refresh() {
    this.items = this.module.sort(await this.module.repo.getAll());
    this.listEl.innerHTML = this.items.map((item, i) => `<button class="row" data-i="${i}">${this.module.renderRow(item)}</button>`).join('');
    this.emptyEl.hidden = this.items.length > 0;
  }

  async #onRowClick(e) {
    const row = e.target.closest('.row'); if (!row) return;
    const item = this.items[+row.dataset.i];
    if (e.target.closest('[data-toggle]') && this.module.onToggle) {
      await this.module.onToggle(item);
      return this.refresh();
    }
    this.openForm(item);
  }

  async openForm(item = null) {
    const m = this.module;
    if (item && !item.canEdit) { alert(`Questo ${m.itemName} è stato creato da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarlo.`); return; }
    const share = await m.groups?.shareField();
    const result = await FormModal.open({
      title: item ? `Modifica ${m.itemName}` : `Nuovo: ${m.itemName}`,
      fields: share ? [...m.getFields(), share] : m.getFields(),
      values: item ? m.toFormValues(item) : m.defaultValues(),
      allowDelete: !!item
    });
    if (!result) return;
    if (result.__delete) { await m.repo.delete(item.id); return this.refresh(); }
    await m.repo.save(m.fromFormValues(result, item));
    await this.refresh();
  }
}

/**
 * Sottoclasse riutilizzabile di Module: CRUD "lista + form" generico.
 * Attivita', Avvisi e Documenti la estendono e descrivono solo campi, riga e ordine.
 */
export class ListModule extends Module {
  constructor({ id, name, repo, itemName, emptyText }) {
    super({ id, name });
    this.repo = repo;
    this.itemName = itemName || 'elemento';
    this.emptyText = emptyText || 'Ancora nessun elemento: aggiungine uno.';
  }

  getFields() { throw new Error(`${this.constructor.name} deve implementare getFields()`); }
  defaultValues() { return {}; }
  toFormValues(entry) { return { ...entry }; }
  fromFormValues(values, existing) { return this.EntryClass.fromJSON({ ...(existing || {}), ...values }); }
  renderRow(item) { return `<span class="t">${item.id}</span>`; }
  sort(items) { return items; }

  async getView() { this.repo.invalidate?.(); return new ListModuleView(this); }
}
