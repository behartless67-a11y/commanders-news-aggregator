# The Burgundy Wire

Every Washington Commanders headline, one page, updated nightly. A static
"headline river" that pulls from the team's own site plus national and blog
coverage, and links straight back to each original article. The river, ticker,
and video rail are pure aggregation — no AI, no cost, nothing but fetch,
filter, sort, render. An optional weekly digest (see below) adds a local,
human-reviewed AI recap on top; it's off by default and touches no other part
of the site.

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

No API key needed, and nothing is sent to an LLM, for any of the above — it
fetches feeds, filters, sorts, and renders. That changes only if you opt into
`npm run digest` (see Weekly AI digest, below), which runs entirely against a
local Ollama model on your own machine.

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

Verified working by hand (2026-08-20) with a direct `curl` before being added
— several plausible candidates turned out to be dead ends and are left out
rather than worked around:

| Source | Category | Filtered | Notes |
|---|---|---|---|
| Commanders.com | Team | no | Official feed, but **stale upstream**: as of 2026-08-20 its newest item was 63 days old, so it contributes nothing under the 45-day ceiling. Left enabled — if the team starts publishing to it again it'll flow straight in, and `collect` warns when a feed is all-relevant-but-all-expired. |
| Hogs Haven | Team | no | SB Nation Commanders blog — consistently current |
| Riggo's Rag | Team | no | Commanders-only FanSided blog, ~90 items per fetch and same-day fresh; currently the highest-volume source |
| Commanders (YouTube) | Team | no | The team's own uploads — press conferences and camp clips. The only first-party source still publishing, given the text feed above. Shorts are dropped (see below) |
| ClutchPoints | Team | **yes** | Team-tagged feed, but it carries the occasional site-wide fantasy piece, so it goes through the keyword filter anyway |
| DC Sports King | Team | **yes** | Local DC outlet covering Wizards/Nationals/WWE too, so filtered |
| WJLA (ABC7) | Team | no | The DC ABC affiliate runs a dedicated Commanders vertical with its own feed, not just a general sports section — same-day fresh |
| Pro Football Talk | League | yes | NFL-wide |
| CBS Sports | League | yes | NFL-wide |
| Yahoo Sports | League | yes | NFL-wide |

**Parked / not usable** (each of these was actually fetched and inspected, not
assumed):

- **ESPN** — its RSS is served behind an AWS WAF JavaScript challenge to
  automated clients. That's an explicit request not to be read by a script;
  defeating it is out of scope, same policy as this project's sibling,
  Blue Ridge Bulletin. Flip `enabled: true` in `config/sources.js` if ESPN
  ever opens the feed back up.
- **Reddit r/Commanders** — blocks unauthenticated bot fetches (403); would
  need OAuth via Reddit's API to add properly.
- **Blocked or no feed at any usual path:** Commanders Wire (USA Today),
  SI/FanNation, Yardbarker, Yahoo's *team* feed, WTOP, Athlon, Bleacher
  Report, CBS's *team* feed, SB Nation's league feed, 247Sports, FanSided's
  network feed, The Athletic, Washington Post.
- **NBC Sports Washington** — its `/rss` path returns a gzipped HTML
  single-page app, not a feed.
- **Google News RSS** — works, and returns plenty of fresh items, but every
  link is a Google redirect rather than the publisher's URL, and it aggregates
  other aggregators (so it would duplicate everything above). Rejected on
  quality, not availability.
- **NBC Washington** (the local station) — feed works, but its sports feed is
  dominated by soccer, F1, and WNBA; too little signal to be worth a fetch.
- **WUSA9** — has a real `/section/washington-commanders` page, but every URL
  on the site returns HTTP 200 with the full JS-rendered homepage rather than
  real content — the same single-page-app problem that ruled out NBC Sports
  Washington. The 200 status makes this the one worth double-checking
  `content_type` on, not just the status code.
- **FOX5 DC** — has a real Commanders tag page but no discoverable RSS at any
  of the usual WordPress or Arc Publishing feed paths.
- **Washington Times** — its sports feed works, but is general-sports
  (tennis, golf) and its football feed is mostly college football; too little
  Commanders density to be worth adding on top of the sources already here.
- **USA Today's own NFL feed** (as opposed to the already-dead *Commanders
  Wire*) — `rss.usatoday.com` 301-redirects straight to the homepage. USA
  Today has discontinued public RSS network-wide, not just for the team site.
- **DC Black** — surfaced by an AI brainstorm (see below) as a plausible local
  DC source. It's a Black-owned-business and community-events site with zero
  sports content — a clean example of a model asserting relevance it had no
  basis for, caught by the same "verify with curl before adding" rule
  everything else here follows.

