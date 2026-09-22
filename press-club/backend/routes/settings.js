const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

/* ---- Owner: site settings (breaking line, edition line, forced notifications) ---- */

router.get('/', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const rows = await db.prepare('SELECT * FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({
    edition_line: s.edition_line || '',
    breaking_enabled: s.breaking_enabled === '1' || s.breaking_enabled === 'true',
    breaking_text: s.breaking_text || '',
    forced_notifications: s.forced_notifications === '1' || s.forced_notifications === 'true',
    one_signal_app_id: s.one_signal_app_id || ''
  });
}));

router.put('/', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const allowed = ['edition_line', 'breaking_enabled', 'breaking_text', 'forced_notifications', 'one_signal_app_id'];
  const body = req.body || {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    let val = body[key];
    if (key === 'breaking_enabled' || key === 'forced_notifications') val = val ? '1' : '0';
    await db.prepare('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(val === undefined || val === null ? '' : val));
  }
  res.json({ ok: true });
}));

/* ---- OneSignal push broadcast (owner triggered) ---- */
router.post('/notify', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const { title, message } = req.body || {};

  // Prefer the App ID stored in settings (so the Owner can change it without a redeploy).
  const stored = await db.prepare('SELECT value FROM settings WHERE key = ?').get('one_signal_app_id');
  const appId = (stored && stored.value) || process.env.ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;

  if (!appId || !restKey) {
    return res.status(400).json({ error: 'OneSignal is not configured. Add ONESIGNAL_REST_KEY to the environment and the App ID in Settings.' });
  }

  try {
    const r = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${restKey}` },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ['Subscribed Users'],
        headings: { en: title || 'The Wire' },
        contents: { en: message || 'New from The Wire.' }
      })
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: 'OneSignal returned an error: ' + (data.errors ? data.errors.join('; ') : JSON.stringify(data)) });
    }
    res.json({ id: data.id });
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach OneSignal.' });
  }
}));

/* ---- Categories (owner managed, exposed publicly via /content) ---- */
router.get('/categories', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM categories ORDER BY name ASC').all());
}));

router.post('/categories', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  const clean = String(name || '').trim();
  if (!clean) return res.status(400).json({ error: 'A category name is required.' });

  const existing = await db.prepare('SELECT id FROM categories WHERE name = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'That category already exists.' });

  const info = await db.prepare('INSERT INTO categories(name) VALUES (?)').run(clean);
  res.status(201).json({ id: info.lastInsertRowid, name: clean });
}));

router.delete('/categories/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const info = await db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Category not found.' });
  res.status(204).end();
}));

module.exports = router;
