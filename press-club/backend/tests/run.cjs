/* Boots the app against a scratch SQLite database, runs the end-to-end suite,
   then shuts the server down. Usage: node tests/run.cjs
   Keeps its own .env (tests/runenv/.env) so your real Supabase setup is ignored. */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKEND = path.join(__dirname, '..');
const RUNENV = path.join(__dirname, 'runenv');
const PORT = process.env.TEST_PORT || '4123';
const BASE = `http://127.0.0.1:${PORT}`;

const DB_FILES = ['data.db', 'data.db-shm', 'data.db-wal'];
for (const f of DB_FILES) {
  try { fs.unlinkSync(path.join(BACKEND, f)); } catch (e) { /* not there */ }
}
console.log('[run] fresh SQLite database');

const server = spawn(process.execPath, [path.join(BACKEND, 'server.js')], {
  cwd: RUNENV,
  env: { ...process.env, DATABASE_URL: '', PORT },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

function shutdown(code) {
  try { server.kill(); } catch (e) { /* already gone */ }
  process.exit(code);
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(BASE + '/api/content');
      if (r.ok) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const up = await waitForServer();
  if (!up) {
    console.log('[run] server never became ready. Log:\n' + serverLog);
    shutdown(1);
    return;
  }
  console.log('[run] server ready — ' + serverLog.trim().split('\n').pop());

  const suite = spawn(process.execPath, [path.join(__dirname, 'e2e.mjs')], {
    env: { ...process.env, TEST_BASE: BASE, DATABASE_URL: '', OWNER_PASSWORD: 'change-me-now' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  suite.stdout.on('data', (d) => process.stdout.write(d.toString()));
  suite.stderr.on('data', (d) => process.stderr.write(d.toString()));
  suite.on('close', (code) => {
    if (code !== 0) {
      console.log('\n[run] server log:\n' + serverLog);
      if (fs.existsSync(path.join(BACKEND, 'srv.err'))) {
        const e = fs.readFileSync(path.join(BACKEND, 'srv.err'), 'utf8').trim();
        if (e) console.log('\n[run] server stderr:\n' + e);
      }
    }
    shutdown(code);
  });
})();
