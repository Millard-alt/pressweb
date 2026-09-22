const express = require('express');
const { db, DEFAULT_CATEGORIES } = require('../db');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

/* `body` is TEXT on both backends, but tolerate an already-parsed array too so a
   future JSONB column can never break rendering. */
function toParagraphs(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch (e) { return []; }
}

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
    body: toParagraphs(row.body),
    photo_url: row.photo_url || ''
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const latestByPlacement = (placement) =>
    db.prepare(`SELECT * FROM articles WHERE placement = ? AND status = 'published' ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get(placement);

  const week = {
    article: rowToArticle(await latestByPlacement('week_article')),
    event: rowToArticle(await latestByPlacement('week_event')),
    picture: rowToArticle(await latestByPlacement('week_picture'))
  };

  const feedRows = await db.prepare(`SELECT * FROM articles WHERE placement = 'feed' AND status = 'published' ORDER BY created_at DESC, id DESC`).all();
  const feed = feedRows.map(rowToArticle);

  /* Masthead: editors with approved self-portraits first; fall back to the
     legacy `team` seed when no portraits have been approved yet (demo data). */
  const portraitMast = await db.prepare(
    `SELECT name, portrait_photo_url, role FROM users
     WHERE role != 'owner' AND portrait_status = 'approved' ORDER BY name ASC`
  ).all();
  const teamFallback = await db.prepare('SELECT * FROM team ORDER BY sort_order ASC, id ASC').all();
  let team;
  if (portraitMast.length) {
    team = portraitMast.map((t) => ({
      name: t.name, role: t.role === 'assignment_manager' ? 'Assignment Manager' : 'Editor',
      body: [], photo_url: t.portrait_photo_url || ''
    }));
  } else {
    team = teamFallback.map((t) => ({
      name: t.name, role: t.role || '', body: toParagraphs(t.body), photo_url: t.photo_url || ''
    }));
  }

  const calendarRows = await db.prepare('SELECT * FROM calendar ORDER BY sort_order ASC, id ASC').all();
  const calendar = calendarRows.map((c) => ({
    id: c.id, date: c.date, mon: c.mon, title: c.title, time: c.time || '', tag: c.tag || '', notes: c.notes || ''
  }));

  const settingsRows = await db.prepare('SELECT * FROM settings').all();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  const catRows = await db.prepare('SELECT name FROM categories ORDER BY name ASC').all();
  const cats = catRows.length ? catRows.map((c) => c.name) : DEFAULT_CATEGORIES;

  res.json({
    breaking: settings.breaking_enabled === '1' || settings.breaking_enabled === 'true',
    breakingText: settings.breaking_text || '',
    editionLine: settings.edition_line || '',
    forcedNotifications: settings.forced_notifications === '1' || settings.forced_notifications === 'true',
    onesignalAppId: settings.one_signal_app_id || '',
    week,
    feed,
    team,
    calendar,
    tabs: ['All', ...cats]
  });
}));

module.exports = router;
