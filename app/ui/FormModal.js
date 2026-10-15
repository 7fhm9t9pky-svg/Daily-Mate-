import { dateFieldHTML, bindDateFields, readDate } from './dateField.js';

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * Finestra di creazione/modifica generata da uno "schema" di campi:
 * [{ key, label, type: 'text'|'number'|'date'|'time'|'select'|'textarea'|'checkbox', options? }]
 * Risolve con i valori inseriti, con { __delete: true }, o con null se annullata.
 */
export class FormModal {
  static open({ title, fields, values = {}, allowDelete = false }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${esc(title)}</h3>
          <form class="modal-form">${fields.map(f => FormModal.#field(f, values[f.key])).join('')}</form>
          <div class="modal-actions">
            <button type="button" class="btn" data-act="cancel">Annulla</button>
            ${allowDelete ? '<button type="button" class="btn danger" data-act="delete">Elimina</button>' : ''}
            <button type="button" class="btn primary" data-act="save">Salva</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      bindDateFields(overlay);
      // campi che compaiono solo se un altro campo ha un certo valore (es. "Scrivo io" -> importo)
      fields.filter(f => f.showIf).forEach(f => {
        const dep = overlay.querySelector(`[name="${f.showIf.field}"]`), box = overlay.querySelector(`[name="${f.key}"]`)?.closest('label');
        const upd = () => { box.hidden = dep.value !== f.showIf.value; };
        dep.addEventListener('change', upd); upd();
      });
      // campo a tendina che cambia le sue voci in base a un altro campo (es. tipo -> valuta)
      fields.filter(f => f.optionsBy).forEach(f => {
        const dep = overlay.querySelector(`[name="${f.optionsBy.field}"]`), sel = overlay.querySelector(`[name="${f.key}"]`);
        const fill = want => {
          const opts = f.optionsBy.map[dep.value] || [], keep = want ?? sel.value;
          sel.innerHTML = opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
          if (opts.some(o => o.value === keep)) sel.value = keep;
        };
        dep.addEventListener('change', () => fill());
        fill(values[f.key]);
      });

      const close = result => { overlay.remove(); resolve(result); };
      overlay.querySelector('[data-act="cancel"]').onclick = () => close(null);
      overlay.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
        if (confirm('Eliminare questa voce?')) close({ __delete: true });
      });
      overlay.querySelector('[data-act="save"]').onclick = () => {
        const data = {};
        let bad = false;
        fields.forEach(f => {
          const input = overlay.querySelector(`[name="${f.key}"]`);
          if (f.type === 'date') {
            const iso = readDate(input);
            input.classList.toggle('invalid', iso === null);
            if (iso === null) bad = true; else data[f.key] = iso;
          } else data[f.key] = f.type === 'checkbox' ? input.checked : input.value;
        });
        if (bad) return;   // data scritta male: il campo si colora di rosso
        close(data);
      };
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    });
  }

  static #field(f, value = '') {
    if (f.type === 'select') {
      return `<label class="field"><span>${esc(f.label)}</span>
        <select name="${f.key}">
          ${(f.options || []).map(o => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select></label>`;
    }
    if (f.type === 'textarea') {
      return `<label class="field"><span>${esc(f.label)}</span><textarea name="${f.key}">${esc(value)}</textarea></label>`;
    }
    if (f.type === 'checkbox') {
      return `<label class="field checkbox"><input type="checkbox" name="${f.key}" ${value ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    }
    if (f.type === 'date') {
      return `<label class="field"><span>${esc(f.label)}</span>${dateFieldHTML({ iso: value, name: f.key })}</label>`;
    }
    const dl = f.suggest?.length ? `<datalist id="dl-${f.key}">${f.suggest.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    return `<label class="field"><span>${esc(f.label)}</span><input type="${f.type || 'text'}" name="${f.key}" value="${esc(value)}"${dl ? ` list="dl-${f.key}" autocomplete="off"` : ''}>${dl}</label>`;
  }
}
