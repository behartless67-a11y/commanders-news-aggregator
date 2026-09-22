# The Burgundy Wire — How Everything Works

A complete reference for the site owner. Everything you need to know to run and maintain theburgundywire.com without having to remember it.

Last reviewed: 2026-09-22.

---

## The Stack

| Service | What it does | Dashboard |
|---|---|---|
| **Netlify** | Hosts the site, runs serverless functions, captures form submissions, stores analytics + subscriber + mailbag data in Blobs | app.netlify.com/projects/commanders-news-aggregator |
| **GitHub** | Source code + automated workflows | github.com/behartless67-a11y/commanders-news-aggregator |
| **Resend** | Sends Hail Mail newsletter emails | resend.com |
| **ImprovMX** | Forwards @theburgundywire.com email to your real inbox | improvmx.com |
| **Google Search Console** | Google indexing and search traffic | search.google.com/search-console |

Admin panel: **theburgundywire.com/admin** (password-protected)

### There is no AI model behind the site any more

The Amazon Bedrock account that used to write the digest, the game preview and the Monday post is gone. Calls return 401. **A Claude Enterprise seat cannot replace it** — Enterprise is seats for humans in the claude.ai app, it ships no API key, and the generators run unattended in GitHub Actions with no browser and no session.

Posts are written by hand now. See *Writing a post* below.

The generator code all still exists and still works (`src/digest/cloud-provider.js` plus the four generators). Restoring automation is a credentials change, not a rewrite: swap `AnthropicBedrockMantle` for `Anthropic`, change four model IDs from `anthropic.claude-sonnet-5` to `claude-sonnet-5`, and set `ANTHROPIC_API_KEY`. Roughly $4-5/month at this volume.

---

## Automated Schedules

Everything runs on GitHub Actions. No local machine needed for any of this. Times in UTC, with Eastern in brackets during EDT.

| Workflow | When | What it does |
|---|---|---|
| `nightly.yml` | Every 4 hours | The main one. Collects news, then refreshes social, roster, depth chart, schedule, betting, injuries, standings, team stats and Reddit. Builds and deploys **only if something actually changed**. |
| `social.yml` | 02, 06, 10, 14, 18, 22 [10pm, 2am, 6am, 10am, 2pm, 6pm] | Refreshes the beat-writer ticker and deploys if it changed. |
| `gameday.yml` | Every 15 min | Checks for a live game window; refreshes the ticker during one. |
| `scheduled.yml` | Hourly | Publishes any post whose scheduled time has passed. Deploys only when something actually goes live. |
| `roster-stats.yml` | Tue 12:00 [8am] | Per-player season stats. |
| `monday.yml` | Mon 12:00 [8am] | Refreshes college football and writes the Monday briefing (see below). Does **not** write the post. |
| `publish-on-approve.yml` | On push | Rebuilds and deploys when `data/digests`, `data/previews`, `data/mondays`, `data/originals` or `src/` changes. |
| `preview.yml` | **Disabled** | Only ever called Bedrock. Its cron is commented out, not deleted. |

### Why deploys are gated

Netlify bills this account on credits, so cost tracks **deploy volume, not traffic**. At one point the site was deploying ~26 times a day on about 5 real changes. Two things fixed that, and both are worth preserving:

- Every workflow deploys only when its data actually changed. `nightly.yml` additionally ignores `data/reddit.json`, which changes nearly every run and renders nowhere on the site.
- Relative timestamps ("2h ago") are recomputed in the browser by `site.js`, so the page doesn't go stale-looking between deploys. Freshness stopped being a reason to redeploy.

**Don't add a step that commits to `data/` without thinking about whether it should trigger a deploy.**

### Two scheduling gotchas

