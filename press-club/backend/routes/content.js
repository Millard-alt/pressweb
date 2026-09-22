const express = require('express');
const { db, DEFAULT_CATEGORIES } = require('../db');

const router = express.Router();

function rowToArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    kicker: row.kicker || undefined,
    tag: row.tag || '',
    placement: row.placement || 'feed',
    title: row.title,
    author: row.author || '',
    portrait_url: row.portrait_url || '',
    time: row.time || '',
    dek: row.dek || undefined,
    cap: row.cap || undefined,
    body: row.body ? JSON.parse(row.body) : [],
    photo_url: row.photo_url || ''
  };
}

router.get('/', (req, res) => {
  const latestByPlacement = (placement) =>
    db.prepare(`SELECT * FROM articles WHERE placement = ? AND status = 'published' ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get(placement);

  const week = {
    article: rowToArticle(latestByPlacement('week_article')),
    event: rowToArticle(latestByPlacement('week_event')),
    picture: rowToArticle(latestByPlacement('week_picture'))
  };

  const feedRows = db.prepare(`SELECT * FROM articles WHERE placement = 'feed' AND status = 'published' ORDER BY created_at DESC, id DESC`).all();
  const feed = feedRows.map(rowToArticle);

  /* Masthead: editors with approved self-portraits first; fall back to the
     legacy `team` seed when no portraits have been approved yet (demo data). */
  const portraitMast = db.prepare(
    `SELECT name, portrait_photo_url, role FROM users
     WHERE role != 'owner' AND portrait_status = 'approved' ORDER BY name ASC`
  ).all();
  const teamFallback = db.prepare('SELECT * FROM team ORDER BY sort_order ASC, id ASC').all();
  let team;
  if (portraitMast.length) {
    team = portraitMast.map((t) => ({
      name: t.name, role: t.role === 'assignment_manager' ? 'Assignment Manager' : 'Editor',
      body: [], photo_url: t.portrait_photo_url || ''
    }));
  } else {
    team = teamFallback.map((t) => ({
      name: t.name, role: t.role || '', body: t.body ? JSON.parse(t.body) : [], photo_url: t.photo_url || ''
    }));
  }

  const calendarRows = db.prepare('SELECT * FROM calendar ORDER BY sort_order ASC, id ASC').all();
  const calendar = calendarRows.map((c) => ({
    id: c.id, date: c.date, mon: c.mon, title: c.title, time: c.time || '', tag: c.tag || '', notes: c.notes || ''
  }));

  const settingsRows = db.prepare('SELECT * FROM settings').all();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  const catRows = db.prepare('SELECT name FROM categories ORDER BY name ASC').all();
  const cats = catRows.length ? catRows.map((c) => c.name) : DEFAULT_CATEGORIES;

  res.json({
    breaking: settings.breaking_enabled === '1' || settings.breaking_enabled === 'true',
    breakingText: settings.breaking_text || '',
    editionLine: settings.edition_line || '',
    onesignalAppId: settings.one_signal_app_id || '',
    week,
    feed,
    team,
    calendar,
    tabs: ['All', ...cats]
  });
});

module.exports = router;