**On using a second local model to help hunt for sources (2026-08-20):** asked
`qwen3.8` (running locally in Ollama) to independently brainstorm new
candidates, deliberately kept separate from the search above so neither
anchored on the other. It repeatedly tried to re-suggest sources it had just
been told were already dead (Bleacher Report, The Athletic, Washington Post),
hedged nearly every RSS guess as "likely" rather than checked, and asserted DC
Black was sports-relevant with no actual basis. One name from its list — DC
Black — got curl-verified and rejected; the rest of its suggestions had no
real feed by its own admission and weren't pursued. Useful as a second set of
name ideas, not as a source of verified facts — every claim still got checked
the same way a human's guess would have been.

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
keyword-filtered). Hashtag timelines `#Commanders`, `#RaiseHail`, and `#HTTC`
catch on-topic posts from people who aren't on the roster — always
keyword-filtered, because "#commanders" collides with the Magic: the Gathering
format.

Posts are shown **in full**, not truncated: a clipped tweet is worse than no
tweet, since the half you can read is exactly the half that makes you want the
rest. That makes the track's width vary a lot day to day, so the CSS
`animation-duration` is computed at build time from the total character count
(`TICKER_CHARS_PER_SEC`) — reading speed stays constant whether it's a busy news
day or a quiet one.

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

### Video rail

The right-hand column carries the six most recent uploads from the team's
YouTube channel, marked in `config/sources.js` with `media: 'video'` (a flag, not
a hardcoded source id, so a second channel is a config edit). The video ID is
parsed out of the stored watch URL at render time, so the collector stays a plain
RSS collector.

**On copyright:** embedding through YouTube's own player is the sanctioned way to
do this, not a grey area. The uploader controls it — YouTube's oEmbed endpoint
401s for a video with embedding disabled, and it returns player markup for these
(verified 2026-08-20, channel `Washington Commanders`). Views still count for the
uploader and YouTube still serves its ads. Two rules keep it that way:

- **Never rehost.** Don't extract the video file, proxy the stream, or cache
  thumbnails locally. Thumbnails are hotlinked from `i.ytimg.com` deliberately —
  serving Google's image from Google's CDN is the defensible position; copying it
  onto our own origin is not.
- **Attribute and don't imply endorsement.** Each card credits the channel and
  the footer carries the not-affiliated disclaimer.

Cards ship as ordinary links to youtube.com and `site.js` swaps in a
`youtube-nocookie.com` player on click. That's a load-bearing decision, not
polish: YouTube's player is roughly a megabyte of script per embed, and six eager
iframes would outweigh the rest of the site and hand YouTube a page view for
every visitor who never pressed play.

### Progressive reveal and back to top

The river renders **all** its items and shows the first `RIVER_INITIAL` (14), with
a chevron button revealing `RIVER_BATCH` (10) more per press. Nothing is fetched
on expand — it's a CSS display state, so `site.js` only flips classes.

`RIVER_INITIAL`'s default is **measured, not guessed**: at 1440px and up the video
rail renders 1537px tall and 14 cards come to 1556px, so the two columns start
level rather than leaving the river trailing off into dead space beside six
videos. Because card heights move with headline and excerpt length, `balance()` in
`site.js` measures both columns on load and tops the river up when a day's items
run short. It is deliberately **reveal-only** — it never re-hides a story, so it
can't undo a button press, and erring one card tall puts the button at the foot of
the rail instead of stranding a gap above it. Re-measure the default if the rail
changes size.

With JavaScript off, a collapsed river would strand items behind a dead button,
so `renderPage` emits a `<noscript>` block that un-collapses it and hides the
button. It's placed **after** the stylesheet link to win the cascade. The
back-to-top control is a plain `#top` anchor (it works without JS); the script
only decides when it's worth showing.

Two consequences worth knowing if you edit the river markup: the button is the
river's last child, so card borders use `:last-of-type` rather than
`:last-child`; and revealed cards restore to `display: flex`, matching `.card`.

### Relevance filtering

Most items in a league-wide feed are about other teams. `src/lib/relevance.js`
keeps only items mentioning "commanders" (unambiguous inside an NFL-only feed)
or a short list of marquee names (head coach, QB, GM). Sources flagged
`alwaysRelevant` — the Commanders-only ones — skip this check entirely.