- **GitHub skips crons under load.** This is not theoretical here: `gameday.yml`'s `*/15` cron once delivered 7 runs out of an expected 96, and `monday.yml` has missed its slot outright. Anything time-critical needs a manual fallback. Treat cron times as "at or after."
- **Workflow pushes can lose a race.** Every job that commits now runs `git pull --rebase -X theirs` before pushing. Without it, a push from your laptop mid-run causes the job's push to be rejected, and everything it collected is silently thrown away with no deploy. If you see a workflow fail on the commit step, this is why.

---

## Writing a post

There are three post types. None of them are generated any more.

### "A Case of the Mondays" (weekly recap)

1. Monday morning `monday.yml` writes **`data/mondays/<date>.prompt.md`** and commits it. That's the briefing: every numbered source from the weekend, the college football results, and the r/Commanders fan reaction, all scoped to the window. Run `npm run monday:corpus` by hand if the workflow skipped.
2. Write the post with Claude from that briefing.
3. Save it to `data/mondays/<date>.json` with `status: "draft"`.
4. `npm run monday:approve <date>` flips it to published; the push deploys it.

### Original posts (essays, pregame, announcements)

Written collaboratively with Claude, saved straight to `data/originals/<slug>.json`. No approval gate, they're yours.

Paragraphs support four inline markers, positioned where you want them in the `paragraphs` array:

| Marker | Does |
|---|---|
| `## Heading` | A section subhead |
| `!photo <key>` | Drops in the photo under that key in the record's `photos` map |
| `!thanks` | Renders the record's `thanks` list, with a real `lang` attribute per entry |
| `!callout` | Renders the record's `callout` (the partner pull-quote) |

**Paragraph text is HTML-escaped.** If you need real markup — a link, a `lang="sv"` span for a non-English line — it goes in the `plug` field, which is raw trusted HTML and renders as the closing paragraph.

### Scheduling a post

Set `status: "scheduled"` and a future `publishedAt`. Nothing renders a non-published record, so it stays invisible until `scheduled.yml` picks it up on the hour and publishes it. Posts pin to the top of the river for 24 hours from their `publishedAt`, so a post scheduled for 7am pins from 7am, not from whenever the workflow fired.

Only originals can be scheduled. Digests and Mondays have review gates, and a post that publishes itself on a timer is exactly what those gates exist to prevent.

---

## Hail Mail Newsletter

**What it is:** A weekly email newsletter sent to subscribers. Different voice from the blog — more unhinged, more personal, can swear. Think "group chat if the whole list got accidentally CC'd."

**Subscribers** live in Netlify Blobs under the `subscribers` store, keys like `sub:email@example.com`. The live list and count are in the admin panel.

**To send:** admin panel → Newsletter → paste subject and body HTML → "Send test to me" first, then "Send to all subscribers."

**From:** newsletter@theburgundywire.com (domain verified in Resend). **Unsubscribes** are automatic via one-click links. **If UVA email blocks it:** ask recipients to whitelist the address. Gmail is fine.

---

## Wire Taps (the mailbag)

Reader questions, submitted at theburgundywire.com/wiretaps. Anonymous is allowed and the page promises it, so an empty name stays empty.

Submissions land in the `wiretaps` blob store and appear in the admin panel under **Wire Taps mailbag**, newest first.

Worth knowing: Netlify keeps its own copy of every form submission regardless of what our code does. That's the only reason the first questions weren't lost during the period when `submission-created.js` only knew about the newsletter form and silently ignored everything else. If the panel ever looks empty and you think it shouldn't, check Netlify's own Forms tab before assuming they're gone.

---

## The Email Popup (Subscribe Modal)

- Shows on the 10th, 20th, 30th... visit for a given browser
- Only if the visitor hasn't already subscribed or dismissed it
- Never shows to you when logged into the admin panel
- The floating Hail Mail bar also lets people subscribe any time
- Both disappear permanently once someone subscribes

---

## The Admin Panel

theburgundywire.com/admin. Your own browsing doesn't count in analytics when you're logged in.

