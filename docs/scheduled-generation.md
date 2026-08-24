# Session notes: what shipped, and what's left to schedule

## Everything shipped in this session, for reference

- **Roster page** (`/roster.html`) — ESPN photos, jersey/position, season
  stats (refreshed weekly, Tuesday mornings, via `roster-stats.yml`), ranked
  by real mention counts from this site's own coverage.
- **Beat Writers page** (`/beat-writers.html`) — one column per beat
  reporter, with photo/bio, updating on the same 2-hour cadence as the
  ticker (no extra collection needed — reads the same social store).
- **Final Thoughts photos** — the live game-day wrap-up now pulls real
  photos from cited social posts (only ever games from here forward; the
  Aug 22 Lions game predates this and has none stored).
- **Game preview post type** — new Blog content alongside the weekly
  recap, day-before-game, reviewed the same way (see below).
- **Admin panel** (`/admin.html`, linked quietly from the footer, password-
  gated) — traffic stats (pageviews, 14-day chart, top pages) and a list of
  every weekly/preview draft with an Approve & Publish button. The password
  is stored as a SHA-256 hash in the `ADMIN_PASSWORD_HASH` Netlify env var,
  never in the repo.
- **Contact page** (`/contact.html`) — Netlify Forms, no backend. Submits
  to `admin@theburgundywire.com`, which ImprovMX forwards to
  `bh4hb@virginia.edu`. Only "Message" is required.
- Mobile: collapsible nav dropdown and a collapsible footer, both using the
  same zero-JS checkbox+label pattern; the river shows two sentences per
  card instead of the full excerpt.

## Scheduling the weekly Blog draft and game previews

The weekly Blog post and the day-before-game preview both run on a **local**
Ollama model (see `src/digest/provider.js`), not the cloud, because two of
the aggregated sources (Hogs Haven, ClutchPoints) disallow AI crawlers in
their `robots.txt`. GitHub Actions runners have no Ollama installed and
can't reach one, so these two can't run on the same cloud cron schedule as
everything else in `.github/workflows/` — they need to run somewhere Ollama
actually lives.

This is written for a Windows machine that stays on and already has this
repo cloned, `npm install` run, Ollama running with the model pulled
(`ollama pull gemma4:26b`, or whatever `DIGEST_MODEL` is set to), and
`netlify` CLI logged in (`netlify login`, then `netlify link` inside the
repo once).

## What to schedule

Two separate scheduled tasks, both running the same shape of script: pull
the latest repo state, generate a draft if one's due, rebuild, and deploy.
Neither one auto-publishes anything — drafts still wait for a human "approve"
in the admin panel (`/admin.html`) or via `npm run digest:approve` /
`npm run preview:approve`, same as today.

| Task | When | Command |
|---|---|---|
| Weekly Blog draft | Fridays, 2:00 PM Eastern | `npm run digest` |
| Game preview draft | Daily, 5:00 PM Eastern | `npm run preview` |

`npm run preview` is safe to run every day — it checks the cached schedule
for a game kicking off tomorrow and does nothing at all on the ~360 days a
year that isn't true (see `gameTomorrow()` in `src/lib/gamewindow.js`). No
separate "is there a game" check is needed before running it.

2:00 PM Friday, not 4:00 PM, is deliberate: it leaves a two-hour window to
review and approve the draft before the 4:00 PM target you actually want
readers to see it.

## The script

Save as `scheduled-post.ps1` (or a `.bat` wrapping the same commands) in the
repo root. Pass which command to run as an argument so one script serves
both tasks.

```powershell
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('digest', 'preview')]
  [string]$Task
)

Set-Location "$PSScriptRoot"

git pull origin master --no-edit
if ($LASTEXITCODE -ne 0) { Write-Error "git pull failed"; exit 1 }

npm run $Task
# Exit code from `preview` on a non-game day is 0 (it just logs "nothing to
# do" and returns) — don't treat that as a failure.

npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "build failed"; exit 1 }

git add data/
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m "Scheduled $Task run"
  git push origin master
}

netlify deploy --prod --dir=dist
```

## Registering the two scheduled tasks

Open **Task Scheduler** → **Create Task** (not "Basic Task" — the full
dialog lets you set the exact trigger and working directory):

**Task 1 — Weekly Blog draft**
- Trigger: Weekly, every Friday, 2:00 PM
- Action: Start a program
  - Program: `powershell.exe`
  - Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\repo\scheduled-post.ps1" -Task digest`
  - Start in: `C:\path\to\repo`

**Task 2 — Game preview draft**
- Trigger: Daily, 5:00 PM
- Action: Start a program
  - Program: `powershell.exe`
  - Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\repo\scheduled-post.ps1" -Task preview`
  - Start in: `C:\path\to\repo`

For both: under **Conditions**, uncheck "Start the task only if the computer
is on AC power" if this machine is a desktop (irrelevant, but Task Scheduler
checks it by default on some Windows editions). Under **Settings**, check
"Run task as soon as possible after a scheduled start is missed" so a
machine that was briefly asleep/rebooting still catches up.

## After setup

Once a scheduled run produces a draft, it shows up in `/admin.html` (or
`npm run digest:list` / `npm run preview:list`) same as a manually-generated
one — nothing about the review/approve step changes.
