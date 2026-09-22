const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor','assignment_manager','owner')) DEFAULT 'editor',
  portrait_photo_url TEXT,
  portrait_status TEXT DEFAULT 'none' CHECK(portrait_status IN ('none','pending','approved','rejected')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement TEXT NOT NULL DEFAULT 'feed',      -- week_article | week_event | week_picture | feed
  status TEXT NOT NULL DEFAULT 'published',    -- pending | published | rejected
  kind TEXT NOT NULL DEFAULT 'article',        -- article | photo | event
  kicker TEXT,
  tag TEXT,
  fallback_tag TEXT,                           -- secondary category when a week item is cycled out
  title TEXT NOT NULL,
  author TEXT,
  portrait_url TEXT,                           -- snapshot of the submitter's portrait for the byline chip
  time TEXT,
  dek TEXT,
  cap TEXT,
  body TEXT,                                   -- JSON array of paragraph strings
  photo_url TEXT,
  submitted_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(submitted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS team(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  body TEXT,        -- JSON array of paragraph strings
  photo_url TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calendar(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  mon TEXT NOT NULL,
  title TEXT NOT NULL,
  time TEXT,
  tag TEXT,
  sort_order INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
`);

/* ---- minimal migrations for databases created before these columns existed ---- */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('users', 'portrait_photo_url', 'portrait_photo_url TEXT');
ensureColumn('users', 'portrait_status', "portrait_status TEXT DEFAULT 'none'");
ensureColumn('articles', 'fallback_tag', 'fallback_tag TEXT');
ensureColumn('articles', 'portrait_url', 'portrait_url TEXT');
ensureColumn('calendar', 'notes', 'notes TEXT');

/* ---- one-time seed, only runs against a fresh/empty database ---- */
const DEFAULT_CATEGORIES = ['Campus News', 'Sports & Scores', 'Opinion & Culture', 'Photo Essays', 'Music & Arts', 'Science & Tech', 'Community', 'Editorials'];

function seedIfEmpty() {
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO categories(name) VALUES (?)');
    DEFAULT_CATEGORIES.forEach((c) => ins.run(c));
  }

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const ownerName = process.env.OWNER_NAME || 'Owner';
    const ownerUser = process.env.OWNER_USERNAME || 'owner';
    const ownerPass = process.env.OWNER_PASSWORD || 'change-me-now';
    const hash = bcrypt.hashSync(ownerPass, 10);
    db.prepare('INSERT INTO users(name, username, password_hash, role) VALUES (?,?,?,?)')
      .run(ownerName, ownerUser, hash, 'owner');
    console.log(`Seeded Owner account "${ownerUser}" — change OWNER_PASSWORD in .env before going live.`);
  }

  const articleCount = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
  if (articleCount === 0) {
    const insert = db.prepare(`INSERT INTO articles
      (placement, status, kind, kicker, tag, title, author, time, dek, cap, body, photo_url)
      VALUES (@placement,@status,@kind,@kicker,@tag,@title,@author,@time,@dek,@cap,@body,@photo_url)`);

    insert.run({
      placement: 'week_article', status: 'published', kind: 'article',
      kicker: 'Article of the Week', tag: 'Opinion & Culture',
      title: "Behind the Curtain: Drama Club's Sprint to Opening Night",
      author: 'Amara K.', time: '6 min read',
      dek: 'Three weeks out, rehearsals run six days a week — and the exhaustion shows in the best way possible.',
      cap: null, photo_url: null,
      body: JSON.stringify([
        "With three weeks until opening night, the drama club is rehearsing six days a week, and the exhaustion shows in the best way possible.",
        "Director Mr. Otieno says this year's production is the most ambitious the club has attempted, with a rotating set built entirely by student volunteers.",
        "Lead actor Grace Muthoni describes the process as equal parts terrifying and thrilling: you forget your own name is Grace by week two."
      ])
    });
    insert.run({
      placement: 'week_event', status: 'published', kind: 'article',
      kicker: 'Event of the Week', tag: 'Sports & Scores',
      title: 'Robotics Team Heads to Regionals This Saturday',
      author: 'Club Desk', time: '3 min read',
      dek: "After months of after-school builds, the van leaves Friday night for Saturday's qualifier.",
      cap: null, photo_url: null,
      body: JSON.stringify([
        "After months of after-school builds, the robotics team loads up the van Friday night for Saturday's regional qualifier.",
        "Team captain Denis Wanjiru says their new arm mechanism finally works — most of the time.",
        "A win Saturday would be the program's first regional qualification in four years."
      ])
    });
    insert.run({
      placement: 'week_picture', status: 'published', kind: 'photo',
      kicker: 'Picture of the Week', tag: 'Photo Essays',
      title: 'Sunset Over the Field, Match Point',
      author: 'Photo: Lilian W.', time: '',
      dek: null, cap: "Volleyball vs. Kericho High, final set — taken in the last minutes of Thursday's match.",
      photo_url: null,
      body: JSON.stringify(["Taken in the final minutes of Thursday's volleyball match, right as the last serve of the set crossed the net."])
    });

    const feedSeed = [
      { title: "Cafeteria Menu Overhaul: What's Actually Changing", author: 'Amara K.', time: '5 min read', tag: 'Campus News', body: ["Starting next month, the cafeteria is dropping three long-standing menu items in favor of a rotating chef's-pick system.", "Feedback from a student survey last spring cited repetition as the top complaint."] },
      { title: "Girls' Football Opens Season 3–0", author: 'Brian O.', time: '3 min read', tag: 'Sports & Scores', body: ["The team's new pressing style has caught opponents off guard in all three opening matches.", "Coach Achieng credits preseason conditioning for the fast start."] },
      { title: 'Opinion: We Need a Real Study Hall Space', author: 'Denis W.', time: '4 min read', tag: 'Opinion & Culture', body: ["The library closes at 3:15, right when most students actually need quiet space to work.", "A dedicated study hall — even a repurposed classroom — would solve a problem nobody seems to be addressing."] },
      { title: 'Photo Essay: A Day Backstage', author: 'Lilian W.', time: '2 min read', tag: 'Photo Essays', body: ["Six hours, one dress rehearsal, and a lot of safety pins."], cap: "Backstage during Tuesday's dress rehearsal." },
      { title: 'Debate Team Advances to Regionals', author: 'Amara K.', time: '3 min read', tag: 'Campus News', body: ['A come-from-behind win in the final round sends the varsity pair to regionals for the first time in three years.'] },
      { title: 'Opinion: The New Bell Schedule, One Month In', author: 'Brian O.', time: '5 min read', tag: 'Opinion & Culture', body: ['Shorter passing periods sounded minor in August. In practice, hallway traffic has gotten worse, not better.'] }
    ];
    feedSeed.forEach(f => insert.run({
      placement: 'feed', status: 'published', kind: 'article',
      kicker: null, tag: f.tag, title: f.title, author: f.author, time: f.time,
      dek: null, cap: f.cap || null, photo_url: null, body: JSON.stringify(f.body)
    }));
  }

  const teamCount = db.prepare('SELECT COUNT(*) AS n FROM team').get().n;
  if (teamCount === 0) {
    const insert = db.prepare('INSERT INTO team(name, role, body, photo_url, sort_order) VALUES (?,?,?,?,?)');
    [
      { name: 'Amara Kones', role: 'Editor-in-Chief', body: ['Amara has led the paper for two years and covers campus policy.'] },
      { name: 'Brian Otieno', role: 'Sports Editor', body: ['Brian covers every home game and most away ones, rain or shine.'] },
      { name: 'Lilian Wambui', role: 'Lead Photographer', body: ['Lilian shot every photo essay published this year.'] },
      { name: 'Denis Wanjiru', role: 'Opinion Editor', body: ['Denis runs the opinion desk and the robotics team, somehow.'] }
    ].forEach((t, i) => insert.run(t.name, t.role, JSON.stringify(t.body), null, i));
  }

  const calCount = db.prepare('SELECT COUNT(*) AS n FROM calendar').get().n;
  if (calCount === 0) {
    const insert = db.prepare('INSERT INTO calendar(date, mon, title, time, tag, sort_order) VALUES (?,?,?,?,?,?)');
    [
      { date: '24', mon: 'SEP', title: 'Robotics Regionals', time: '8:00 AM · Away', tag: 'SPORTS' },
      { date: '27', mon: 'SEP', title: 'Fall Play — Opening Night', time: '7:00 PM · Auditorium', tag: 'CULTURE' },
      { date: '02', mon: 'OCT', title: "Girls' Football vs. Nakuru High", time: '4:00 PM · Home field', tag: 'SPORTS' },
      { date: '05', mon: 'OCT', title: 'Student Council Elections', time: 'All day · Main hall', tag: 'NEWS' }
    ].forEach((c, i) => insert.run(c.date, c.mon, c.title, c.time, c.tag, i));
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n;
  if (settingsCount === 0) {
    const insert = db.prepare('INSERT INTO settings(key, value) VALUES (?,?)');
    insert.run('edition_line', 'VOL. 1 · NO. 14');
    insert.run('breaking_enabled', '1');
    insert.run('breaking_text', "Robotics team confirmed for Saturday's regional qualifier — first bid in four years.");
  }
}

seedIfEmpty();

module.exports = { db, CATEGORIES: DEFAULT_CATEGORIES, DEFAULT_CATEGORIES };
