import fs from 'fs';
import path from 'path';
import { db } from '../db.js';
import { SYSTEM, TOOLS } from '../../../app/modules/assistant/spec.js';

/**
 * Assistente virtuale: il server fa solo da "ponte" verso il servizio scelto (Gemini, Groq, OpenRouter o Claude): le chiavi restano qui, mai sul telefono.
 * Le azioni sui dati le esegue il telefono con gli strumenti di spec.js.
 */
const DATA_DIR = () => process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CFG = () => path.join(DATA_DIR(), 'assistant.json'), REQ = () => path.join(DATA_DIR(), 'requests.json');
/** Servizi supportati: i gratuiti per primi, Anthropic (a pagamento) per ultimo. */
export const PROVIDERS = {
  gemini: { label: 'Google Gemini (gratis)', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', help: 'aistudio.google.com → “Get API key”' },
  groq: { label: 'Groq (gratis)', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', help: 'console.groq.com → “API Keys”' },
  openrouter: { label: 'OpenRouter (modelli gratuiti)', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', help: 'openrouter.ai → “Keys” (scegli un modello che finisce con :free)' },
  anthropic: { label: 'Anthropic Claude (a pagamento)', kind: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-haiku-5-5', help: 'console.anthropic.com → “API keys”' }
};
const ORDER = ['gemini', 'groq', 'openrouter', 'anthropic'];
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, v) => { fs.mkdirSync(DATA_DIR(), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
/** { gemini: { apiKey, model }, ... }  (compatibile col vecchio formato { apiKey, model } = Anthropic) */
const keys = () => {
  const c = read(CFG(), {}), k = { ...(c.keys || {}) };
  if (c.apiKey && !k.anthropic) k.anthropic = { apiKey: c.apiKey, model: c.model };
  if (process.env.ANTHROPIC_API_KEY) k.anthropic = { ...(k.anthropic || {}), apiKey: process.env.ANTHROPIC_API_KEY };
  for (const id of Object.keys(k)) if (!PROVIDERS[id] || !k[id]?.apiKey) delete k[id];
  return k;
};
const baseOf = id => id === 'anthropic' ? (process.env.ANTHROPIC_API_BASE || PROVIDERS.anthropic.base) : (process.env[id.toUpperCase() + '_API_BASE'] || PROVIDERS[id].base);
const bad = (error, status = 400) => ({ status, json: { error } });

const hits = new Map();   // limite: 60 messaggi all'ora per utente
function allowed(userId) {
  const now = Date.now(), l = (hits.get(userId) || []).filter(t => now - t < 3600e3);
  if (l.length >= 60) return false;
  l.push(now); hits.set(userId, l); return true;
}

const status = userId => {
  const k = keys();
  return { enabled: Object.keys(k).length > 0, owner: db.isOwner(userId), active: ORDER.filter(id => k[id]), fromEnv: !!process.env.ANTHROPIC_API_KEY,
    providers: ORDER.map(id => ({ id, label: PROVIDERS[id].label, help: PROVIDERS[id].help, model: k[id]?.model || PROVIDERS[id].model, configured: !!k[id] })) };
};

// ---- traduzione dal formato Anthropic (usato dall'app) al formato "OpenAI" (usato da Gemini, Groq, OpenRouter)
const cleanSchema = x => {
  if (Array.isArray(x)) return x.map(cleanSchema);
  if (!x || typeof x !== 'object') return x;
  const o = {}; for (const [k, v] of Object.entries(x)) if (k !== 'additionalProperties') o[k] = cleanSchema(v);
  return o;
};
export function toOpenAI(system, tools, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'assistant') {
      const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n'), calls = m.content.filter(b => b.type === 'tool_use');
      const msg = { role: 'assistant', content: text || null };
      if (calls.length) msg.tool_calls = calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input || {}) } }));
      out.push(msg);
    } else for (const b of m.content) {
      if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content ?? '') });
      else if (b.type === 'text') out.push({ role: 'user', content: b.text });
    }
  }
  const fns = tools.map(t => {
    const params = cleanSchema(t.input_schema), empty = !params.properties || !Object.keys(params.properties).length;
    return { type: 'function', function: { name: t.name, description: t.description, ...(empty ? {} : { parameters: params }) } };
  });
  return { messages: out, tools: fns };
}
export function fromOpenAI(j) {
  const m = j?.choices?.[0]?.message || {}, content = [];
  if (m.content) content.push({ type: 'text', text: String(m.content) });
  for (const c of m.tool_calls || []) {
    let input = {}; try { input = JSON.parse(c.function?.arguments || '{}'); } catch { /* argomenti rovinati */ }
    content.push({ type: 'tool_use', id: c.id || 'call_' + Math.random().toString(36).slice(2, 10), name: c.function?.name, input });
  }
  return { content, stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
}

async function callProvider(id, conf, system, msgs) {
  const P = PROVIDERS[id], model = conf.model || P.model;
  if (P.kind === 'anthropic') {
    const r = await fetch(baseOf(id) + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': conf.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 1024, system, tools: TOOLS, messages: msgs }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, msg: j?.error?.message, data: r.ok ? { content: j.content || [], stop_reason: j.stop_reason } : null };
  }
  const t = toOpenAI(system, TOOLS, msgs);
  const r = await fetch(baseOf(id) + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + conf.apiKey }, body: JSON.stringify({ model, max_tokens: 1024, messages: t.messages, tools: t.tools }) });
  const j = await r.json().catch(() => ({}));
  const em = Array.isArray(j) ? j[0]?.error?.message : j?.error?.message;
  return { ok: r.ok, status: r.status, msg: em, data: r.ok ? fromOpenAI(j) : null };
}

