import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Persistenza minimale a file JSON: niente dipendenze native da compilare,
 * funziona ovunque giri Node. Adatta per uso personale/tra amici; per numeri
 * più grandi di utenti si può sostituire con Postgres/SQLite senza toccare
 * le rotte (basta riscrivere questo file mantenendo le stesse funzioni).
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, kv: {} }, null, 2));
}
ensureFile();

let state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
for (const k of ['adminUi', 'inbox', 'push', 'sent', 'groups', 'requests', 'groupItems', 'chats']) state[k] = state[k] || {};
let writeQueue = Promise.resolve();

/**
 * Salvataggio sicuro: si scrive prima su un file temporaneo e poi lo si rinomina,
 * cosi' un blocco o una chiusura improvvisa non puo' lasciare db.json a meta'.
 * Ogni 30 minuti (se ci sono state modifiche) e a ogni avvio viene fatta anche una
 * copia di backup FUORI dalla cartella del programma (default: Documenti/DailyMate-backup
 * nella cartella dell'utente), cosi' sostituire o cancellare la cartella non fa perdere nulla.
 */
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'DailyMate-backup');
const BACKUP_EVERY_MS = 30 * 60 * 1000, BACKUP_KEEP = 60;
let lastBackup = 0;

function backup(force = false) {
  try {
    if (!force && Date.now() - lastBackup < BACKUP_EVERY_MS) return;
    if (!fs.existsSync(DB_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const name = `db-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, name));
    lastBackup = Date.now();
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d{8}-\d{4}\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - BACKUP_KEEP)).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
  } catch (e) { console.error('Backup non riuscito:', e.message); }
}
backup(true);
console.log('Copie di sicurezza in: ' + BACKUP_DIR);

function persist() {
  writeQueue = writeQueue.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.promises.rename(tmp, DB_FILE);
    backup();
  }).catch(e => console.error('Salvataggio fallito:', e.message));
  return writeQueue;
}

export const db = {
  findUserByUsername(username) {
    return Object.values(state.users).find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  },
  findUserById(id) { return state.users[id] || null; },
  /**
   * "Proprietario" del server = chi ha i dati di partenza completi (il foglio Lavoro).
   * Se OWNER_USERNAME e' impostato in .env vale quello, altrimenti e' il PRIMO
   * account creato su questo server.
   */
  isOwner(userId) {
    const wanted = (process.env.OWNER_USERNAME || '').trim().toLowerCase();
    if (wanted) return state.users[userId]?.username.toLowerCase() === wanted;
    return Object.keys(state.users)[0] === userId;
  },
  /** L'amministratore e' il proprietario del server: il primo account creato (o OWNER_USERNAME). */
  isAdmin(userId) { return this.isOwner(userId); },
  listUsers() { return Object.values(state.users).map(u => ({ id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt, isAdmin: this.isOwner(u.id), ui: state.adminUi[u.id] || {} })); },
  /** Ricerca utenti per nome (visualizzato o username), per invitarli nei gruppi. */
  searchUsers(q, exceptId) {
    q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
    return Object.values(state.users).filter(u => u.id !== exceptId && ((u.displayName || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q)))
      .slice(0, 10).map(u => ({ id: u.id, displayName: u.displayName || u.username, username: u.username }));
  },
  getUi(userId) { return state.adminUi[userId] || {}; },
  async setUi(userId, ui) { state.adminUi[userId] = ui; await persist(); },
  /** Contenitori generici (notifiche, iscrizioni push...) salvati nello stesso db.json. */
  bucket(name) { state[name] = state[name] || {}; return state[name]; },
  flush() { return persist(); },
  async createUser(user) { state.users[user.id] = user; await persist(); return user; },

  getValue(userId, key) { return state.kv[userId]?.[key] ?? null; },
  async setValue(userId, key, value) {
    state.kv[userId] = state.kv[userId] || {};
    state.kv[userId][key] = value;
    await persist();
  },
  getAll(userId) { return state.kv[userId] || {}; },
  async setAll(userId, obj) { state.kv[userId] = obj && typeof obj === 'object' ? obj : {}; await persist(); },
  async removeValue(userId, key) {
    if (state.kv[userId]) delete state.kv[userId][key];
    await persist();
  }
};
