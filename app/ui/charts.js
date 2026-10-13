const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Mini grafico a linea (senza assi) per i quadretti della Home. */
export function spark(values) {
  const v = values.filter(x => typeof x === 'number');
  if (v.length < 2) return '<svg viewBox="0 0 100 40"></svg>';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * 96 + 2).toFixed(1)},${(36 - (x - lo) / span * 32).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}

/** Grafico a linea con assi, per la pagina Attività. points = [[etichetta, valore], ...] */
export function lineChart(points) {
  const P = points.filter(p => typeof p[1] === 'number');
  if (!P.length) return '<p class="empty small">Nessun dato da mostrare</p>';
  const W = 340, H = 190, l = 44, t = 10, b = 24, rr = 10;
  let lo = Math.min(...P.map(p => p[1])), hi = Math.max(...P.map(p => p[1]));
  if (lo === hi) { lo -= 1; hi += 1; }
  const X = i => l + (P.length < 2 ? (W - l - rr) / 2 : i * (W - l - rr) / (P.length - 1));
  const Y = v => t + (hi - v) * (H - t - b) / (hi - lo);
  const k = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Number(v.toFixed(1))).replace('.', ',');
  let g = '';
  for (let i = 0; i < 4; i++) { const v = lo + (hi - lo) * i / 3; g += `<line class="gr" x1="${l}" x2="${W - rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 4}" y="${Y(v) + 3}" text-anchor="end">${k(v)}</text>`; }
  const step = Math.max(1, Math.ceil(P.length / 5));
  const xs = P.map((p, i) => i % step === 0 || i === P.length - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(String(p[0]).slice(0, 7))}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}<polyline class="ln" points="${P.map((p, i) => X(i) + ',' + Y(p[1])).join(' ')}"/>${P.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p[1])}" r="2.5"/>`).join('')}${xs}</svg>`;
}