| Section | What it does |
|---|---|
| **Quick Links** | One-click to Netlify, GitHub, Resend, Search Console |
| **Traffic** | Pageviews, visitors, sources, countries, devices, week-over-week trend |
| **Recent activity** | The last pageviews in arrival order: time, page, referrer, country/state, device, new or returning |
| **Pipeline** | Collector run history, flagging any stage that has gone quiet |
| **Blog drafts** | Approve or reject drafts |
| **Wire Taps mailbag** | Reader questions |
| **Newsletter** | Subscriber list + send |

### On the analytics

Almost everything is a **counter**, not a log. `track.js` increments buckets: day, month, hour, weekday, path, referrer, country, state, browser, OS, device, language. There are no per-visitor records, and the raw IP on `context.geo` is deliberately never touched.

The one exception is **Recent activity**, a rolling log of the last 200 pageviews. It carries only fields already aggregated elsewhere plus a timestamp. It deliberately does **not** store the `sid`, even though that value is right there in `track.js` — `sid` is a per-tab identifier, and storing it beside a timestamp would turn a list of independent arrivals into a browsable per-visitor session history. If you ever want that, it's a deliberate decision to make, not something to switch on by accident.

### The Pipeline panel is your early warning

When a collector stops working the site doesn't break, it just quietly stops getting new items, and you find out days later because the river looks old. The Pipeline panel reads run history from `state.json` and flags any stage that has gone well past its own observed cadence. Staleness thresholds are derived per stage from its actual run gaps, not hardcoded.

---

## The live ticker

The beat-writer ticker at the top of the page is built into the static HTML like everything else, which meant it was stale exactly when it mattered most, during a game. A reader wrote in about precisely this.

So `site.js` now refreshes it in the browser from **`/api/ticker`** (`netlify/functions/ticker.js`), which fetches the seven Commanders beat accounts live at request time.

Two things about it worth remembering:

- It **merges** into the rail rather than replacing it. The endpoint only covers the beat accounts, while the built page also carries national insiders from the scheduled collection. Replacing would silently drop them.
- It is cached at the CDN for 60 seconds, which is what stops a busy Sunday hammering the upstream mirror. A thousand readers inside one minute cost one upstream fetch.

Every failure path leaves the built-in ticker exactly as rendered: no endpoint, a 503, a parse error, an empty list, or no JavaScript at all.

---

## The Ditch Report

Private NC-17 weekly newsletter for you, Jason, and Chris. Not automated — paste the Slack transcript to Claude and it writes the newsletter. Lives in the conversation, never published to the site.

---

## The Valhalla Feed (stepdad's Vikings site)

Separate repo: github.com/behartless67-a11y/valhalla-feed
Deployed at: candid-gnome-53c779.netlify.app
Updates once daily at 1am Eastern. No AI blog, no newsletter, no live blog — just news headlines and the schedule.

---

## Content Sources

**Team sources** (always relevant, every post shown): Commanders.com, Hogs Haven, Riggo's Rag, ClutchPoints, DC Sports King, WJLA, Commanders YouTube, Nicki Jhabvala (The Athletic, via custom scraper)

**National sources** (filtered to Commanders-relevant only): Pro Football Talk, ESPN, Yahoo Sports, CBS Sports

**Social/ticker** (beat reporters via a Mastodon bridge, because X has no usable free read API): JP Finlay, Ben Standig, John Keim, Tashan Reed, Scott Abraham, Nicki Jhabvala, and the team account

**r/Commanders** (`src/lib/reddit.js`): deliberately **never rendered on the site**. Two Atom feeds accumulate across runs into `data/reddit.json` and feed the Monday post's fan-reaction section only. The feeds carry no score or upvotes, so nothing can be sorted by quality, only recency — an unfiltered "latest from the sub" widget would put a meme next to an injury report under your name. It's opinion, never a source for a factual claim, and no usernames are ever quoted.

