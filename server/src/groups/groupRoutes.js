import crypto from 'crypto';
import { db } from '../db.js';
import { notify } from '../notify/notifyService.js';
import { groups, requests, groupItems, ITEM_TYPES, normCode, showCode, newCode, findByCode, isMember, myGroups, userName, itemsFor, dropGroup } from './groupStore.js';

const bad = (error, status = 400) => ({ status, json: { error } });
const ok = (extra = {}) => ({ json: { ok: true, ...extra } });
const rid = () => crypto.randomBytes(6).toString('hex');
const MAX_ITEM = 20000, MAX_PER_TYPE = 2000;

const pubGroup = (g, uid) => ({
  id: g.id, name: g.name, code: showCode(g.code), ownerId: g.ownerId, isOwner: g.ownerId === uid,
  members: Object.entries(g.members).map(([id, m]) => ({ id, name: userName(id), username: db.findUserById(id)?.username || '', role: m.role })).sort((a, b) => (b.role === 'owner') - (a.role === 'owner') || a.name.localeCompare(b.name))
});

async function addMember(g, uid) {
  g.members[uid] = { role: 'member', joinedAt: Date.now() };
  for (const [id, r] of Object.entries(requests())) if (r.groupId === g.id && r.userId === uid) delete requests()[id];
  await db.flush();
}

