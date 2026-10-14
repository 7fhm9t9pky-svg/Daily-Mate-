/* Motore di calcolo del foglio Lavoro (formule SUM, IF, SUMIF, MID, ROUND ...), portato dall'artefatto. */
export function makeEngine(D, today) {
  const S = {}; D.sheets.forEach(s => S[s.name.toUpperCase()] = s);
  class Err { constructor(c) { this.c = c; } }
  const E = c => new Err(c);
  const cn = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const nc = n => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cache = new Map(), stack = new Set(), asts = new Map();
  const TOK = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})(?![\w(])|([A-Za-z_][\w.]*)(?=\()|(<>|<=|>=|[-+*\/^&=<>(),%]))/y;
  function parse(src) {
    const t = []; TOK.lastIndex = 0; src = src.slice(1);
    while (TOK.lastIndex < src.length) {
      if (/^\s*$/.test(src.slice(TOK.lastIndex))) break;
      const m = TOK.exec(src); if (!m) throw new Error('sintassi');
      if (m[1] !== undefined) t.push({ k: 'num', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) t.push({ k: 'str', v: m[2].slice(1, -1).replace(/""/g, '"') });
      else if (m[4] !== undefined) {
        const sh = m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '') : null;
        const [a, b] = m[4].replace(/\$/g, '').toUpperCase().split(':');
        t.push({ k: 'ref', sh, a, b });
      } else if (m[5] !== undefined) t.push({ k: 'fn', v: m[5].toUpperCase() });
      else t.push({ k: 'op', v: m[6] });
    }
    let p = 0; const pk = () => t[p], isOp = (...o) => t[p] && t[p].k === 'op' && o.includes(t[p].v);
    const bin = (sub, ops) => () => { let l = sub(); while (isOp(...ops)) { const o = t[p++].v; l = { k: 'b', o, l, r: sub() }; } return l; };
    const un = () => { if (isOp('-')) { p++; return { k: 'neg', e: un() }; } if (isOp('+')) { p++; return un(); } return post(); };
    const post = () => { let e = prim(); while (isOp('%')) { p++; e = { k: 'b', o: '/', l: e, r: { k: 'num', v: 100 } }; } return e; };
    const pow = bin(un, ['^']), mul = bin(pow, ['*', '/']), add = bin(mul, ['+', '-']), cat = bin(add, ['&']), cmp = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
    function prim() {
      const x = t[p++]; if (!x) throw new Error('fine');
      if (x.k === 'num' || x.k === 'str' || x.k === 'ref') return x;
      if (x.k === 'fn') { p++; const args = []; if (!isOp(')')) { do { if (isOp(',')) p++; args.push(cmp()); } while (isOp(',')); } if (!isOp(')')) throw new Error(')'); p++; return { k: 'call', n: x.v, args }; }
      if (x.k === 'op' && x.v === '(') { const e = cmp(); if (!isOp(')')) throw new Error(')'); p++; return e; }
      throw new Error('token');
    }
    const r = cmp(); if (p < t.length) throw new Error('resto'); return r;
  }
  const ast = raw => { let a = asts.get(raw); if (!a) { a = parse(raw); asts.set(raw, a); } return a; };
  const N = v => v == null ? 0 : typeof v === 'number' ? v : typeof v === 'boolean' ? +v : v instanceof Err ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(v)) ? Number(v) : E('#VALUE!');
  const Sx = v => v == null ? '' : v instanceof Err ? v : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
  const at = (x, i) => Array.isArray(x) ? x[i] : x;
  const lift = f => (a, b) => { if (Array.isArray(a) || Array.isArray(b)) { const n = Math.max(a.length || 0, b.length || 0), o = []; for (let i = 0; i < n; i++) o.push(f(at(a, i), at(b, i))); return o; } return f(a, b); };
  const ar = f => lift((a, b) => { a = N(a); b = N(b); if (a instanceof Err) return a; if (b instanceof Err) return b; return f(a, b); });
  const cmpf = op => lift((a, b) => {
    if (a instanceof Err) return a; if (b instanceof Err) return b;
    if (a == null) a = typeof b === 'string' ? '' : 0; if (b == null) b = typeof a === 'string' ? '' : 0;
    if (typeof a === 'string') a = a.toLowerCase(); if (typeof b === 'string') b = b.toLowerCase();
    if (typeof a !== typeof b) return op === '<>' ? true : op === '=' ? false : (typeof a === 'string') === (op === '>' || op === '>=');
    return op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
  });
  const OP = {
    '+': ar((a, b) => a + b), '-': ar((a, b) => a - b), '*': ar((a, b) => a * b), '^': ar((a, b) => Math.pow(a, b)),
    '/': ar((a, b) => b === 0 ? E('#DIV/0!') : a / b), '&': lift((a, b) => a instanceof Err ? a : b instanceof Err ? b : Sx(a) + Sx(b)),
    '=': cmpf('='), '<>': cmpf('<>'), '<': cmpf('<'), '>': cmpf('>'), '<=': cmpf('<='), '>=': cmpf('>=')
  };
  function get(sh, a) {
    const k = sh.name + '!' + a; if (cache.has(k)) return cache.get(k);
    if (stack.has(k)) return E('#REF!');
    stack.add(k); const raw = sh.cells[a]; let v;
    if (typeof raw === 'string' && raw[0] === '=') { try { v = ev(ast(raw), sh); } catch (e) { v = e instanceof Err ? e : E('#ERROR!'); } if (Array.isArray(v)) v = v[0]; }
    else v = raw === undefined || raw === '' ? null : raw;
    stack.delete(k); cache.set(k, v); return v;
  }
  function range(t, n) {
    let c1, r1, c2, r2; const pa = /^([A-Z]+)(\d*)$/.exec(n.a), pb = /^([A-Z]+)(\d*)$/.exec(n.b);
    c1 = cn(pa[1]); c2 = cn(pb[1]); r1 = pa[2] ? +pa[2] : 1; r2 = pb[2] ? +pb[2] : t.maxRow;
    if (r1 > r2) [r1, r2] = [r2, r1]; if (c1 > c2) [c1, c2] = [c2, c1];
    const o = []; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) o.push(get(t, nc(c) + r)); return o;
  }
  function ev(n, sh) {
    switch (n.k) {
      case 'num': case 'str': return n.v;
      case 'ref': { const t = n.sh ? S[n.sh.toUpperCase()] : sh; if (!t) return E('#REF!'); return n.b ? range(t, n) : get(t, n.a); }
      case 'neg': { const v = ev(n.e, sh); const f = x => { x = N(x); return x instanceof Err ? x : -x; }; return Array.isArray(v) ? v.map(f) : f(v); }
      case 'b': return OP[n.o](ev(n.l, sh), ev(n.r, sh));
      case 'call': return call(n, sh);
    }
  }
  function nums(args, sh) {
    const o = [];
    for (const a of args) { const v = ev(a, sh);
      if (Array.isArray(v)) { for (const x of v) { if (x instanceof Err) return x; if (typeof x === 'number') o.push(x); } }
      else { const x = N(v); if (x instanceof Err) return x; o.push(x); } }
    return o;
  }
  function call(n, sh) {
    const A = n.args, f = n.n;
    if (f === 'TODAY') return today;
    if (f === 'IF') {
      const c = ev(A[0], sh);
      if (Array.isArray(c)) { const t = A[1] ? ev(A[1], sh) : true, e = A[2] ? ev(A[2], sh) : false; return c.map((x, i) => x instanceof Err ? x : (x ? at(t, i) : at(e, i))); }
      if (c instanceof Err) return c; const b = A[c ? 1 : 2]; return b ? ev(b, sh) : (c ? true : false);
    }
    if (f === 'MID') { const s = Sx(ev(A[0], sh)), a = N(ev(A[1], sh)), l = N(ev(A[2], sh)); for (const x of [s, a, l]) if (x instanceof Err) return x; return s.substr(a - 1, l); }
    const crit = cr => {                       // criterio tipo ">=10", "Bollette", "<>No"
      const m = /^(<>|<=|>=|=|<|>)?(.*)$/.exec(Sx(cr)), op = m[1] || '=', cv = m[2], num = cv.trim() !== '' && !isNaN(cv), c = cmpf(op);
      return x => num ? (typeof x === 'number' && c(x, Number(cv))) : (x != null && typeof x !== 'number' && c(String(x), cv));
    };
    const arr = x => Array.isArray(x) ? x : [x];
    if (f === 'SUMIF') {
      const r = ev(A[0], sh), cr = ev(A[1], sh), sr = A[2] ? ev(A[2], sh) : r, ok = crit(cr); let s = 0;
      arr(r).forEach((x, i) => { const y = at(sr, i); if (ok(x) && typeof y === 'number') s += y; });
      return s;
    }
    if (f === 'COUNTIF') { const ok = crit(ev(A[1], sh)); return arr(ev(A[0], sh)).filter(ok).length; }
    if (f === 'SUMIFS') {                      // SUMIFS(somma; intervallo1; criterio1; intervallo2; criterio2 ...)
      const sr = arr(ev(A[0], sh)), tests = [];
      for (let k = 1; k + 1 < A.length; k += 2) tests.push([arr(ev(A[k], sh)), crit(ev(A[k + 1], sh))]);
      let s = 0; sr.forEach((y, i) => { if (typeof y === 'number' && tests.every(([r, ok]) => ok(r[i]))) s += y; });
      return s;
    }
    if (f === 'DATE') { const [y, m, d] = A.map(a => N(ev(a, sh))); for (const x of [y, m, d]) if (x instanceof Err) return x; return Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 25569; }
    if (f === 'DAY' || f === 'MONTH' || f === 'YEAR') {
      const x = N(ev(A[0], sh)); if (x instanceof Err) return x;
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(x) * 864e5);
      return f === 'DAY' ? d.getUTCDate() : f === 'MONTH' ? d.getUTCMonth() + 1 : d.getUTCFullYear();
    }
    const v = nums(A, sh); if (v instanceof Err) return v;
    switch (f) {
      case 'SUM': return v.reduce((a, b) => a + b, 0);
      case 'MIN': return v.length ? Math.min(...v) : 0;
      case 'MAX': return v.length ? Math.max(...v) : 0;
      case 'AVERAGE': return v.length ? v.reduce((a, b) => a + b, 0) / v.length : E('#DIV/0!');
      case 'COUNT': return v.length;
      case 'ABS': return Math.abs(v[0]);
      case 'ROUND': { const k = Math.pow(10, v[1] || 0); return Math.round(v[0] * k) / k; }
    }
    return E('#NAME?');
  }
  return {
    Err, nc, cn, S,
    get: (name, a) => get(S[name.toUpperCase()], a),
    set(name, a, raw) { const c = S[name.toUpperCase()].cells; if (raw === null || raw === '') delete c[a]; else c[a] = raw; cache.clear(); },
    check(raw) { if (raw[0] === '=') ast(raw); },
    clear() { cache.clear(); }
  };
}
