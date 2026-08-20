# The Burgundy Wire

Every Washington Commanders headline, one page, updated nightly. A static
"headline river" — no original writing, no AI cost — that pulls from the
team's own site plus national and blog coverage, and links straight back to
each original article.

## Quick start

```bash
npm install
npm run collect      # read every news source, store new items
npm run social       # read the social ticker accounts + hashtags
npm run build        # render the static site into dist/
npm run serve        # http://localhost:8080
```

Or all at once:

```bash
npm run run
```

No API key needed for anything — this project never sends a single item to
an LLM. It fetches feeds, filters, sorts, and renders.

## How it works

```
config/sources.js          what news feeds to read
        │
        ▼
src/collectors/rss.js      fetch + parse → data/items.json
        │
config/social.js           what social accounts + hashtags to read
        │
        ▼
src/collectors/mastodon.js fetch + parse → data/social.json
        │
        ▼
src/site/                  render → dist/          (the published site)
```

State files under `data/` are committed to the repo so `collect` and `social`
stay idempotent across machines and across CI runs. Neither raw feed content
nor raw post markup is ever published as-is.

### Sources

Verified working by hand (2026-08-19) with a direct `curl` before being added
— several plausible candidates turned out to be dead ends and are left out
rather than worked around:

| Source | Category | Notes |
|---|---|---|
| Commanders.com | Team | Official feed, but **stale upstream**: as of 2026-08-20 its newest item was 63 days old, so it contributes nothing under the 45-day ceiling. Left enabled — if the team starts publishing to it again it'll flow straight in, and `collect` warns when a feed is all-relevant-but-all-expired. |
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

### Social ticker

A slim scrolling strip between the filter tabs and the river, carrying recent
posts from Commanders beat reporters. Configured in `config/social.js`.

Everyone on the roster posts on **X**, which has no usable free read API —
search is paywalled and the undocumented syndication endpoint rate-limits on
the first request. What does work: **sportsbots.xyz** runs a public
ActivityPub bridge mirroring these reporters' tweets, and **mastodon.social**
federates a copy. We read mastodon.social's public API (no auth, no key, no
bot wall) and every ticker entry links back to the original post on x.com.

Currently mirrored and live: `@Commanders`, `@JPFinlayNBCS`, `@john_keim`,
`@BenStandig`, `@tashanreed` (all beat, unfiltered) plus `@AdamSchefter`,
`@RapSheet`, `@MikeGarafolo`, `@JosinaAnderson`, `@pfrumors` (national,
keyword-filtered). Hashtag timelines `#Commanders` and `#RaiseHail` catch
on-topic posts from people who aren't on the roster.

Caveats worth knowing before relying on it:

- **The roster is limited to what the bridge mirrors.** Not every reporter is
  on it — `@NickiJhabvala` has only a single-tweet stub, not a real mirror, so
  she can't be included. A handle the bridge doesn't carry logs a warning and
  is skipped, never fatal.
- **It's a third-party mirror**, so it can lag or disappear. `npm run social`
  is `continue-on-error` in CI and the ticker renders as nothing at all when
  there are no posts, so the news river never goes down with it.
- Posts age out after `MAX_SOCIAL_AGE_DAYS` (3) — a three-day-old "he's
  practicing today" tweet is worse than an empty ticker.

### Relevance filtering

