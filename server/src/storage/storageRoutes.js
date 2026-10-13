import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';

/**
 * Stesso contratto get/set/remove dello StorageAdapter del frontend, ma
 * esposto via HTTP e isolato per utente (req.userId, impostato da requireAuth).
 * Così ogni amico ha i propri dati senza che Repository/SettingsManager
 * debbano saperne nulla.
 */
export const storageRouter = Router();
storageRouter.use(requireAuth);

// Backup completo dei dati dell'utente (tutte le chiavi) e ripristino.
storageRouter.get('/', (req, res) => res.json({ app: 'daily-mate', version: 1, data: db.getAll(req.userId) }));
storageRouter.put('/', async (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Backup non valido' });
  await db.setAll(req.userId, data);
  res.json({ ok: true });
});

storageRouter.get('/:key', (req, res) => {
  res.json({ key: req.params.key, value: db.getValue(req.userId, req.params.key) });
});

storageRouter.put('/:key', async (req, res) => {
  await db.setValue(req.userId, req.params.key, req.body?.value ?? null);
  res.json({ ok: true });
});

storageRouter.delete('/:key', async (req, res) => {
  await db.removeValue(req.userId, req.params.key);
  res.json({ ok: true });
});
