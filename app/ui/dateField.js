/**
 * Campo data sempre nel formato italiano gg/mm/aaaa, qualunque sia la lingua del browser
 * (il campo "date" nativo scrive il mese prima del giorno se il browser e' in inglese).
 * Si scrive con la tastiera numerica (le "/" si inseriscono da sole) oppure con il
 * pulsante calendario. Il valore e' sempre letto come ISO (aaaa-mm-gg).
 */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export const isoToIt = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function itToIso(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** HTML del campo. `attrs` = attributi extra per il campo di testo (es. data-a="C4"). */
export function dateFieldHTML({ iso = '', name = '', attrs = '' } = {}) {
  return `<span class="datef"><input type="text" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" data-date="1" ${name ? `name="${esc(name)}"` : ''} ${attrs} value="${esc(isoToIt(iso))}"><button type="button" class="datef-pick" tabindex="-1" aria-label="Scegli dal calendario">📅</button><input type="date" class="datef-native" tabindex="-1" aria-hidden="true"></span>`;
}

/** Attiva maschera e calendario sui campi creati da dateFieldHTML dentro `root`. */
export function bindDateFields(root) {
  root.querySelectorAll('.datef').forEach(box => {
    if (box.dataset.bound) return; box.dataset.bound = '1';
    const txt = box.querySelector('input[data-date]'), nat = box.querySelector('.datef-native');
    txt.addEventListener('input', e => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      let d = txt.value.replace(/\D/g, '').slice(0, 8), o = d.slice(0, 2);
      if (d.length > 2) o += '/' + d.slice(2, 4);
      if (d.length > 4) o += '/' + d.slice(4);
      if (o !== txt.value) { txt.value = o; txt.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    box.querySelector('.datef-pick').onclick = () => {
      const iso = itToIso(txt.value); nat.value = iso || '';
      try { nat.showPicker(); } catch { nat.focus(); nat.click(); }
    };
    nat.onchange = () => { txt.value = isoToIt(nat.value); txt.dispatchEvent(new Event('input', { bubbles: true })); txt.dispatchEvent(new Event('change', { bubbles: true })); };
  });
}

/** Legge un campo data: '' se vuoto, ISO se valido, null se scritto male. */
export const readDate = input => itToIso(input.value);