export const assistantRoutes = [
  { method: 'get', path: '/api/assistant/status', auth: 'user', handler: ({ userId }) => ({ json: status(userId) }) },
  { method: 'put', path: '/api/assistant/config', auth: 'admin', handler: ({ userId, body }) => {
    if (!db.isOwner(userId)) return bad('Solo il proprietario può impostare l\'assistente', 403);
    const id = String(body?.provider || 'anthropic');
    if (!PROVIDERS[id]) return bad('Servizio sconosciuto');
    const c = read(CFG(), {}); c.keys = { ...(c.keys || {}) };
    if (c.apiKey) { c.keys.anthropic ||= { apiKey: c.apiKey, model: c.model }; delete c.apiKey; delete c.model; }   // vecchio formato
    const cur = { ...(c.keys[id] || {}) };
    if (typeof body?.apiKey === 'string') cur.apiKey = body.apiKey.trim().slice(0, 300);
    if (typeof body?.model === 'string') cur.model = /^[\w.:/-]{3,80}$/.test(body.model.trim()) ? body.model.trim() : '';
    if (!cur.apiKey) delete c.keys[id]; else c.keys[id] = cur;
    write(CFG(), c); return { json: status(userId) };
  } },
  { method: 'post', path: '/api/assistant/chat', auth: 'user', handler: async ({ userId, body }) => {
    const k = keys(), active = ORDER.filter(id => k[id]);
    if (!active.length) return bad('L\'assistente non è ancora attivo: l\'amministratore deve inserire la chiave.', 503);
    if (!allowed(userId)) return bad('Hai fatto molte domande in poco tempo: riprova tra un po\'.', 429);
    const msgs = Array.isArray(body?.messages) ? body.messages.slice(-30) : [];
    if (!msgs.length || JSON.stringify(msgs).length > 60000) return bad('Conversazione troppo lunga: inizia una nuova chat.');
    const system = SYSTEM + '\n\nContesto attuale:\n' + String(body?.context || '').slice(0, 3000);
    let last = '', auth = false, limit = false;
    for (const id of active) {      // se un servizio ha finito il limite o non risponde, prova il successivo
      try {
        const r = await callProvider(id, k[id], system, msgs);
        if (r.ok) return { json: r.data };
        if (r.status === 401 || r.status === 403) auth = true; else if (r.status === 429) limit = true;
        last = r.msg || `errore ${r.status}`; console.error('Assistente', id, r.status, last);
      } catch (e) { last = 'non raggiungibile'; console.error('Assistente', id, e.message); }
    }
    return bad(limit ? 'L\'assistente ha raggiunto il limite gratuito di oggi: riprova più tardi.' : auth ? 'La chiave dell\'assistente non è valida: l\'amministratore deve ricontrollarla.' : `Non riesco a raggiungere l\'assistente (${last}).`, 502);
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