export const groupRoutes = [
  { method: 'get', path: '/api/groups', auth: 'user', handler: ({ userId }) => {
    const mine = myGroups(userId), reqs = Object.values(requests());
    const incoming = reqs.filter(r => (r.type === 'invite' && r.userId === userId) || (r.type === 'request' && groups()[r.groupId]?.ownerId === userId))
      .map(r => ({ id: r.id, type: r.type, ts: r.ts, groupId: r.groupId, groupName: groups()[r.groupId]?.name || '?', userId: r.userId, userName: userName(r.userId), byName: userName(r.by) }));
    const outgoing = reqs.filter(r => (r.type === 'request' && r.userId === userId) || (r.type === 'invite' && r.by === userId))
      .map(r => ({ id: r.id, type: r.type, ts: r.ts, groupName: groups()[r.groupId]?.name || '?', userName: userName(r.userId) }));
    return { json: { groups: mine.map(g => pubGroup(g, userId)), incoming, outgoing } };
  } },

  { method: 'get', path: '/api/users/search', auth: 'user', handler: ({ userId, query }) => ({ json: { users: db.searchUsers(query?.q, userId) } }) },

  { method: 'post', path: '/api/groups', auth: 'user', handler: async ({ userId, body }) => {
    const name = String(body?.name || '').trim();
    if (name.length < 2 || name.length > 40) return bad('Il nome deve avere da 2 a 40 caratteri');
    if (Object.values(groups()).filter(g => g.ownerId === userId).length >= 20) return bad('Hai già creato troppi gruppi');
    const g = { id: crypto.randomUUID(), code: newCode(), name, ownerId: userId, createdAt: Date.now(), members: { [userId]: { role: 'owner', joinedAt: Date.now() } } };
    groups()[g.id] = g; await db.flush();
    return ok({ group: pubGroup(g, userId) });
  } },

  // chiede di entrare in un gruppo conoscendone il codice
  { method: 'post', path: '/api/groups/join', auth: 'user', handler: async ({ userId, body }) => {
    const g = findByCode(body?.code);
    if (!g) return bad('Nessun gruppo con questo codice', 404);
    if (isMember(g, userId)) return bad('Fai già parte di questo gruppo');
    const pend = Object.values(requests()).find(r => r.groupId === g.id && r.userId === userId);
    if (pend?.type === 'invite') return bad('Sei già stato invitato: accetta l\'invito nelle richieste');
    if (pend) return bad('Hai già inviato la richiesta: attendi che venga accettata');
    const r = { id: rid(), groupId: g.id, userId, by: userId, type: 'request', ts: Date.now() };
    requests()[r.id] = r; await db.flush();
    await notify(g.ownerId, { title: 'Richiesta di ingresso', body: `${userName(userId)} chiede di entrare in “${g.name}”`, page: 'groups', from: 'gruppi' });
    return ok({ groupName: g.name });
  } },

  { method: 'post', path: '/api/groups/requests/:rid/accept', auth: 'user', handler: async ({ userId, params }) => {
    const r = requests()[params.rid]; if (!r) return bad('Richiesta non trovata', 404);
    const g = groups()[r.groupId]; if (!g) { delete requests()[r.id]; await db.flush(); return bad('Il gruppo non esiste più', 404); }
    const allowed = r.type === 'invite' ? r.userId === userId : g.ownerId === userId;
    if (!allowed) return bad('Non puoi accettare questa richiesta', 403);
    await addMember(g, r.userId);
    if (r.type === 'request') await notify(r.userId, { title: 'Richiesta accettata', body: `Ora fai parte di “${g.name}”`, page: 'groups', from: 'gruppi' });
    else await notify(g.ownerId, { title: 'Invito accettato', body: `${userName(r.userId)} è entrato in “${g.name}”`, page: 'groups', from: 'gruppi' });
    return ok();
  } },

  // rifiuta (chi deve decidere) o annulla (chi l'ha inviata)
  { method: 'post', path: '/api/groups/requests/:rid/reject', auth: 'user', handler: async ({ userId, params }) => {
    const r = requests()[params.rid]; if (!r) return bad('Richiesta non trovata', 404);
    const g = groups()[r.groupId];
    const allowed = r.by === userId || r.userId === userId || g?.ownerId === userId;
    if (!allowed) return bad('Non puoi modificare questa richiesta', 403);
    delete requests()[r.id]; await db.flush(); return ok();
  } },

  { method: 'post', path: '/api/groups/:id/invite', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = groups()[params.id]; if (!g) return bad('Gruppo non trovato', 404);
    if (g.ownerId !== userId) return bad('Solo chi ha creato il gruppo può invitare', 403);
    const target = db.findUserById(body?.userId); if (!target) return bad('Utente non trovato', 404);
    if (isMember(g, target.id)) return bad('È già nel gruppo');
    const pend = Object.values(requests()).find(r => r.groupId === g.id && r.userId === target.id);
    if (pend?.type === 'request') { await addMember(g, target.id); await notify(target.id, { title: 'Richiesta accettata', body: `Ora fai parte di “${g.name}”`, page: 'groups', from: 'gruppi' }); return ok({ joined: true }); }
    if (pend) return bad('Hai già invitato questa persona');
    const r = { id: rid(), groupId: g.id, userId: target.id, by: userId, type: 'invite', ts: Date.now() };
    requests()[r.id] = r; await db.flush();
    await notify(target.id, { title: 'Invito a un gruppo', body: `${userName(userId)} ti ha invitato in “${g.name}”`, page: 'groups', from: 'gruppi' });
    return ok();
  } },

  { method: 'put', path: '/api/groups/:id', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = groups()[params.id]; if (!g) return bad('Gruppo non trovato', 404);
    if (g.ownerId !== userId) return bad('Solo chi ha creato il gruppo può modificarlo', 403);
    const name = String(body?.name || '').trim(); if (name.length < 2 || name.length > 40) return bad('Il nome deve avere da 2 a 40 caratteri');
    g.name = name; await db.flush(); return ok();
  } },

  { method: 'post', path: '/api/groups/:id/leave', auth: 'user', handler: async ({ userId, params }) => {
    const g = groups()[params.id]; if (!g || !isMember(g, userId)) return bad('Gruppo non trovato', 404);
    if (g.ownerId === userId) return bad('Sei il creatore: per uscire elimina il gruppo');
    delete g.members[userId]; await db.flush(); return ok();
  } },

  { method: 'post', path: '/api/groups/:id/remove', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = groups()[params.id]; if (!g) return bad('Gruppo non trovato', 404);
    if (g.ownerId !== userId) return bad('Solo chi ha creato il gruppo può rimuovere persone', 403);
    if (body?.userId === userId || !isMember(g, body?.userId)) return bad('Persona non valida');
    delete g.members[body.userId]; await db.flush();
    await notify(body.userId, { title: 'Rimosso da un gruppo', body: `Non fai più parte di “${g.name}”`, page: 'groups', from: 'gruppi' });
    return ok();
  } },

  { method: 'delete', path: '/api/groups/:id', auth: 'user', handler: async ({ userId, params }) => {
    const g = groups()[params.id]; if (!g) return bad('Gruppo non trovato', 404);
    if (g.ownerId !== userId) return bad('Solo chi ha creato il gruppo può eliminarlo', 403);
    const others = Object.keys(g.members).filter(id => id !== userId);
    dropGroup(g.id); await db.flush();
    for (const id of others) await notify(id, { title: 'Gruppo eliminato', body: `“${g.name}” è stato eliminato`, page: 'groups', from: 'gruppi' });
    return ok();
  } },

  // ---- elementi condivisi (eventi / avvisi / documenti)
  { method: 'get', path: '/api/groups/items/:type', auth: 'user', handler: ({ userId, params }) => ITEM_TYPES.includes(params.type) ? { json: { items: itemsFor(userId, params.type) } } : bad('Tipo non valido') },

  { method: 'put', path: '/api/groups/:id/items/:type/:itemId', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = groups()[params.id]; if (!g || !isMember(g, userId)) return bad('Gruppo non trovato', 404);
    if (!ITEM_TYPES.includes(params.type)) return bad('Tipo non valido');
    const raw = body?.item; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Dati non validi');
    if (JSON.stringify(raw).length > MAX_ITEM) return bad('Elemento troppo grande');
    const store = (groupItems()[g.id] = groupItems()[g.id] || {}); const list = (store[params.type] = store[params.type] || {});
    const old = list[params.itemId];
    if (!old && Object.keys(list).length >= MAX_PER_TYPE) return bad('Troppi elementi nel gruppo');
    const item = { ...raw, id: params.itemId, groupId: undefined, groupName: undefined, canEdit: undefined, ownerId: old?.ownerId || userId };
    delete item.groupId; delete item.groupName; delete item.canEdit;
    if (old && old.ownerId !== userId && g.ownerId !== userId) {
      // gli altri membri possono solo spuntare "fatto" su un avviso
      const strip = o => { const c = { ...o }; delete c.done; delete c.updatedAt; return JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]])); };
      if (!(params.type === 'alerts' && strip(old) === strip(item))) return bad('Solo chi l\'ha creato o il creatore del gruppo può modificarlo', 403);
    }
    list[params.itemId] = item; await db.flush();
    if (!old) {
      const what = { events: 'Nuovo evento', alerts: 'Nuovo avviso', documents: 'Nuovo documento' }[params.type];
      for (const id of Object.keys(g.members)) if (id !== userId) await notify(id, { title: `${what} in “${g.name}”`, body: `${userName(userId)}: ${String(item.title || '').slice(0, 80)}`, page: { events: 'calendar', alerts: 'alerts', documents: 'documents' }[params.type], from: 'gruppi' });
    }
    return ok();
  } },

  { method: 'delete', path: '/api/groups/:id/items/:type/:itemId', auth: 'user', handler: async ({ userId, params }) => {
    const g = groups()[params.id]; if (!g || !isMember(g, userId)) return bad('Gruppo non trovato', 404);
    const list = groupItems()[g.id]?.[params.type], old = list?.[params.itemId];
    if (!old) return ok();
    if (old.ownerId !== userId && g.ownerId !== userId) return bad('Solo chi l\'ha creato o il creatore del gruppo può eliminarlo', 403);
    delete list[params.itemId]; await db.flush(); return ok();
  } }
];
