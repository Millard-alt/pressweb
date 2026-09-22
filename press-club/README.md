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
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
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

1. Sign up at https://supabase.com, create a project (**remember the database
   password you set** — it is not shown again).
2. Project → **Connect** (or **Settings → Database → Connection string**) and copy
   the **Session pooler** URI. Use the **pooler** host, *not* `db.<ref>.supabase.co`
   — the direct host is IPv6-only and hosting platforms like Render cannot reach it.
   The user must be `postgres.<project-ref>`; a bare `postgres` fails with
   "no tenant identifier".
3. `.env`:

```env
# Session pooler: user is postgres.<project-ref>, host is aws-1-<region>.pooler.supabase.com
# If the password contains @ : / #, percent-encode it (@ becomes %40) — or leave it
# raw, the app encodes it for you either way.
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-1-<region>.pooler.supabase.com:5432/postgres
```

4. Confirm the string actually works before deploying:

```bash
npm run check-db
```

That prints the parsed host/user, tests DNS and the login, and names the exact
problem if it fails. The useful answers are:

| Message | Meaning |
|---|---|
| `28P01 password authentication failed` | Right project, **wrong password**. Reset it: Supabase → Settings → Database → Reset database password. |
| `tenant/user ... not found` | **Wrong region** in the host, or wrong project ref. |
| `no tenant identifier` | The username is missing its `.<project-ref>` suffix. |
| `ENOTFOUND` on `db.<ref>.supabase.co` | IPv6-only direct host — switch to the pooler host above. |

> **You do not need to run any SQL.** The app creates its own tables, adds any
> missing columns, and seeds the default categories, calendar and Owner account
> the first time it connects to an empty database.

> Leaving `DATABASE_URL` blank runs the app on local SQLite — great for offline
> work, but **do not** rely on it on Render's free tier, which wipes its disk on
> every redeploy. (Locally, if `DATABASE_URL` is set but unreachable, the app
> prints a loud warning and falls back to SQLite so you are never locked out. It
> will **not** do that in production — a broken database stops the boot there, so
> a misconfiguration can never silently look like lost content.)

<!-- README_PART_TWO -->

---

## 3. Deploy to Render (free)

Everything here is on Render's **free** plan. The repo already contains a
`Dockerfile` and a `render.yaml` Blueprint, so Render can read the whole config
instead of you clicking through settings.

### 3.1 Push the repo (already done)
The project lives at `https://github.com/Millard-alt/pressweb`. `backend/.env` is
git-ignored, so your real keys are **not** in the repo. If you ever paste a key
into a tracked file, GitHub's secret scanner will block the push — which is the
system working correctly. Put secrets in `.env` / Render's dashboard only.

### 3.2 Create the service
1. Sign up at https://render.com (free, no card).
2. **New +** → **Blueprint**.
3. Pick your repository (`Millard-alt/pressweb`) and click **Connect / Apply**.
4. Render reads `render.yaml` and asks you to fill in the values marked
   `sync: false`. Paste the same values as your local `.env`:

| Key | Value |
|---|---|
| `OWNER_NAME` | your name (defaults to `Millard` in `render.yaml`) |
| `OWNER_USERNAME` | your login name |
| `OWNER_PASSWORD` | **your Owner password** |
| `DATABASE_URL` | the Supabase pooler URI |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary |
| `CLOUDINARY_API_KEY` | from Cloudinary |
| `CLOUDINARY_API_SECRET` | from Cloudinary |
| `ONESIGNAL_APP_ID` | from OneSignal |
| `ONESIGNAL_REST_KEY` | from OneSignal |

`JWT_SECRET` is generated by Render automatically — leave it alone.

5. Click **Create / Deploy**. The first build takes a few minutes.
6. When it finishes, open the URL Render gives you (`https://<name>.onrender.com`).
   That single URL is the API, the frontend, and the uploads folder.

> **Free-tier note:** Render's free web services sleep after ~15 minutes of
> inactivity and take ~50 seconds to wake on the next visit. That is normal. The
> cron-style "keep warm" tricks are not needed for a school paper.

### 3.3 Check your database connection
On the service page open **Logs**. You want to see:

```
[db] connected — Postgres (Supabase)
The Wire is running at http://localhost:10000 [Postgres]
```

If instead you see `could not initialise the database`, the `DATABASE_URL` is
wrong. Fix it in **Environment**, then **Manual Deploy → Deploy latest commit**.
Run `npm run check-db` locally against the same string to find out what is wrong
before pushing.

> Production does **not** silently fall back to SQLite. That is deliberate: a
> silent fallback would look like the newsroom's content vanished on the next
> redeploy.

---

## 4. First login — Owner checklist

Log in with your `OWNER_USERNAME` / `OWNER_PASSWORD`. The **Admin** button opens
the Owner panel with these tabs:

| Tab | What it does |
|---|---|
| **Review Queue** | Approve or reject **portraits** and **stories**. Nothing is public until you approve it. |
| **Manage Editors** | Create accounts **with a password you choose**, and grant/revoke the **Assignment Manager** role. |
| **Assignment Board** | Add / edit / delete board entries (date, month, title, time, tag, notes). |
| **Site Settings** | Breaking line, edition line, push alerts, **Forced Notifications**, categories. |

Suggested order the first time:

1. **Manage Editors** → create your editors, typing a username and password for
   each one. Tell them their password (they can log in immediately).
2. Each editor logs in and is **forced** to upload a **self-portrait**. Until you
   approve it they cannot submit, cannot touch the board, and see only the notice
   to submit a portrait. This is enforced by the server, not just the UI.
3. **Review Queue → Portraits** → approve your editors. Their portrait then
   appears in the masthead and as a small byline chip on everything they publish.
4. **Site Settings** → set the **edition line** (e.g. `VOL. 1 · NO. 14`), write
   your **Breaking** message (or switch the banner off entirely — the text is
   remembered so you can switch it back on), and add/remove **categories**.
5. **Push alerts** → paste the OneSignal **App ID** and Save. Now the 🔔 buttons
   subscribe visitors, and you can send a broadcast.

### Forced Notifications
In **Site Settings** there is a **Forced Notifications** switch. When it is **on**,
anyone who denies the browser's notification prompt gets a blocking screen
telling them notifications are required, with device-specific steps to re-enable
them (desktop Chrome/Edge, Android, iPhone/Safari). They cannot use the site
until they allow them. When it is **off**, declining is ignored and the site works
normally. The setting lives in the database and is read by every visitor, so you
can flip it any time without redeploying.

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
- **Never paste real keys or a database password into this README or any other
  tracked file.** Keep them in `.env` locally and in Render's Environment tab in
  production. If a secret does get committed, rotate it in the provider's
  dashboard — otherwise the value stays readable in git history forever.
- Editors are fully blocked from submitting until their portrait is approved
  (checked in middleware, not just hidden in the UI).