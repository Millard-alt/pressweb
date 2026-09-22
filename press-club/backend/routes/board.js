const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAssignmentManager } = require('../middleware/auth');

const router = express.Router();

/* Ordinary editors can view the board (public content read is fine), but only
   the Owner / an Assignment Manager can add, edit or remove items. */
const MUTATION = [requireAuth, requireAssignmentManager];

router.get('/manage', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM calendar ORDER BY sort_order ASC, id ASC').all();
  res.json(rows.map((c) => ({
    id: c.id, date: c.date, mon: c.mon, title: c.title, time: c.time || '',
    tag: c.tag || '', notes: c.notes || '', sort_order: c.sort_order
  })));
});

router.post('/', MUTATION, (req, res) => {
  const { date, mon, title, time, tag, notes } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'A title is required.' });
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM calendar').get().m || 0;
  const info = db.prepare(
    'INSERT INTO calendar (date, mon, title, time, tag, notes, sort_order) VALUES (?,?,?,?,?,?,?)'
  ).run(
    String(date ?? '').trim() || '-', String(mon ?? '').trim() || '···',
    String(title).trim(), (time || '').trim(), (tag || '').trim(), (notes || '').trim(), max + 1
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', MUTATION, (req, res) => {
  const item = db.prepare('SELECT * FROM calendar WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Board item not found.' });
  const { date, mon, title, time, tag, notes } = req.body || {};
  db.prepare('UPDATE calendar SET date=?, mon=?, title=?, time=?, tag=?, notes=? WHERE id=?').run(
    String(date ?? item.date).trim(), String(mon ?? item.mon).trim(),
    String(title ?? item.title).trim(), (time ?? (item.time || '')).trim(),
    (tag ?? (item.tag || '')).trim(), (notes ?? (item.notes || '')).trim(), item.id
  );
  res.json({ id: Number(req.params.id) });
});

router.delete('/:id', MUTATION, (req, res) => {
  const info = db.prepare('DELETE FROM calendar WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Board item not found.' });
  res.status(204).end();
});

module.exports = router;