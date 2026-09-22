const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOwner, requireApprovedPortrait } = require('../middleware/auth');

const router = express.Router();

const WEEK_PLACEMENTS = ['week_article', 'week_event', 'week_picture'];
const KICKERS = { week_article: 'Article of the Week', week_event: 'Event of the Week', week_picture: 'Picture of the Week' };

/* Editor: my own recent submissions, any status */
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, kind, title, tag, placement, status, created_at FROM articles
     WHERE submitted_by = ? ORDER BY created_at DESC, id DESC LIMIT 20`
  ).all(req.user.id);
  res.json(rows);
});

/* Editor: submit new work for review.
   Editors must have an approved self-portrait before they can submit. */
router.post('/', requireAuth, requireApprovedPortrait, (req, res) => {
  const { kind, title, tag, fallback_tag, body, photo_url, placement } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'A title is required.' });
  }
  const place = WEEK_PLACEMENTS.includes(placement) ? placement : 'feed';
  if (!tag || !String(tag).trim()) {
    return res.status(400).json({ error: 'Pick a category.' });
  }
  // A featured "of the week" piece must name a secondary category to drop into when rotated out.
  if (place !== 'feed' && !fallback_tag) {
    return res.status(400).json({ error: 'For an Article/Picture/Event of the Week, also pick the category it moves to when it leaves the slot.' });
  }

  const safeKind = kind === 'photo' ? 'photo' : (kind === 'event' ? 'event' : 'article');
  const info = db.prepare(`
    INSERT INTO articles (placement, status, kind, kicker, tag, fallback_tag, title, author, portrait_url, time, body, photo_url, submitted_by)
    VALUES (@placement, 'pending', @kind, @kicker, @tag, @fallback_tag, @title, @author, @portrait_url, '', @body, @photo_url, @submitted_by)
  `).run({
    placement: place,
    kind: safeKind,
    kicker: place === 'feed' ? null : KICKERS[place],
    tag: String(tag).trim(),
    fallback_tag: (place === 'feed' ? null : (String(fallback_tag).trim() || null)),
    title: title.trim(),
    author: req.user.name,
    portrait_url: req.user.portrait_photo_url || null,
    body: JSON.stringify(Array.isArray(body) ? body : (body ? [body] : [])),
    photo_url: photo_url || null,
    submitted_by: req.user.id
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

/* Owner: everything waiting on review (articles + portraits). */
router.get('/', requireAuth, requireOwner, (req, res) => {
  const articles = db.prepare(`
    SELECT a.id, a.kind, a.title, a.tag, a.placement, a.status, a.created_at, u.name AS submitted_by_name
    FROM articles a LEFT JOIN users u ON u.id = a.submitted_by
    WHERE a.status = 'pending'
    ORDER BY a.created_at ASC, a.id ASC
  `).all();

  const portraits = db.prepare(
    `SELECT id, name, username, portrait_photo_url FROM users
     WHERE portrait_status = 'pending' ORDER BY created_at ASC, id ASC`
  ).all();

  res.json({ articles, portraits });
});

/* Owner only: approve or reject a submission. Approving a week item rotates the old one out. */
router.patch('/:id', requireAuth, requireOwner, (req, res) => {
  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "reject".' });
  }
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Submission not found.' });

  if (action === 'approve') {
    // If it claims a week slot, demote the current occupant of that slot into the feed.
    if (WEEK_PLACEMENTS.includes(article.placement)) {
      db.prepare(`UPDATE articles SET placement='feed', kicker=NULL, tag=COALESCE(fallback_tag, tag), fallback_tag=NULL
                  WHERE placement = ? AND id != ? AND status='published'`).run(article.placement, article.id);
    }
    db.prepare('UPDATE articles SET status = ? WHERE id = ?').run('published', req.params.id);
  } else {
    db.prepare('UPDATE articles SET status = ? WHERE id = ?').run('rejected', req.params.id);
  }
  res.json({ id: Number(req.params.id), status: action === 'approve' ? 'published' : 'rejected' });
});

/* Owner only: manually cycle a featured piece out of its week slot into the feed. */
router.post('/cycle-out/:id', requireAuth, requireOwner, (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Submission not found.' });
  if (!WEEK_PLACEMENTS.includes(article.placement)) {
    return res.status(400).json({ error: 'Only featured week items can be cycled out.' });
  }
  db.prepare(`UPDATE articles SET placement='feed', kicker=NULL, tag=COALESCE(fallback_tag, tag), fallback_tag=NULL WHERE id = ?`)
    .run(article.id);
  res.json({ id: article.id, placement: 'feed' });
});

module.exports = router;
