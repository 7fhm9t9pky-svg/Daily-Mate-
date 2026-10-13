import fs from 'fs';
import path from 'path';

/**
 * Carica un file .env minimale (righe KEY=VALORE) in process.env, senza
 * dipendenze esterne. Importato per primo in index.js: in ESM gli import
 * vengono eseguiti prima di qualunque altra istruzione del file, quindi
 * "import './env.js'" messo come prima riga garantisce che le variabili
 * siano già impostate quando db.js/token.js le leggono.
 */
function loadEnv(file = '.env') {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnv();
