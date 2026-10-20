import { db } from './db.js';
import * as notif from './notify/notifyService.js';
import { groupRoutes } from './groups/groupRoutes.js';
import { chatRoutes } from './groups/chatRoutes.js';
import { getRates } from './rates/rates.js';
import { assistantRoutes } from './assistant/assistantRoutes.js';

/**
 * Tabella delle rotte "nuove" (notifiche, push, amministrazione). Ogni rotta e' una
 * funzione semplice: ricevono { userId, params, body } e restituiscono { status?, json }.
 * index.js le collega a Express; i test le collegano a un server minimale.
 */
const bad = (error, status = 400) => ({ status, json: { error } });

export const UI_PAGES = ['calendar', 'documents', 'contacts', 'alerts', 'finance', 'activity', 'groups'];   // pagine che l'admin puo' nascondere
const MODES = ['', 'auto', 'light', 'dark'];
const ACCENTS = ['', 'verde', 'blu', 'viola', 'rosso', 'grigio'];

/** Pulisce la configurazione dell'interfaccia: solo campi noti, valori sensati. */
export function cleanUi(u = {}) {
  const out = {};
  out.hidden = (Array.isArray(u.hidden) ? u.hidden : []).filter(x => UI_PAGES.includes(x));
  out.labels = {};
  for (const [k, v] of Object.entries(u.labels || {})) if ([...UI_PAGES, 'home', 'settings'].includes(k) && typeof v === 'string' && v.trim()) out.labels[k] = v.trim().slice(0, 24);
  out.accent = ACCENTS.includes(u.accent) ? u.accent : '';
  out.mode = MODES.includes(u.mode) ? u.mode : '';
  out.lock = !!u.lock && !!(out.accent || out.mode);
  if (Array.isArray(u.sheets)) out.sheets = [...new Set(u.sheets.map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n < 9);
  out.sheetLabels = {};
  for (const [k, v] of Object.entries(u.sheetLabels || {})) if (/^[0-8]$/.test(k) && typeof v === 'string' && v.trim()) out.sheetLabels[k] = v.trim().slice(0, 30);
  out.welcome = String(u.welcome || '').trim().slice(0, 200);
  return out;
}

export const apiRoutes = [
  { method: 'get', path: '/api/rates', auth: 'user', handler: async () => ({ json: await getRates() }) },
  ...groupRoutes,
  ...chatRoutes,
  ...assistantRoutes,
  // ---- notifiche dell'utente
  { method: 'get', path: '/api/notifications', auth: 'user', handler: ({ userId }) => ({ json: { ...notif.listFor(userId), ui: db.getUi(userId), role: db.role(userId), devices: notif.deviceCount(userId) } }) },
  { method: 'post', path: '/api/notifications/read', auth: 'user', handler: async ({ userId, body }) => { await notif.markRead(userId, body?.ids === 'all' ? 'all' : body?.ids); return { json: { ok: true } }; } },
  { method: 'post', path: '/api/notifications/test', auth: 'user', handler: async ({ userId }) => ({ json: await notif.notify(userId, { title: 'Notifica di prova', body: 'Se la vedi, le notifiche funzionano.', page: 'settings', from: 'sistema' }) }) },
  { method: 'get', path: '/api/push/key', auth: 'user', handler: () => ({ json: { publicKey: notif.getVapid().publicKey } }) },
  { method: 'post', path: '/api/push/subscribe', auth: 'user', handler: async ({ userId, body }) => { try { await notif.subscribe(userId, body?.subscription); return { json: { ok: true } }; } catch (e) { return bad(e.message); } } },
  { method: 'post', path: '/api/push/unsubscribe', auth: 'user', handler: async ({ userId, body }) => { await notif.unsubscribe(userId, body?.endpoint); return { json: { ok: true } }; } },
  // ---- amministratore
  { method: 'get', path: '/api/admin/users', auth: 'admin', handler: () => ({ json: { users: db.listUsers().map(u => ({ ...u, devices: notif.deviceCount(u.id) })) } }) },
  // un visitatore (permessi amministrativi) gestisce solo gli utenti normali e se stesso; il proprietario gestisce tutti
  { method: 'put', path: '/api/admin/users/:id/role', auth: 'admin', handler: async ({ userId, params, body }) => {
    if (!db.isOwner(userId)) return bad('Solo il proprietario può cambiare i permessi', 403);
    if (!db.findUserById(params.id)) return bad('Utente non trovato', 404);
    if (db.isOwner(params.id)) return bad('Il proprietario non si può cambiare');
    const role = body?.role === 'visitor' ? 'visitor' : 'user';
    await db.setRole(params.id, role); return { json: { ok: true, role } };
  } },
  { method: 'put', path: '/api/admin/users/:id/ui', auth: 'admin', handler: async ({ userId, params, body }) => {
    if (!db.findUserById(params.id)) return bad('Utente non trovato', 404);
    if (!db.isOwner(userId) && params.id !== userId && db.role(params.id) !== 'user') return bad('Puoi modificare solo gli utenti normali', 403);
    const ui = cleanUi(body?.ui); await db.setUi(params.id, ui); return { json: { ok: true, ui } };
  } },
  { method: 'post', path: '/api/admin/notify', auth: 'admin', handler: async ({ body }) => {
    const title = String(body?.title || '').trim(); if (!title) return bad('Scrivi un titolo');
    const ids = body?.to === 'all' ? db.listUsers().map(u => u.id) : [].concat(body?.to || []).filter(id => db.findUserById(id));
    if (!ids.length) return bad('Scegli almeno un destinatario');
    for (const id of ids) await notif.notify(id, { title, body: body?.body || '', page: body?.page || '', from: 'admin' });
    return { json: { ok: true, sent: ids.length } };
  } }
];