**It reads the headline and the URL slug only, never the article body.** The
excerpt used to count, and it let through pieces that are plainly about another
team but name this one in passing: a Miami blog's mailbag ("The Phinsider
Mailbag: Willie Gay roster status") reached the *top* of the river on an
incidental mention alone. Joint-practice notes, photo captions, and "related
reading" tails all produce that false positive. A headline is what an outlet
says its article is about, which is the actual question. The cost is losing the
occasional on-topic piece behind a coy headline — for a link river, precision
beats recall, since a wrong item is visible and annoying while a missing one
usually arrives via another source.

A second filter, `isSocialFiller`, drops titles that are hashtag strings rather
than headlines (three or more `#tags`). The team's YouTube feed mixes real press
conferences in with Shorts titled `🔥🔥🔥 #nfl #commanders #football #shorts`,
which tell a reader nothing in a headline river — that check alone takes a
typical YouTube fetch from 15 items down to 6.

Both filters are also applied **retroactively** to the stored backlog on every
run, so tightening a rule cleans up existing false positives instead of only
affecting future collections.

### Weekly AI digest

An optional, separate feature from the news river: `npm run digest` writes a
recap of the week's Commanders news, generated by a **local** model (Ollama)
and held in a **draft-review-approve gate** before it can ever reach the live
site. Nothing here is automated end to end on purpose.

```bash
npm run digest                        # write today's draft (skips if it already exists)
npm run digest:list                   # every recap and its status
npm run digest:review -- 2026-08-20   # print the draft with every citation resolved
npm run digest:approve -- 2026-08-20  # mark published — the next `build` renders it
npm run digest:reject -- 2026-08-20   # mark rejected — never rendered
```

(The `--` before the week is npm's own argument-forwarding syntax, not
optional — `npm run digest:review 2026-08-20` passes the date to npm, not to
the script.)

**Why local only, and why not full article text.** OpenRouter would be the
obvious alternative, but sending this week's headlines and reporter posts to a
third-party API is a worse fit than running the model on this machine — two of
the biggest sources here, Hogs Haven and ClutchPoints, explicitly disallow AI
crawlers (`anthropic-ai`, and for ClutchPoints also `ClaudeBot`/`CCBot`) in
their robots.txt. That's the same kind of signal this project already treats
as a hard boundary elsewhere (see ESPN, above), so the digest never fetches
article bodies either — only the headline, excerpt, and video titles already
in the store, plus full-text reporter posts (see Social ticker) from named
beat accounts. `src/digest/provider.js` is a single-function interface
(`generate({model, system, prompt, schema})`), so an OpenRouter provider would
be a second ~40-line file with the same shape if that tradeoff is ever
revisited — it hasn't been built because it isn't needed.

**Why a human has to click approve.** `src/digest/validate.js` catches the
failure modes a computer actually can check: a citation pointing at a source
that doesn't exist, a number that appears in no source, an invented URL, a
name that matches nothing in the corpus. It **cannot** catch a relationship
hallucination where every name and number is real — in testing, two of three
candidate models asserted that Trevon Diggs had played for the Commanders. He
never did; the team was only ever linked to him, and the source headline
("Commanders close the book on Trevon Diggs") invites exactly that
misreading. Every claim, name, and number is real, so no automated check
catches it. That's what `npm run digest:review` is for — it resolves every
citation back to its actual source so a claim can be checked by eye before
`approve` puts it on the site. `data/digests/<date>.json` is written once and
never silently regenerated (pass `--force` to intentionally redo it), for the
same reason `data/items.json` is append-only: a scheduled run must never
rewrite a post out from under a reader who already saw it.

**Model choice.** Default is `gemma4:26b`, chosen on evidence from a same-week
bake-off across three locally available models, not on size or speed — it was
the only one that produced zero factual errors on a real week's corpus, while
a smaller/faster model kept the Trevon Diggs error even after prompt
hardening. Speed doesn't matter for a job that runs once a week; hallucination
rate is the only axis that does. Override with `DIGEST_MODEL` if you pull
something else into Ollama.

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
| `RIVER_INITIAL` | `14` | Items visible before the reader presses "show more" — sized to match the video rail's height |
| `RIVER_BATCH` | `10` | Items revealed per press |
| `MAX_VIDEOS` | `6` | Clips in the right-hand video rail |
| `FETCH_DELAY_MS` | `700` | Politeness delay per host |
| `SOCIAL_ENABLED` | `true` | Set `false` to skip social collection entirely |
| `MAX_SOCIAL_AGE_DAYS` | `3` | Drop posts older than this from the ticker |
| `MIN_SOCIAL_TEXT_CHARS` | `25` | Skip bare photo/video captions |
| `MAX_TICKER_POSTS` | `30` | Posts in the ticker (rendered twice, for the loop) |
| `TICKER_CHARS_PER_SEC` | `8.6` | Scroll speed — characters sliding past per second. Lower is slower |
| `SOCIAL_RETAIN_DAYS` | `10` | How long `data/social.json` keeps posts |
| `SOCIAL_PER_ACCOUNT` | `8` | Posts fetched per account per run |
| `SOCIAL_INSTANCE` | `https://mastodon.social` | Instance whose public API is read |
| `SOCIAL_BRIDGE` | `sportsbots.xyz` | Bridge host the handles are resolved against |
| `DIGEST_MODEL` | `gemma4:26b` | Ollama model tag used to write the weekly recap |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Where the digest looks for a running Ollama server |
| `OLLAMA_NUM_CTX` | `16384` | Context window requested per generation — a week's corpus runs ~6-8k tokens |
| `DIGEST_WINDOW_DAYS` | `7` | How far back the digest's corpus reaches |
| `DIGEST_MIN_ITEMS` | `10` | Below this many corpus entries, decline to generate rather than write about almost nothing |
| `DIGEST_MIN_POST_WORDS` | `6` | Reporter posts with fewer real words than this are a graphic/sponsor tag, not information |
| `DIGEST_MAX_ATTEMPTS` | `3` | Retries with validation feedback before giving up on a week |

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

