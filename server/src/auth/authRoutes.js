import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { hashPassword, verifyPassword } from './hash.js';
import { signToken } from './token.js';
import { requireAuth } from './authMiddleware.js';

export const authRouter = Router();

/** I dati dell'utente mandati al browser (incluso se e' amministratore e l'interfaccia decisa dall'admin). */
const pub = u => ({ id: u.id, username: u.username, displayName: u.displayName, isAdmin: db.isAdmin(u.id), isOwner: db.isOwner(u.id), role: db.role(u.id), ui: db.getUi(u.id) });

authRouter.post('/signup', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username di almeno 3 caratteri' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password di almeno 6 caratteri' });
  }
  if (db.findUserByUsername(username)) {
    return res.status(409).json({ error: 'Username già in uso' });
  }
  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    displayName: (displayName || username).trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  await db.createUser(user);
  const token = signToken({ sub: user.id });
  res.json({ token, user: pub(user) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findUserByUsername(username || '');
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  const token = signToken({ sub: user.id });
  res.json({ token, user: pub(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ user: pub(user) });
});
