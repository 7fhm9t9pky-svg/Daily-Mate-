// Avvia il server e lo riavvia da solo quando un aggiornamento lo richiede (codice di uscita 75).
// Se un aggiornamento ha cambiato le dipendenze (package.json) esegue prima "npm install".
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const dataDir = path.resolve(SERVER_DIR, process.env.DATA_DIR || './data');
const flag = path.join(dataDir, 'needs-install');

function run() {
  if (fs.existsSync(flag)) {
    console.log('Aggiorno le dipendenze del server...');
    spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: SERVER_DIR, stdio: 'inherit', shell: true });
    try { fs.unlinkSync(flag); } catch {}
  }
  const child = spawn(process.execPath, ['src/index.js'], { cwd: SERVER_DIR, stdio: 'inherit', env: { ...process.env, DM_SUPERVISED: '1' } });
  child.on('exit', code => {
    if (code === 75) { console.log('\n--- riavvio per aggiornamento ---\n'); setTimeout(run, 500); }
    else process.exit(code ?? 0);
  });
}
process.on('SIGINT', () => process.exit(0));
run();
