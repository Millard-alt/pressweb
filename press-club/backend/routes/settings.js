const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

/* ---- Owner: site settings (breaking line, edition line, OneSignal config) ---- */

router.get('/', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({
    edition_line: s.edition_line || '',
    breaking_enabled: s.breaking_enabled === '1' || s.breaking_enabled === 'true',
    breaking_text: s.breaking_text || '',
    one_signal_app_id: s.one_signal_app_id || ''
  });
});

router.put('/', requireAuth, requireOwner, (req, res) => {
  const allowed = ['edition_line', 'breaking_enabled', 'breaking_text', 'one_signal_app_id'];
  const body = req.body || {};
  const set = db.prepare('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  ALL: for (const key of allowed) {
    if (!(key in body)) continue;
    let val = body[key];
    if (key === 'breaking_enabled') val = val ? '1' : '0';
    set.run(key, String(val ?? ''));
  }
  res.json({ ok: true });
});

/* ---- OneSignal push broadcast (owner triggered) ---- */
router.post('/notify', requireAuth, requireOwner, async (req, res) => {
  const { title, message } = req.body || {};
  const appId = process.env.ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;
  if (!appId || !restKey) {
    return res.status(400).json({ error: 'OneSignal is not configured. Add ONESIGNAL_APP_ID and ONESIGNAL_REST_KEY to .env' });
  }
  try {
    const r = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restKey}` },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ['Subscribed Users'],
        headings: { en: title || 'The Wire' },
        contents: { en: message || 'New from The Wire.' }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'OneSignal returned an error: ' + (data.errors ? data.errors.join('; ') : 'unknown') });
    res.json({ id: data.id });
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach OneSignal.' });
  }
});

/* ---- Categories (owner managed, exposed publicly via /content) ---- */
router.get('/categories', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json(rows);
});

router.post('/categories', requireAuth, requireOwner, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'A category name is required.' });
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(String(name).trim());
  if (existing) return res.status(409).json({ error: 'That category already exists.' });
  const info = db.prepare('INSERT INTO categories(name) VALUES (?)').run(String(name).trim());
  res.status(201).json({ id: info.lastInsertRowid, name: String(name).trim() });
});

router.delete('/categories/:id', requireAuth, requireOwner, (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Category not found.' });
  res.status(204).end();
});

module.exports = router;