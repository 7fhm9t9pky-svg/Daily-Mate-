import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import * as updater from './updater.js';

export const updateRouter = Router();

/** Numero di versione: la pagina lo controlla ogni minuto e propone di aggiornarsi quando cambia. */
export const versionHandler = (req, res) => res.set('Cache-Control', 'no-store').json({ version: updater.version() });

updateRouter.use(requireAuth);
const owner = (req, res, next) => db.isOwner(req.userId) ? next() : res.status(403).json({ error: 'Solo il proprietario del server puo\' cambiare gli aggiornamenti' });

updateRouter.get('/status', (req, res) => res.json({ ...updater.status(), canEdit: db.isOwner(req.userId) }));
updateRouter.put('/config', owner, async (req, res) => {
  try { res.json({ ...(await updater.setRepo(req.body?.repo, req.body?.branch)), canEdit: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
updateRouter.post('/now', owner, async (req, res) => res.json({ ...(await updater.check()), canEdit: true }));
