import { verifyToken } from './token.js';
import { db } from '../db.js';

/** Protegge una rotta: richiede 'Authorization: Bearer <token>' valido, espone req.userId. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Non autenticato' });
  req.userId = payload.sub;
  next();
}

/** Come requireAuth, ma solo per l'amministratore. */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => db.isAdmin(req.userId) ? next() : res.status(403).json({ error: 'Solo per l\'amministratore' }));
}
