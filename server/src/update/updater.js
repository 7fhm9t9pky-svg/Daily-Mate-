import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

/**
 * Aggiornamento automatico: ogni pochi minuti controlla se nel repository GitHub
 * scelto (Impostazioni > Aggiornamenti) c'e' una versione nuova del programma e,
 * se c'e', la scarica e sostituisce i file. Le pagine (cartella app/) cambiano subito:
 * basta aggiornare il browser. Se cambia anche il server, questo si riavvia da solo.
 *
 * Non tocca MAI: server/data (i dati), server/.env, i dati privati del foglio
 * (server/seed/lavoro-data.json), node_modules, i file .bat.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CFG_FILE = path.join(DATA_DIR, 'update.json');
const API = process.env.UPDATE_API_BASE || 'https://api.github.com';
const ZIPBASE = process.env.UPDATE_ZIP_BASE || 'https://codeload.github.com';
const EVERY_MS = Number(process.env.UPDATE_EVERY_MS) || 60 * 1000;

/** Solo questi percorsi possono essere aggiornati (tutto il resto viene ignorato). */
const ALLOWED = [/^app\//, /^server\/src\//, /^server\/scripts\//, /^server\/package\.json$/, /^server\/seed\/lavoro-template\.json$/, /^README\.md$/, /^TAILSCALE\.md$/, /^server\/\.env\.example$/];

let cfg = { repo: '', branch: 'main', sha: '', lastCheck: 0, lastError: '', lastApplied: 0 };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) }; } catch { /* prima volta */ }
let busy = false, timer = null, etag = '';

function saveCfg() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('update.json:', e.message); }
}

export const status = () => ({ repo: cfg.repo, branch: cfg.branch, sha: cfg.sha ? cfg.sha.slice(0, 7) : '', lastCheck: cfg.lastCheck, lastError: cfg.lastError, lastApplied: cfg.lastApplied });
export const version = () => cfg.sha || 'locale';

/** Legge uno zip in memoria e restituisce [{ name, data() }] (supporta "stored" e "deflate"). */
export function readZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('File zip non valido');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip danneggiato');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    out.push({ name, data: () => {
      const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(ds, ds + csize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    } });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/** Copia nei file del programma quelli consentiti. Restituisce { changed:[...], serverChanged, pkgChanged }. */
export function extractInto(zipBuf, root = ROOT) {
  const changed = [];
  for (const ent of readZip(zipBuf)) {
    if (ent.name.endsWith('/')) continue;
    const rel = ent.name.split('/').slice(1).join('/');          // toglie la cartella iniziale "repo-main/"
    if (!rel || rel.includes('..') || path.isAbsolute(rel) || !ALLOWED.some(r => r.test(rel))) continue;
    const dest = path.join(root, rel), data = ent.data();
    if (fs.existsSync(dest) && Buffer.compare(fs.readFileSync(dest), data) === 0) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest + '.new', data); fs.renameSync(dest + '.new', dest);
    changed.push(rel);
  }
  return { changed, serverChanged: changed.some(f => f.startsWith('server/') && !f.startsWith('server/seed/')), pkgChanged: changed.includes('server/package.json') };
}

async function apply(sha) {
  const res = await fetch(`${ZIPBASE}/${cfg.repo}/zip/${sha}`, { headers: { 'User-Agent': 'daily-mate' } });
  if (!res.ok) throw new Error(`Download non riuscito (${res.status})`);
  const r = extractInto(Buffer.from(await res.arrayBuffer()));
  if (r.pkgChanged) { try { fs.writeFileSync(path.join(DATA_DIR, 'needs-install'), '1'); } catch {} }
  cfg.sha = sha; cfg.lastApplied = Date.now(); saveCfg();
  console.log(`Aggiornamento ${sha.slice(0, 7)}: ${r.changed.length} file cambiati`);
  if (r.serverChanged) {
    if (process.env.DM_SUPERVISED) { console.log('Riavvio il server per applicare l\'aggiornamento...'); setTimeout(() => process.exit(75), 1500); }
    else console.log('Il server e\' cambiato: chiudi e riapri avvia.bat per applicarlo.');
  }
  return r;
}

/** Controlla GitHub e, se c'e' una versione nuova, la installa. */
export async function check() {
  if (busy || !cfg.repo) return status();
  busy = true;
  try {
    const res = await fetch(`${API}/repos/${cfg.repo}/commits/${cfg.branch}`, { headers: { 'User-Agent': 'daily-mate', Accept: 'application/vnd.github+json', ...(etag && cfg.sha ? { 'If-None-Match': etag } : {}) } });
    if (res.status === 304) { cfg.lastError = ''; cfg.lastCheck = Date.now(); saveCfg(); busy = false; return status(); }   // nessuna novita': non conta nel limite di GitHub
    if (res.status === 404) throw new Error('Repository non trovato (deve essere pubblico e il nome scritto come utente/nome)');
    if (res.status === 403 || res.status === 429) throw new Error('GitHub ha limitato le richieste, riprovo piu\' tardi');
    if (!res.ok) throw new Error(`GitHub ha risposto ${res.status}`);
    const sha = (await res.json()).sha;
    if (sha && sha !== cfg.sha) await apply(sha);
    etag = res.headers.get('etag') || '';
    cfg.lastError = '';
  } catch (e) { cfg.lastError = e.message || String(e); console.error('Aggiornamento:', cfg.lastError); }
  cfg.lastCheck = Date.now(); saveCfg(); busy = false;
  return status();
}

export async function setRepo(repo, branch = 'main') {
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Scrivi il repository cosi\': utente/nome');
  if (repo !== cfg.repo) { cfg.repo = repo; cfg.sha = ''; cfg.lastError = ''; }
  cfg.branch = /^[\w./-]+$/.test(branch) ? branch : 'main';
  saveCfg();
  return repo ? check() : status();
}

export function startAutoUpdate() {
  if (timer) return;
  setTimeout(() => check(), 15000);
  timer = setInterval(() => check(), EVERY_MS);
  timer.unref?.();
}
