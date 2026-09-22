# The Wire — Nakuru Press Club

A student-newspaper site with a real backend behind it: articles, the weekly
picks, the masthead, the assignment board, editor submissions, self-portrait
onboarding, and Owner approval all live in a database.

One server (in `backend/`) serves both the API **and** the frontend, so you
run a single process on a single port.

```
press-club/
├── backend/            Node/Express API + database + serves the frontend
│   ├── server.js
│   ├── db.js           schema + one-time seed (SQLite by default)
│   ├── routes/         auth, content, queue, editors, upload, board, settings
│   ├── middleware/     auth (Owner / Assignment Manager / portrait gate)
│   ├── uploads/        photos land here at runtime (local fallback)
│   └── .env.example
├── frontend/index.html the whole site — ragged-newsprint theme + admin panel
├── supabase-schema.sql Postgres schema if you move storage to Supabase
├── Dockerfile          container for Render
├── render.yaml         Render Blueprint config
└── README.md           you are here
```

---

## What the site does

- **Ragged old-newspaper look** — every story is a torn-newsprint clipping (no
  more clean "cards").
- **Editors submit** Articles / Photos / Events and choose where they go
  (Article / Picture / Event of the Week, or Latest Coverage). A featured week
  item must also name a **secondary category** it drops into when it's rotated
  out of the slot.
- **Self-portrait onboarding** — the Owner creates accounts (with passwords);
  on first login every editor must upload a self-portrait that the Owner must
  **approve** before the editor can publish anything. Approved portraits show
  in the masthead and as a small byline chip on the story.
- **Owner approves everything** — no story or portrait goes public without an
  explicit approve. Approving a new week item automatically rotates the old one
  into the feed; the Owner can also "cycle out" a featured piece manually.
- **Assignment Board** — managed by a distinct **Assignment Manager** role you
  can grant to specific editors (they can still write too). Dates, times, tags
  and notes.
- **Editable Breaking line** — the Owner can show/hide and rewrite the breaking
  banner and the edition line from **Settings**.
- **Categories** — managed by the Owner in Settings.
- **Push alerts** — the 🔔 buttons use **OneSignal** web push.

### Roles
| Role               | Submit | Review/approve | Assignment Board | Manage editors/settings |
|--------------------|:--:|:--:|:--:|:--:|
| Owner              | –  | ✔  | ✔  | ✔  |
| Assignment Manager | ✔  | –  | ✔  | –  |
| Editor             | ✔  | –  | read-only | –  |
*(Editors of any kind must have an approved self-portrait before submitting.)*

---

## 1. Run it locally (no accounts needed yet)

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd press-club/backend
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux
```

Open `.env` and set at least:

- `JWT_SECRET` — a long random string
- `OWNER_USERNAME` / `OWNER_PASSWORD` — **change the password now**

Then start:

```bash
npm start
```

Open **http://localhost:4000**. That one URL is the whole site: the frontend,
the API (`/api/...`), and uploaded photos (`/uploads/...`).

> **First-run database** — the app uses a local SQLite file (`backend/data.db`)
> and seeds it with demo articles, categories, calendar and an Owner account.
> Perfect for local work. For hosting that survives redeploys, follow
> **Step 2 → Supabase**.

---

## 2. Set up the free services you'll deploy with

### 2.1 Cloudinary — photos
1. Sign up at https://cloudinary.com
2. Copy the **Cloud name**, **API Key**, **API Secret**.
3. Set them in `.env` (and later in Render):

```env
CLOUDINARY_CLOUD_NAME=r6vfl444
CLOUDINARY_API_KEY=757442958582232
CLOUDINARY_API_SECRET=tlgQOzPVBQufclB6en-kF9oXW0g
```

Once set, article photos and editor self-portraits upload straight to
Cloudinary's CDN. (Without them the app still runs and saves uploads locally.)

### 2.2 OneSignal — push alerts
1. Sign up at https://onesignal.com, create a **Web** app.
2. Copy the **App ID** and **REST API Key**, set them in `.env`:

```env
ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONESIGNAL_REST_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Also paste the **App ID** into the site (Owner → Settings → Push alerts → Save)
so the 🔔 subscribe prompt works. You can send a test alert from there too.

### 2.3 Supabase — database (recommended for hosting)
Render's **free** tier wipes its disk on every redeploy, so the built-in SQLite
file would lose content. A free Supabase Postgres database fixes that.
(If you use a Render Starter/paid disk with SQLite, you can skip this.)

1. Sign up at https://supabase.com, create a project.
2. **SQL Editor → New query** → paste all of `supabase-schema.sql` → Run.
3. Project → **Settings → Database → Connection string** → copy the
   **Postgres** string.
4. `.env`:

```env
DATABASE_URL=postgresql://postgres:Thiongo@12@db.iguzwwqjufzzdblkqroj.supabase.co:5432/postgres
```
<!-- README_PART_TWO -->

---

## 3. Deploy to Render (free)

1. Push this folder to a GitHub/GitLab repo.
2. Render: **New → Blueprint**, pick the repo. It reads `render.yaml`
   (Docker build) and deploys.
3. Render creates the service and **generates a JWT_SECRET** for you.
4. Open the service → **Environment / Values**, set:
   - `OWNER_USERNAME`, `OWNER_PASSWORD` — the web Owner account
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_KEY`
   - `DATABASE_URL` (Supabase)
   (leave blank any you're not using yet)
5. Your site is live at `https://your-service.onrender.com`. Log in as Owner →
   **Settings** to change the breaking line, add categories, and paste the
   OneSignal App ID.

> **First deploy:** the Owner account is created on first boot only when the
> users table is empty. If you already ran locally, delete `backend/data.db`
> (local) or clear the `users` table (Supabase) once, then use the secrets on a
> fresh database.

---

## 4. Daily workflow

- **Owner → Review Queue** approves/rejects stories **and** self-portraits.
  Approving a week item auto-rotates the previous one into the feed.
- **Owner → Manage Editors** creates accounts, sets passwords, toggles the
  **Assignment Manager** role.
- **Assignment Manager / Owner → Assignment Board** manages deadlines & events
  (date, time, tag, notes).
- **Owner → Settings** edits the breaking line & edition line, manages
  categories, sets the OneSignal App ID, sends test alerts.

---

## API routes

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| POST | `/api/auth/login` | public | log in |
| GET/PUT | `/api/auth/me`, `/api/auth/me/portrait` | logged in | profile / set portrait |
| GET | `/api/content` | public | everything the site renders |
| GET | `/api/queue/mine` | editor | my submissions |
| POST | `/api/queue` | editor\* | submit (placement + fallback category) |
| GET/PATCH | `/api/queue`, `/api/queue/:id` | owner | review / approve-reject |
| POST | `/api/queue/cycle-out/:id` | owner | move a week item to the feed |
| GET/POST/PATCH/DELETE | `/api/editors`… | owner | accounts, roles, portraits |
| POST | `/api/upload` | editor/owner | image → Cloudinary (or local) |
| GET/POST/PATCH/DELETE | `/api/board` | owner/AM | assignment board |
| GET/PUT/POST | `/api/settings`… | owner | settings, categories, notify |

\* requires an **approved** self-portrait (server-enforced).

---

## Security notes
- `JWT_SECRET` and all service secrets live only in `.env` / Render — never git.
- The supplied `OWNER_PASSWORD=Thiongo@12` is a **placeholder** — change it
  before this is reachable by anyone but you.
- Editors are fully blocked from submitting until their portrait is approved
  (checked in middleware, not just hidden in the UI).