import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', '..', 'seed');

export const seedRouter = Router();
seedRouter.use(requireAuth);

/**
 * Dati di partenza del foglio "Lavoro" (pagina Finanze).
 * - il proprietario del server riceve il foglio completo, con i suoi dati
 * - tutti gli altri ricevono lo stesso foglio ma svuotato dei dati personali
 *   (stesse schede, stesse formule, nessun nome/importo di qualcun altro)
 */
seedRouter.get('/lavoro', (req, res) => {
  const wantFull = db.isOwner(req.userId) && fs.existsSync(path.join(SEED_DIR, 'lavoro-data.json'));
  const full = path.join(SEED_DIR, wantFull ? 'lavoro-data.json' : 'lavoro-template.json');
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Dati di partenza non trovati' });
  res.type('application/json').send(fs.readFileSync(full));
});
