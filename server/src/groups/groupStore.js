import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, DATA_DIR } from '../db.js';

/** Dati dei gruppi (nessuna logica di notifica: la usano sia le rotte sia i promemoria). */
export const groups = () => db.bucket('groups');
export const requests = () => db.bucket('requests');
export const groupItems = () => db.bucket('groupItems');
export const ITEM_TYPES = ['events', 'alerts', 'documents'];

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // senza 0/O/1/I/L: nessuna confusione quando si detta un codice
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = c => c.slice(0, 4) + '-' + c.slice(4);

export function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 8; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!Object.values(groups()).some(g => g.code === c)) return c;
  }
}

export const findByCode = code => { const c = normCode(code); return Object.values(groups()).find(g => g.code === c) || null; };
export const isMember = (g, uid) => !!g?.members?.[uid];
export const myGroups = uid => Object.values(groups()).filter(g => isMember(g, uid));
export const userName = id => { const u = db.findUserById(id); return u ? (u.displayName || u.username) : 'Utente eliminato'; };

/** Elementi condivisi (eventi/avvisi/documenti) di tutti i gruppi di un utente. */
export function itemsFor(uid, type) {
  const out = [];
  for (const g of myGroups(uid)) {
    const list = groupItems()[g.id]?.[type] || {};
    for (const it of Object.values(list)) out.push({ ...it, groupId: g.id, groupName: g.name, canEdit: it.ownerId === uid || g.ownerId === uid });
  }
  return out;
}

export const chats = () => db.bucket('chats');
export const chatDir = gid => path.join(DATA_DIR, 'chat', gid);

export function dropGroup(id) {
  delete chats()[id]; try { fs.rmSync(chatDir(id), { recursive: true, force: true }); } catch {}
  delete groups()[id]; delete groupItems()[id];
  for (const [rid, r] of Object.entries(requests())) if (r.groupId === id) delete requests()[rid];
}
