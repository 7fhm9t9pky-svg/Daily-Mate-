import fs from 'fs';
import path from 'path';
import { db } from '../db.js';
import { generateVapid, sendPush } from '../push/webpush.js';
import { itemsFor } from '../groups/groupStore.js';
import { occursOn } from '../../../app/modules/calendar/recurrence.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const MAX_INBOX = 100;

let vapid = null;
export function getVapid() {
  if (vapid) return vapid;
  try { vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')); } catch {
    vapid = generateVapid();
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid)); } catch (e) { console.error('vapid.json:', e.message); }
  }
  return vapid;
}

const inbox = () => db.bucket('inbox'), subs = () => db.bucket('push'), sent = () => db.bucket('sent');
let fetchImpl = fetch;
export const _setFetch = f => { fetchImpl = f; };

/** Manda una notifica a un utente: la salva nella sua campanella e la spedisce ai suoi dispositivi. */
export async function notify(userId, { title, body = '', page = '', from = 'sistema' }) {
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(title || '').slice(0, 120), body: String(body).slice(0, 500), page: String(page || ''), from, ts: Date.now(), read: false };
  const list = inbox()[userId] = inbox()[userId] || [];
  list.unshift(item); list.length = Math.min(list.length, MAX_INBOX);
  await db.flush();
  pushToDevices(userId, item).catch(e => console.error('push:', e.message));
  return item;
}

async function pushToDevices(userId, item) {
  const list = subs()[userId] || []; if (!list.length) return;
  const dead = [];
  await Promise.all(list.map(async sub => {
    try {
      const st = await sendPush(sub, { title: item.title, body: item.body, page: item.page, id: item.id }, getVapid(), fetchImpl);
      if (st === 404 || st === 410) dead.push(sub.endpoint);
    } catch (e) { console.error('push fallito:', e.message); }
  }));
  if (dead.length) { subs()[userId] = list.filter(s => !dead.includes(s.endpoint)); await db.flush(); }
}

export const listFor = userId => { const l = inbox()[userId] || []; return { items: l, unread: l.filter(i => !i.read).length }; };

export async function markRead(userId, ids) {
  const l = inbox()[userId] || [];
  l.forEach(i => { if (ids === 'all' || (Array.isArray(ids) && ids.includes(i.id))) i.read = true; });
  await db.flush();
}

export async function subscribe(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Iscrizione non valida');
  const l = (subs()[userId] || []).filter(s => s.endpoint !== sub.endpoint);
  l.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ts: Date.now() });
  subs()[userId] = l; await db.flush();
}
export async function unsubscribe(userId, endpoint) { subs()[userId] = (subs()[userId] || []).filter(s => s.endpoint !== endpoint); await db.flush(); }
export const deviceCount = userId => (subs()[userId] || []).length;

// ---------------------------------------------------------------- promemoria automatici
export const DEFAULT_PREFS = { alerts: true, daysBefore: [0, 1], events: true, eventMinutes: 30 };
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dayDiff = (iso, now) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);

/** Una passata: crea i promemoria dovuti per tutti gli utenti (ognuno una sola volta). */
export async function runReminders(now = new Date()) {
  let n = 0;
  for (const u of db.listUsers()) {
    const prefs = { ...DEFAULT_PREFS, ...(db.getValue(u.id, 'notif_prefs') || {}) };
    const mark = sent()[u.id] = sent()[u.id] || {};
    const once = async (key, msg) => { if (mark[key]) return; mark[key] = Date.now(); await notify(u.id, msg); n++; };
    if (prefs.alerts && now.getHours() >= 8) {
      for (const a of [...(db.getValue(u.id, 'alerts') || []), ...itemsFor(u.id, 'alerts')]) {
        if (!a || a.done || !a.date) continue;
        const d = dayDiff(a.date, now);
        if (d >= 0 && (prefs.daysBefore || []).includes(d)) {
          await once(`a|${a.id}|${a.date}|${d}`, { title: d === 0 ? 'Avviso di oggi' : d === 1 ? 'Avviso di domani' : `Avviso tra ${d} giorni`, body: a.title, page: 'alerts', from: 'avvisi' });
        }
      }
    }
    if (prefs.events) {
      const nowMin = now.getHours() * 60 + now.getMinutes(), days = [0, 1, 2].map(k => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k); return isoOf(d); });
      for (const e of [...(db.getValue(u.id, 'events') || []), ...itemsFor(u.id, 'events')]) {
        if (!e || !e.date || e.remind === 'none') continue;
        const allDay = !!e.allDay, st = allDay ? '08:00' : e.start;
        if (!/^\d{1,2}:\d{2}$/.test(st || '')) continue;
        const [h, m] = st.split(':').map(Number), win = e.remind === '' || e.remind == null ? Number(prefs.eventMinutes || 30) : Number(e.remind);
        for (let k = 0; k < days.length; k++) {
          if (!occursOn(e, days[k])) continue;
          const diff = k * 1440 + h * 60 + m - nowMin;
          if (diff < 0 || diff > win) continue;
          const when = diff <= 1 ? 'adesso' : diff < 60 ? `tra ${diff} minuti` : diff < 1440 ? `tra ${Math.round(diff / 60)} ore` : 'domani';
          await once(`e|${e.id}|${days[k]}|${st}`, { title: `Evento ${when}`, body: `${allDay ? 'Tutto il giorno' : st} · ${e.title || 'Evento'}`, page: 'calendar', from: 'calendario' });
        }
      }
    }
    // pulizia dei segnalini vecchi (oltre 30 giorni)
    for (const k of Object.keys(mark)) if (Date.now() - mark[k] > 30 * 864e5) delete mark[k];
  }
  if (n) await db.flush();
  return n;
}

export function startReminders() {
  setTimeout(() => runReminders().catch(e => console.error('promemoria:', e.message)), 20000);
  setInterval(() => runReminders().catch(e => console.error('promemoria:', e.message)), 60000).unref?.();
}
