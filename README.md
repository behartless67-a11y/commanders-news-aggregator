# The Burgundy Wire

Every Washington Commanders headline, one page, updated nightly. A static
"headline river" — no original writing, no AI cost — that pulls from the
team's own site plus national and blog coverage, and links straight back to
each original article.

## Quick start

```bash
npm install
npm run collect      # read every source, store new items
npm run build        # render the static site into dist/
npm run serve         # http://localhost:8080
```

Or all at once:

```bash
npm run run
```

No API key needed for anything — this project never sends a single item to
an LLM. It fetches feeds, filters, sorts, and renders.

## How it works

```
config/sources.js     the source registry — what to read
        │
        ▼
src/collectors/rss.js fetch + parse → data/items.json   (never published as-is)
        │
        ▼
src/site/             render → dist/                    (the published site)
```

Two stages, two files of state (`data/*.json`) committed to the repo so
`collect` stays idempotent across machines and across CI runs.

### Sources

Verified working by hand (2026-08-19) with a direct `curl` before being added
— several plausible candidates turned out to be dead ends and are left out
rather than worked around:

| Source | Category | Notes |
|---|---|---|
| Commanders.com | Team | Official feed — a slow, curated editorial feed (mixes 2022 draft-pick recaps with this month's posts), not a live wire. Exempt from the freshness filter for that reason. |
| Hogs Haven | Team | SB Nation Commanders blog — the highest-volume, most current source |
| Pro Football Talk | League | NFL-wide; filtered to Commanders mentions |
| CBS Sports | League | NFL-wide; filtered |
| Yahoo Sports | League | NFL-wide; filtered |

**Parked / not usable:**
- **ESPN** — its RSS is served behind an AWS WAF JavaScript challenge to
  automated clients. That's an explicit request not to be read by a script;
  defeating it is out of scope, same policy as this project's sibling,
  Blue Ridge Bulletin. Flip `enabled: true` in `config/sources.js` if ESPN
  ever opens the feed back up.
- **Commanders Wire** (USA Today) — no public RSS endpoint found at any of
  the usual paths.
- **Reddit r/Commanders** — blocks unauthenticated bot fetches (403); would
  need OAuth via Reddit's API to add properly.
- **Riggo's Rag / SI.com, The Athletic, Washington Post** — no working feed
  found, or blocked.

### Relevance filtering

The four league-wide feeds are NFL-wide — most items are about other teams.
`src/lib/relevance.js` keeps only items mentioning "commanders" (unambiguous
inside an NFL-only feed) or a short list of marquee names (head coach, QB,
GM). Sources flagged `alwaysRelevant` (the team's own site, Hogs Haven) skip
this check entirely.

### Duplicates and freshness

`src/lib/store.js` collapses the same story picked up by two outlets within
a few days of each other (wire pickups are common in NFL coverage). New
items from league feeds older than `MAX_ITEM_AGE_DAYS` (14) are dropped on
first sight; the team's own feed is exempt from that window since it isn't a
live wire (see the sources table above). The page itself renders only the
most recent `MAX_RIVER_ITEMS` (60) regardless of how much has accumulated in
`data/items.json` over time.

## Configuration

All optional — see `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `SITE_NAME` | `The Burgundy Wire` | Masthead |
| `SITE_URL` | `http://localhost:8080` | Used in the RSS feed and canonical links — set to the real Netlify URL before deploying |
| `SITE_TZ` | `America/New_York` | Timezone for displayed timestamps |
| `MAX_ITEM_AGE_DAYS` | `14` | Drop new league-feed items older than this on first sight |
| `MAX_ITEMS_PER_SOURCE` | `15` | Per-source cap per run |
| `MAX_RIVER_ITEMS` | `60` | How many items the front page renders |
| `FETCH_DELAY_MS` | `700` | Politeness delay per host |

## Adding a source

Add an entry to `config/sources.js` and run `npm run doctor --only=your-id`.
Verify the feed with a direct `curl` first — several look-alike URLs for the
same outlet 404 or redirect, and a couple of otherwise-good outlets block
bot fetches outright. If a source only covers the Commanders sometimes
(any national outlet), set `alwaysRelevant: false` so the keyword filter in
`src/lib/relevance.js` applies; if it's Commanders-only content, set it to
`true`.

## Design

`src/site/templates.js` and `src/site/assets/site.css` are a placeholder —
functional, but not the intended final look. The item shape passed to
`renderPage`/`itemCard` (`title`, `url`, `sourceName`, `category`, `excerpt`,
`publishedAt`) is the contract to preserve if you swap in a real template.

## Known gaps

- **No reporting, no original writing.** This is a curated list of links,
  not journalism — if an outlet doesn't cover something, this page won't
  know about it either.
- **Reddit is not included.** Would need Reddit API OAuth credentials to add
  properly; out of scope for now.
- **The marquee-name list in `relevance.js` will go stale** as the roster
  turns over. It's a bonus catch on top of the "commanders" keyword, not the
  primary signal, so this is low-stakes — just something to revisit each
  offseason.

## Deploying

Not yet wired up — see `.github/workflows/nightly.yml` for the intended
nightly `collect` → `build` → commit → Netlify deploy flow, matching the
sibling News_Aggregator project. It needs a Netlify site created and its
`NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` wired as repo secrets before it can
run for real.
