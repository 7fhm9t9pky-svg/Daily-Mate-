import fs from 'fs';
import path from 'path';
import { db } from '../db.js';
import { SYSTEM, TOOLS } from '../../../app/modules/assistant/spec.js';

/**
 * Assistente virtuale: il server fa solo da "ponte" verso Claude (la chiave resta qui, mai sul telefono).
 * Le azioni sui dati le esegue il telefono con gli strumenti di spec.js.
 */
const DATA_DIR = () => process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CFG = () => path.join(DATA_DIR(), 'assistant.json'), REQ = () => path.join(DATA_DIR(), 'requests.json');
const BASE = () => process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, v) => { fs.mkdirSync(DATA_DIR(), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const cfg = () => ({ apiKey: '', model: 'claude-haiku-5-5', ...read(CFG(), {}) });
const key = () => process.env.ANTHROPIC_API_KEY || cfg().apiKey;
const bad = (error, status = 400) => ({ status, json: { error } });

const hits = new Map();   // limite: 60 messaggi all'ora per utente (la chiave e' a carico del proprietario)
function allowed(userId) {
  const now = Date.now(), l = (hits.get(userId) || []).filter(t => now - t < 3600e3);
  if (l.length >= 60) return false;
  l.push(now); hits.set(userId, l); return true;
}

const status = userId => ({ enabled: !!key(), model: cfg().model, owner: db.isOwner(userId), fromEnv: !!process.env.ANTHROPIC_API_KEY });

export const assistantRoutes = [
  { method: 'get', path: '/api/assistant/status', auth: 'user', handler: ({ userId }) => ({ json: status(userId) }) },
  { method: 'put', path: '/api/assistant/config', auth: 'admin', handler: ({ userId, body }) => {
    if (!db.isOwner(userId)) return bad('Solo il proprietario può impostare l\'assistente', 403);
    const c = cfg();
    if (typeof body?.apiKey === 'string') c.apiKey = body.apiKey.trim().slice(0, 300);
    if (typeof body?.model === 'string' && /^[\w.-]{3,60}$/.test(body.model.trim())) c.model = body.model.trim();
    write(CFG(), c); return { json: status(userId) };
  } },
  { method: 'post', path: '/api/assistant/chat', auth: 'user', handler: async ({ userId, body }) => {
    if (!key()) return bad('L\'assistente non è ancora attivo: l\'amministratore deve inserire la chiave.', 503);
    if (!allowed(userId)) return bad('Hai fatto molte domande in poco tempo: riprova tra un po\'.', 429);
    const msgs = Array.isArray(body?.messages) ? body.messages.slice(-30) : [];
    if (!msgs.length || JSON.stringify(msgs).length > 60000) return bad('Conversazione troppo lunga: inizia una nuova chat.');
    const context = String(body?.context || '').slice(0, 3000);
    try {
      const r = await fetch(BASE() + '/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg().model, max_tokens: 1024, system: SYSTEM + '\n\nContesto attuale:\n' + context, tools: TOOLS, messages: msgs })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return bad(r.status === 401 ? 'La chiave dell\'assistente non è valida.' : (j?.error?.message || `Errore del servizio (${r.status})`), 502);
      return { json: { content: j.content || [], stop_reason: j.stop_reason } };
    } catch (e) { return bad('Non riesco a raggiungere l\'assistente (controlla la connessione del PC).', 502); }
  } },
  { method: 'post', path: '/api/assistant/request', auth: 'user', handler: ({ userId, body }) => {
    const text = String(body?.text || '').trim().slice(0, 600); if (!text) return bad('Scrivi la richiesta');
    const l = read(REQ(), []); const u = db.findUserById(userId);
    l.push({ id: Math.random().toString(36).slice(2, 9), user: u?.displayName || u?.username || '?', at: new Date().toISOString(), text });
    write(REQ(), l.slice(-200)); return { json: { ok: true } };
  } },
  { method: 'get', path: '/api/assistant/requests', auth: 'admin', handler: ({ userId }) => db.isOwner(userId) ? { json: { requests: read(REQ(), []) } } : bad('Solo il proprietario', 403) },
  { method: 'delete', path: '/api/assistant/requests/:id', auth: 'admin', handler: ({ userId, params }) => {
    if (!db.isOwner(userId)) return bad('Solo il proprietario', 403);
    write(REQ(), read(REQ(), []).filter(x => x.id !== params.id)); return { json: { ok: true } };
  } }
];