Hogs Haven and ClutchPoints are excluded from the Monday corpus specifically (`EXCLUDED_SOURCE_IDS` in `src/digest/monday-generate.js`).

### The one collector that does NOT run in GitHub Actions

**Nicki Jhabvala** isn't carried by the Mastodon bridge, so she comes through `npm run x-scrape`, which drives a real logged-in Chrome. That can't run on a CI runner, so it runs on **your work machine** via Task Scheduler, every 2 hours. It reports to the Pipeline panel as the `social-browser` stage.

This means the Pipeline panel will flag `social-browser` as stale any time that machine is off, asleep, or you're away for a weekend. That's expected, not a bug.

To run it on a second machine, do the one-time setup in `docs/x-browser-scraping.md` first — the dedicated Chrome profile has to be logged in on *that* machine. Without it the scrape runs, finds a logged-out X, and reports `0 fetched` with `sessionExpired: false`, which looks like "nothing new" rather than "not logged in." Worth knowing when the numbers look fine but nothing ever arrives.

---

## Key Files

| File | What it does |
|---|---|
| `config/sources.js` | All RSS sources and their settings |
| `config/social.js` | Beat writer social accounts for the ticker |
| `config/local-spots.js` | Cville bars and spots for the local page |
| `config/hero-images.js` | Rotating hero images |
| `config/broadcast-urls.js` | Hand-verified network → watch-live URLs |
| `src/site/templates.js` | Every page's markup, including the admin panel |
| `src/site/assets/site.js` | All client-side JS: relative timestamps, live ticker, reveals |
| `src/lib/reddit.js` | r/Commanders collector (Monday post only) |
| `src/lib/teamstats.js` | Team offense/defense totals and ranks |
| `src/digest/monday-generate.js` | Monday post: corpus, briefing export, generator |
| `src/digest/monday-prompt.js` | Monday voice and hard rules |
| `src/digest/originals.js` | Hand-written posts + scheduled publishing |
| `netlify/functions/ticker.js` | Live beat-writer posts (`/api/ticker`) |
| `netlify/functions/track.js` | Analytics beacon handler |
| `netlify/functions/admin-pipeline.js` | Collector health for the admin panel |
| `netlify/functions/submission-created.js` | Captures newsletter signups **and** Wire Taps questions |
| `netlify/functions/newsletter-send.js` | Hail Mail send function and email template |
| `data/originals/` | Hand-written blog posts |
| `data/mondays/` | "A Case of the Mondays" posts and briefings |
| `data/digests/` | Weekly recap drafts (not currently generated) |
| `scheduled-post.ps1` | Windows Task Scheduler script for local tasks |

---

## Useful commands

```
npm run build          # rebuild dist/
npm run serve          # preview locally on :8080
npm run monday:corpus  # write this week's Monday briefing
npm run monday:list    # see all Monday posts and their status
npm run publish-due    # publish any scheduled post whose time has passed
npm run collect        # fetch news now
npm run team-stats     # refresh the Team Stats widget
npm run reddit         # top up the r/Commanders cache
npm run doctor         # check source health
```

---

## If Something Breaks

- **Site not updating:** Check the Pipeline panel first, then the GitHub Actions tab. A failed commit step usually means a push race (see above).
- **Stats or standings look like last week:** Something in `nightly.yml` failed, or a run was skipped. Trigger it by hand: `gh workflow run "Nightly build"`.
- **Admin panel won't log in:** Clear browser cookies for theburgundywire.com and try again.
- **A post won't publish:** Check its `status` is `published` (or `scheduled` with a past `publishedAt`), and that the file is in the right folder.
- **Email not arriving:** Check Resend logs. If it shows delivered, check spam.
- **Wrong content on site:** `SITE_URL=https://theburgundywire.com npm run build` then `npx netlify deploy --prod --dir=dist`
- **`npm run digest` / `monday` / `preview` / `live` fail with a 401:** Expected. There's no model API account. See the top of this document.
