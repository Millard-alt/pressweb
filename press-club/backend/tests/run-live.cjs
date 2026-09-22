/* Runs the e2e suite against the LIVE Supabase Postgres (from .env DATABASE_URL).
   Resets the public schema before AND after, so your database is left with only
   the clean seeded demo data. Run: node tests/run-live.cjs */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const BACKEND = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '4171';
const BASE = `http://127.0.0.1:${PORT}`;

let memPool = null;
function resetDb() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) return Promise.resolve();
  if (!memPool) memPool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  return memPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres;')
    .catch((e) => console.error('[run-live] reset failed:', e.message));
}

(async () => {
  console.log('[run-live] resetting schema...');
  await resetDb();

  const server = spawn(process.execPath, [path.join(BACKEND, 'server.js')], {
    cwd: BACKEND,
    env: { ...process.env, PORT, JWT_SECRET: 'test-secret-for-local-run', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'change-me-now', PG_POOL_MAX: '3' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d.toString(); });
  server.stderr.on('data', (d) => { log += d.toString(); });

  function shutdown(code) {
    try { server.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => process.exit(code), 500);
  }

  let up = false;
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(BASE + '/api/content')).ok) { up = true; break; } }
    catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) {
    console.log('[run-live] server never became ready.\n' + log);
    shutdown(1);
    return;
  }
  console.log('[run-live] server ready (Postgres) — ' + log.trim().split('\n').pop());

  const suite = spawn(process.execPath, [path.join(__dirname, 'e2e.mjs')], {
    env: { ...process.env, TEST_BASE: BASE },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  suite.stdout.on('data', (d) => process.stdout.write(d.toString()));
  suite.stderr.on('data', (d) => process.stderr.write(d.toString()));
  suite.on('close', async (code) => {
    console.log('\n[run-live] e2e exit code ' + code);
    console.log('[run-live] resetting schema...');
    try { await resetDb(); console.log('[run-live] schema reset complete.'); } catch (e) { console.error('[run-live] reset error:', e.message); }
    if (memPool) { try { await memPool.end(); } catch (e) {} }
    shutdown(code);
  });
})();
