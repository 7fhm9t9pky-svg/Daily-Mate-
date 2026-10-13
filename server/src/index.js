import './env.js'; // deve restare il primo import: carica .env prima di tutto il resto
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './auth/authRoutes.js';
import { storageRouter } from './storage/storageRoutes.js';
import { seedRouter } from './seed/seedRoutes.js';
import { updateRouter, versionHandler } from './update/updateRoutes.js';
import { startAutoUpdate } from './update/updater.js';
import { apiRoutes } from './apiRoutes.js';
import { startReminders } from './notify/notifyService.js';
import { requireAuth, requireAdmin } from './auth/authMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', authRouter);
app.use('/api/kv', storageRouter);
app.use('/api/seed', seedRouter);
app.get('/api/version', versionHandler);
for (const r of apiRoutes) {
  app[r.method](r.path, r.auth === 'admin' ? requireAdmin : requireAuth, async (req, res) => {
    try {
      const out = await r.handler({ userId: req.userId, params: req.params, body: req.body, query: req.query });
      if (out.raw) return res.status(out.status || 200).type(out.type || 'application/octet-stream').set('Cache-Control', 'private, max-age=86400').send(out.raw);
      res.status(out.status || 200).json(out.json ?? { ok: true });
    } catch (e) { console.error(r.path, e); res.status(500).json({ error: 'Errore del server' }); }
  });
}
app.use('/api/update', updateRouter);

// Il server serve anche il frontend statico: un solo URL, niente CORS da configurare.
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'app');
// maxAge 0 + ETag: il browser controlla sempre se i file sono cambiati, cosi' basta aggiornare la pagina
app.use(express.static(PUBLIC_DIR, { maxAge: 0, etag: true, lastModified: true, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Non trovato' });
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Daily Mate online su http://localhost:${PORT}`); startAutoUpdate(); startReminders(); });
