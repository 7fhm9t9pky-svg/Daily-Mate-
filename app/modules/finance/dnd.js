/**
 * Trascinamento dei quadretti (dita o mouse): tieni premuto un quadretto e portalo
 *  - al centro di un altro quadretto  -> finisce DENTRO quella pagina (o dentro "Resoconto spese fisse");
 *  - sul bordo sinistro/destro        -> si mette PRIMA/DOPO (cambia l'ordine);
 *  - sulla barra "Porta fuori"        -> torna nella pagina superiore.
 * Dopo il trascinamento il click non parte (non apre la pagina per sbaglio).
 */
const D = { active: false };
let suppressUntil = 0;
document.addEventListener('touchmove', e => { if (D.active) e.preventDefault(); }, { passive: false });

const pt = e => (e.touches?.[0] || e.changedTouches?.[0] || e);

export function enableTileDnD(root, { canDrag, onDrop }) {
  if (!root) return;
  root.addEventListener('click', e => { if (Date.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  root.querySelectorAll('.sheet-tile[data-i]').forEach(t => { if (canDrag(+t.dataset.i)) t.classList.add('dnd'); });
  const begin = e => {
    const tile = e.target.closest?.('.sheet-tile[data-i]'); if (!tile || !canDrag(+tile.dataset.i)) return;
    if (e.type === 'mousedown' && e.button !== 0) return;
    const touch = e.type === 'touchstart', p0 = pt(e), src = +tile.dataset.i;
    let timer = null, ghost = null, hover = null, cancelled = false;
    const clear = () => { document.querySelectorAll('.drop-into,.drop-before,.drop-after').forEach(x => x.classList.remove('drop-into', 'drop-before', 'drop-after')); };
    const target = (x, y) => {
      if (ghost) ghost.style.display = 'none';
      const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = '';
      const up = el?.closest('[data-dnd-up]'); if (up) return { zone: 'up', el: up };
      const f = el?.closest('.sheet-tile[data-fixed]'); if (f) return { zone: 'into', fixed: true, el: f };
      const t = el?.closest('.sheet-tile[data-i]'); if (!t || +t.dataset.i === src) return null;
      const r = t.getBoundingClientRect(), k = (x - r.left) / r.width, i = +t.dataset.i;
      if (canDrag(i) && k < 0.25) return { zone: 'before', i, el: t };
      if (canDrag(i) && k > 0.75) return { zone: 'after', i, el: t };
      return { zone: 'into', i, el: t };
    };
    const start = () => {
      D.active = true; document.body.classList.add('dnd-on');
      const r = tile.getBoundingClientRect(); ghost = tile.cloneNode(true);
      Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: 0, opacity: .85, pointerEvents: 'none', zIndex: 99, transform: 'scale(1.04)', boxShadow: '0 12px 30px #0005' });
      document.body.appendChild(ghost); tile.style.opacity = .35; navigator.vibrate?.(15);
      ghost._dx = p0.clientX - r.left; ghost._dy = p0.clientY - r.top;
    };
    const move = ev => {
      const p = pt(ev);
      if (!D.active) {
        if (Math.hypot(p.clientX - p0.clientX, p.clientY - p0.clientY) > (touch ? 9 : 6)) { if (touch) cancel(); else start(); }
        if (!D.active) return;
      }
      ghost.style.left = p.clientX - ghost._dx + 'px'; ghost.style.top = p.clientY - ghost._dy + 'px';
      clear(); hover = target(p.clientX, p.clientY);
      if (hover) hover.el.classList.add('drop-' + (hover.zone === 'up' ? 'into' : hover.zone));
      const sc = root.closest('.app-main'); if (sc) { const h = innerHeight; if (p.clientY < 90) sc.scrollTop -= 10; else if (p.clientY > h - 120) sc.scrollTop += 10; }
    };
    const cancel = () => { cancelled = true; clearTimeout(timer); off(); };
    const end = ev => {
      clearTimeout(timer);
      const was = D.active, h = hover;
      off();
      if (!was) return;
      suppressUntil = Date.now() + 400; if (h) onDrop(src, h);
    };
    const off = () => {
      clearTimeout(timer); clear(); ghost?.remove(); tile.style.opacity = '';
      D.active = false; document.body.classList.remove('dnd-on');
      ['mousemove', 'mouseup', 'touchmove', 'touchend', 'touchcancel'].forEach((n, k) => document.removeEventListener(n, [move, end, move, end, cancel][k], true));
    };
    document.addEventListener(touch ? 'touchmove' : 'mousemove', move, true);
    document.addEventListener(touch ? 'touchend' : 'mouseup', end, true);
    if (touch) { document.addEventListener('touchcancel', cancel, true); timer = setTimeout(() => { if (!cancelled) start(); }, 380); }
  };
  root.addEventListener('mousedown', begin);
  root.addEventListener('touchstart', begin, { passive: true });
}