The four league-wide feeds are NFL-wide — most items are about other teams.
`src/lib/relevance.js` keeps only items mentioning "commanders" (unambiguous
inside an NFL-only feed) or a short list of marquee names (head coach, QB,
GM). Sources flagged `alwaysRelevant` (the team's own site, Hogs Haven) skip
this check entirely.

### Duplicates and freshness

`src/lib/store.js` collapses the same story picked up by two outlets within
a few days of each other (wire pickups are common in NFL coverage).

Two age limits, both applied on collection **and** retroactively to the stored
backlog — an item that was fresh when first collected would otherwise sit on
the page forever, since merging only ever adds:

- `MAX_ITEM_AGE_DAYS` (**45**) — a hard ceiling for *every* source, no
  exceptions.
- `MAX_WIRE_AGE_DAYS` (**14**) — tighter window for the league-wide wires,
  which publish continuously enough that two weeks is already stale.

The page then renders only the most recent `MAX_RIVER_ITEMS` (60).

## Configuration

All optional — see `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `SITE_NAME` | `The Burgundy Wire` | Masthead |
| `SITE_URL` | `http://localhost:8080` | Used in the RSS feed and canonical links — set to the real Netlify URL before deploying |
| `SITE_TZ` | `America/New_York` | Timezone for displayed timestamps |
| `MAX_ITEM_AGE_DAYS` | `45` | Hard age ceiling for every source |
| `MAX_WIRE_AGE_DAYS` | `14` | Tighter window for league-wide wires |
| `MAX_ITEMS_PER_SOURCE` | `15` | Per-source cap per run |
| `MAX_RIVER_ITEMS` | `60` | How many items the front page renders |
| `FETCH_DELAY_MS` | `700` | Politeness delay per host |
| `SOCIAL_ENABLED` | `true` | Set `false` to skip social collection entirely |
| `MAX_SOCIAL_AGE_DAYS` | `3` | Drop posts older than this from the ticker |
| `MIN_SOCIAL_TEXT_CHARS` | `25` | Skip bare photo/video captions |
| `MAX_TICKER_POSTS` | `30` | Posts in the ticker (rendered twice, for the loop) |
| `SOCIAL_RETAIN_DAYS` | `10` | How long `data/social.json` keeps posts |
| `SOCIAL_PER_ACCOUNT` | `8` | Posts fetched per account per run |
| `SOCIAL_INSTANCE` | `https://mastodon.social` | Instance whose public API is read |
| `SOCIAL_BRIDGE` | `sportsbots.xyz` | Bridge host the handles are resolved against |

## Adding a source

Add an entry to `config/sources.js` and run `npm run doctor --only=your-id`.
Verify the feed with a direct `curl` first — several look-alike URLs for the
same outlet 404 or redirect, and a couple of otherwise-good outlets block
bot fetches outright. If a source only covers the Commanders sometimes
(any national outlet), set `alwaysRelevant: false` so the keyword filter in
`src/lib/relevance.js` applies; if it's Commanders-only content, set it to
`true`.

## Adding a social account

Add a handle to `SOCIAL_ACCOUNTS` in `config/social.js` and run
`npm run social`. If the bridge doesn't mirror that handle you'll get
`@handle is not mirrored on sportsbots.xyz — skipped` and nothing else
happens; there's no way to add an account the bridge doesn't carry. Set
`alwaysRelevant: true` only for Commanders-only accounts — anyone covering the
whole league needs the keyword filter.

## Design

`src/site/assets/site.css` is the finished "Burgundy Wire" design (dark
burgundy/gold, hairline-separated river, sticky sidebar). Contracts to preserve
if you swap templates:

- **River item:** `title`, `url`, `sourceName`, `category`, `excerpt`,
  `publishedAt`
- **Ticker post:** `text`, `url`, `handle`, `publishedAt`

The ticker's seamless loop depends on the post list being rendered **twice**
inside `.ticker-track` (the animation slides exactly `-50%`). The second copy
is `aria-hidden` so assistive tech and crawlers see each post once. It pauses
on hover/focus and drops to a plain scrollable row under
`prefers-reduced-motion`.

## Known gaps

- **No reporting, no original writing.** This is a curated list of links,
  not journalism — if an outlet doesn't cover something, this page won't
  know about it either.
- **Reddit is not included.** Would need Reddit API OAuth credentials to add
  properly; out of scope for now.
- **The social ticker depends on a third-party bridge.** No X API is used (the
  free tier can't read search), so the ticker is only as good as
  sportsbots.xyz's mirror. If it dies, the ticker empties and the rest of the
  site is unaffected. A paid X API tier would be the only way to make this
  first-party.
- **The official Commanders.com feed is stale upstream** and currently
  contributes zero items, so "Team Sources" is effectively Hogs Haven plus the
  ticker's `@Commanders` posts.
- **The marquee-name list in `relevance.js` will go stale** as the roster
  turns over. It's a bonus catch on top of the "commanders" keyword, not the
  primary signal, so this is low-stakes — just something to revisit each
  offseason.

## Deploying

Live at **https://commanders-news-aggregator.netlify.app**.

`.github/workflows/nightly.yml` runs `collect` → `social` → `build` → commit
`data/` → `netlify deploy --prod` on a nightly cron (08:00 UTC), and can be
triggered by hand with `gh workflow run nightly.yml`. `NETLIFY_AUTH_TOKEN` is a
repo secret and `NETLIFY_SITE_ID` / `SITE_URL` are repo variables.

> **Note on the token:** `NETLIFY_AUTH_TOKEN` is currently a personal Netlify
> CLI login token, which grants account-wide access rather than being scoped to
> this one site. Netlify's CLI can't mint a named token non-interactively. To
> narrow it, create a dedicated PAT in Netlify (User Settings → Applications)
> and replace the secret with `gh secret set NETLIFY_AUTH_TOKEN`.