`src/site/assets/site.css` is the finished "Burgundy Wire" design — dark
burgundy/gold, hairline-separated river running wide (`--max: 1920px`) with the
video rail on the right. "About this page" and "Reading the badges" live in the
footer rather than a sidebar widget, because the right column is the video rail.

The footer is filled with the team's official burgundy (`#5A1414`). Note that it
**re-declares `--text-faint` and `--border-soft` inside its own scope**: the
palette's muted greys were tuned against the near-black page background, and on
burgundy `--text-faint` falls to roughly 3:1 contrast — under the 4.5:1 that body
text needs. Anything else placed on a burgundy panel needs the same treatment
rather than inheriting tones that only work on the dark background.

Contracts to preserve if you swap templates:

- **River item:** `title`, `url`, `sourceName`, `category`, `excerpt`,
  `publishedAt`
- **Ticker post:** `text`, `url`, `handle`, `publishedAt`
- **Video item:** any item whose `url` is a YouTube watch URL, from a source
  flagged `media: 'video'`

`src/site/assets/site.js` is the **only** JavaScript on the site — click-to-play
video, progressive reveal, back-to-top visibility. Keep it that way if you can;
each of those three exists because the no-JS alternative was materially worse,
and all three degrade to working HTML without it.

The ticker's seamless loop depends on the post list being rendered **twice**
inside `.ticker-track` (the animation slides exactly `-50%`). The second copy
is `aria-hidden` so assistive tech and crawlers see each post once. It pauses
on hover/focus and drops to a plain scrollable row under
`prefers-reduced-motion`. Don't add a `max-width`/ellipsis to `.ticker-text` —
posts are meant to be shown whole, and clipping them also breaks the
length-derived scroll duration.

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
  contributes zero items. First-party coverage therefore comes from the team's
  YouTube uploads and the ticker's `@Commanders` posts rather than the news feed.
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

`.github/workflows/social.yml` runs the same build-and-deploy shape hourly,
but only `social` → `build` — never `collect` — because the ticker's beat
reporter updates go stale within the hour in a way article headlines don't.
The two workflows share a `concurrency: group: site-deploy` so their once-a-day
overlap at 08:00 UTC queues instead of racing on the same `git push`.

**This repo is private**, so GitHub Actions minutes aren't unlimited (2,000
free/month on standard runners). Hourly adds roughly 1,000-1,100 minutes/month
on top of the nightly job's ~60 — real, but under the free tier on its own.
If other Actions usage on this account starts crowding that budget, the fix is
a one-line change to `social.yml`'s cron (e.g. `0 */2 * * *` for every 2 hours
instead of every 1).

**The weekly digest is not part of this cron, on purpose.** GitHub's hosted
runners have no GPU and no Ollama, and — separately — auto-publish was a
deliberate non-goal (see Weekly AI digest, above). Run `npm run digest` and
`npm run digest:review` locally, commit `data/digests/<date>.json` once you
`npm run digest:approve` it, and push; the next `build` (local or in CI)
picks it up like any other committed data file.

> **Note on the token:** `NETLIFY_AUTH_TOKEN` is currently a personal Netlify
> CLI login token, which grants account-wide access rather than being scoped to
> this one site. Netlify's CLI can't mint a named token non-interactively. To
> narrow it, create a dedicated PAT in Netlify (User Settings → Applications)
> and replace the secret with `gh secret set NETLIFY_AUTH_TOKEN`.
