import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../db.js';
import { notify } from '../notify/notifyService.js';
import { groups, chats, chatDir, isMember, userName } from './groupStore.js';

const bad = (error, status = 400) => ({ status, json: { error } });
const MAX_MSGS = 500, MAX_IMG = 1_500_000;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const lastNotify = new Map();   // "gruppo|utente" -> ora dell'ultima notifica (per non riempire di avvisi)

const member = (userId, gid) => { const g = groups()[gid]; return g && isMember(g, userId) ? g : null; };
const EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const pub = (m, me) => {
  const by = {};
  for (const [uid, e] of Object.entries(m.reacts || {})) (by[e] ||= []).push(uid);
  return { id: m.id, userId: m.userId, name: userName(m.userId), ts: m.ts, text: m.text || '', img: m.img || '',
    reply: m.reply ? { id: m.reply.id, name: userName(m.reply.userId), text: m.reply.text, photo: !!m.reply.photo } : null,
    reacts: Object.entries(by).map(([e, ids]) => ({ e, n: ids.length, mine: ids.includes(me), who: ids.map(userName) })) };
};

export const chatRoutes = [
  // messaggi: senza "after" gli ultimi 100, con "after" solo i nuovi
  { method: 'get', path: '/api/groups/:id/chat', auth: 'user', handler: ({ userId, params, query }) => {
    if (!member(userId, params.id)) return bad('Gruppo non trovato', 404);
    const all = chats()[params.id] || [], after = Number(query?.after) || 0;
    const list = after ? all.filter(m => m.ts > after) : all.slice(-100);
    return { json: { messages: list.map(m => pub(m, userId)), me: userId } };
  } },

  { method: 'post', path: '/api/groups/:id/chat', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = member(userId, params.id); if (!g) return bad('Gruppo non trovato', 404);
    const text = String(body?.text || '').trim().slice(0, 2000);
    let img = '';
    if (body?.image) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image));
      if (!m) return bad('Immagine non valida');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_IMG) return bad('Immagine troppo grande');
      fs.mkdirSync(chatDir(g.id), { recursive: true });
      img = crypto.randomBytes(8).toString('hex') + '.' + TYPES[m[1]];
      fs.writeFileSync(path.join(chatDir(g.id), img), buf);
    }
    if (!text && !img) return bad('Messaggio vuoto');
    const list = (chats()[g.id] = chats()[g.id] || []);
    const last = list[list.length - 1];
    const msg = { id: crypto.randomBytes(6).toString('hex'), userId, ts: Math.max(Date.now(), (last?.ts || 0) + 1), text, img };
    const orig = body?.reply ? list.find(x => x.id === String(body.reply)) : null;
    if (orig) msg.reply = { id: orig.id, userId: orig.userId, text: (orig.text || '').slice(0, 120), photo: !!orig.img };
    list.push(msg);
    while (list.length > MAX_MSGS) { const old = list.shift(); if (old.img) try { fs.unlinkSync(path.join(chatDir(g.id), old.img)); } catch {} }
    await db.flush();
    const now = Date.now();
    for (const id of Object.keys(g.members)) {
      if (id === userId) continue;
      const k = g.id + '|' + id; if (now - (lastNotify.get(k) || 0) < 5 * 60 * 1000) continue;
      lastNotify.set(k, now);
      await notify(id, { title: `Messaggio in “${g.name}”`, body: `${userName(userId)}: ${text ? text.slice(0, 80) : '📷 foto'}`, page: 'groups/' + g.id, from: 'gruppi' });
    }
    return { json: { ok: true, message: pub(msg, userId) } };
  } },

  // immagine (la scarica la pagina con il suo token)
  { method: 'get', path: '/api/groups/:id/chat/img/:name', auth: 'user', handler: ({ userId, params }) => {
    if (!member(userId, params.id)) return bad('Gruppo non trovato', 404);
    const name = path.basename(params.name), ext = name.split('.').pop();
    if (!MIME[ext]) return bad('Non trovato', 404);
    try { return { raw: fs.readFileSync(path.join(chatDir(params.id), name)), type: MIME[ext] }; } catch { return bad('Non trovato', 404); }
  } },

  // reazione con una faccina (di nuovo la stessa = la toglie)
  { method: 'put', path: '/api/groups/:id/chat/:mid/react', auth: 'user', handler: async ({ userId, params, body }) => {
    const g = member(userId, params.id); if (!g) return bad('Gruppo non trovato', 404);
    const m = (chats()[g.id] || []).find(x => x.id === params.mid); if (!m) return bad('Messaggio non trovato', 404);
    const e = String(body?.emoji || ''); m.reacts = m.reacts || {};
    if (!EMOJI.includes(e) || m.reacts[userId] === e) delete m.reacts[userId]; else m.reacts[userId] = e;
    await db.flush(); return { json: { ok: true } };
  } },

  // elimina un proprio messaggio (o qualsiasi messaggio se sei il creatore del gruppo)
  { method: 'delete', path: '/api/groups/:id/chat/:mid', auth: 'user', handler: async ({ userId, params }) => {
    const g = member(userId, params.id); if (!g) return bad('Gruppo non trovato', 404);
    const list = chats()[g.id] || [], i = list.findIndex(m => m.id === params.mid);
    if (i < 0) return { json: { ok: true } };
    if (list[i].userId !== userId && g.ownerId !== userId) return bad('Puoi eliminare solo i tuoi messaggi', 403);
    const [old] = list.splice(i, 1); if (old.img) try { fs.unlinkSync(path.join(chatDir(g.id), old.img)); } catch {}
    await db.flush(); return { json: { ok: true } };
  } }
];
