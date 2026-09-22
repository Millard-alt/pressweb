const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, requireOwner, requireEditor } = require('../middleware/auth');

const router = express.Router();

/* Owner-only management for staff accounts. */
router.use(requireAuth, requireOwner);

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT id, name, username, role, portrait_status, portrait_photo_url FROM users
     WHERE role != 'owner' ORDER BY name ASC`
  ).all();
  res.json(rows.map((u) => ({
    id: u.id, name: u.name, username: u.username, role: u.role,
    portrait_status: u.portrait_status || 'none', portrait_url: u.portrait_photo_url || ''
  })));
});

router.post('/', (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username and password are all required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'That username is already taken.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,\'editor\')')
    .run(name.trim(), username.trim(), hash);
  res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), username: username.trim(), role: 'editor' });
});

/* Toggle the Assignment Manager role on/off for an editor. */
router.patch('/:id/role', (req, res) => {
  const { role } = req.body || {};
  if (!['editor', 'assignment_manager'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "editor" or "assignment_manager".' });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND role != 'owner'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Editor account not found.' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ id: user.id, role });
});

/* Owner approves or rejects an editor's self-portrait. */
router.patch('/:id/portrait', (req, res) => {
  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "reject".' });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND role != 'owner'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Editor account not found.' });
  const portrait_status = action === 'approve' ? 'approved' : 'rejected';
  db.prepare('UPDATE users SET portrait_status = ? WHERE id = ?').run(portrait_status, req.params.id);
  res.json({ id: user.id, portrait_status });
});

router.delete('/:id', (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND role != 'owner'`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Editor account not found.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
