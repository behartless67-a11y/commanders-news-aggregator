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

### Link previews: `summary` and the share card

What a post looks like when it's pasted into X, Facebook, iMessage, Slack or a Google result. Both apply to originals and Mondays.

- **`summary`**: one plain line, about 150 characters, saying what the post is actually about (the opponent, the topic). It becomes the search snippet and the preview text. The opening line stays on the river card, since that's where the voice is, but it's usually a joke that needs the rest of the post, which makes it a weak search snippet. No summary means the opening lines get used instead.
- **Share card**: a 1200x630 image with the post's photo, the logo and the headline. After publishing (or retitling) a post, run `npm run share-cards <slug-or-date>` and commit what it writes to `src/site/assets/share/`. It needs ffmpeg, so it runs on your machine, not in GitHub Actions. A post with no card still shares, just with the plain logo image.
- **Choosing the photo**: `"share": { "background": "<photo key>" }` picks one of the post's own photos. Otherwise it uses the post's first photo, and if the post has none, one of three stadium shots (`bowl`, `huddle`, `pregame`). `"focusY"` (0 top, 1 bottom) moves the crop, so faces sit above the headline.

After a deploy, Facebook may still show an old preview it cached. Paste the link into the [Sharing Debugger](https://developers.facebook.com/tools/debug/) and hit "Scrape Again".

### Scheduling a post

Set `status: "scheduled"` and a future `publishedAt`. Nothing renders a non-published record, so it stays invisible until `scheduled.yml` picks it up on the hour and publishes it. Posts pin to the top of the river for 24 hours from their `publishedAt`, so a post scheduled for 7am pins from 7am, not from whenever the workflow fired.

Only originals can be scheduled. Digests and Mondays have review gates, and a post that publishes itself on a timer is exactly what those gates exist to prevent.

---

## Hail Mail Newsletter

**What it is:** A weekly email newsletter sent to subscribers. Different voice from the blog — more unhinged, more personal, can swear. Think "group chat if the whole list got accidentally CC'd."

**Subscribers** live in Netlify Blobs under the `subscribers` store, keys like `sub:email@example.com`. The live list and count are in the admin panel.

**To send:** admin panel → Newsletter → paste subject and body HTML → "Send test to me" first, then "Send to all subscribers."

**Sending a post (the Friday pregame send):** in the Newsletter panel, pick it from "Start from a post." That fills the subject with the title and the body with the post's share card, its summary and a "Read it on the site" button, under a bracketed placeholder line at the top. Replace that line with whatever you want to say (it's the part that's you), send a test, then send for real. The real send refuses to go out while the placeholder is still there.

**Where people sign up:**
- **theburgundywire.com/hail-mail.html**: the link to text people (the bar crew, the tailgate group) and the target for any QR code. Signing up is the only thing on it.
- **The end of every post**: a short signup box under each original and Monday post, since that's where someone landing from a shared link finishes reading.
- **The homepage**: the floating bar, and the popup on every 10th visit.
- **The footer**: "Hail Mail (email)" under Subscribe, on every page.

All of them feed the same list.

**From:** newsletter@theburgundywire.com (domain verified in Resend). **Unsubscribes** are automatic via one-click links. **If UVA email blocks it:** ask recipients to whitelist the address. Gmail is fine.

---

## Wire Taps (the mailbag)

Reader questions, submitted at theburgundywire.com/wiretaps. Anonymous is allowed and the page promises it, so an empty name stays empty.

Submissions land in the `wiretaps` blob store and appear in the admin panel under **Wire Taps mailbag**, newest first.

Worth knowing: Netlify keeps its own copy of every form submission regardless of what our code does. That's the only reason the first questions weren't lost during the period when `submission-created.js` only knew about the newsletter form and silently ignored everything else. If the panel ever looks empty and you think it shouldn't, check Netlify's own Forms tab before assuming they're gone.

---

## Readers Abroad (the international hello)

Readers outside the US get a short note under the header, in their own language, thanking them for visiting and inviting them to write in. It links to **abroad.html**, a survey translated into 15 languages (with a switcher), their country filled in and this week's kickoff shown in their own time zone. Answers show up in the admin panel under **Readers abroad**.

- **How it knows:** the visit tracker already gets each reader's country from Netlify; it now just sends the country code back to the page. Nothing new is stored. US readers never see the note or download the translations (`src/site/assets/abroad.js`).
- **Language:** the reader's browser language first, then their country, then English.
- **One and done:** the × hides it for good on that browser, and so does sending the survey.
- **To see it yourself:** add `?country=DE&lang=de` (or `?country=MX&lang=es`, `?country=JP&lang=ja`) to any page URL.
- **Editing the copy:** all the text, in every language, lives in `STRINGS` at the top of `abroad.js`. No em dashes in any language.

---

## The game-week sidebar (Film Room, ref card, Call your shot)

Three boxes added in October 2026, all ideas that came from reading r/Commanders.

### Film Room (top of the video column)

The newest breakdowns, because a fan on the sub asked where any real analysis of the London game was and got told the national shows ignore Washington. Up to four items from the last 10 days, at most three from any one source.

- **Who's in it:** any source with `filmRoom` set in `config/sources.js`. Right now that's Mark Bullock's film reviews (everything except his game threads) and Beltway Football's postgame show. `filmRoomLabel` is the small line under each item.
- **Adding someone:** give their source `filmRoom: true` (every item) or a pattern their titles have to match.

### The ref card (top of the stats column)

Who has the next game and how many flags his crews throw, plus our last game's flags and our season rate.

- **The assignment** comes from Football Zebras, which posts every week's referees on **Tuesday**. Before that the card just says the crew is announced Tuesday.
- **The numbers** come from ESPN: every finished game's referee and both teams' accepted penalties, this season and last. Each game is fetched once and kept in `data/refcrew.json`, so after the first big backfill a nightly run only reads that week's games.
- **Ranks** only include referees with 5 or more games, so a new ref shows his numbers with "too few to rank him yet."
- **Refresh by hand:** `npm run ref-crew`. It's in the nightly job, after team stats.

### Call your shot (the reader score poll)

Readers pick the score of the next game. After they vote they see their pick and the crowd's: the typical score (a median, so one 99-0 joker can't move it), the share picking a win, and how many picks are in.

- **Opens and closes on its own:** always the next game, and the form disappears at kickoff. After kickoff the card shows the locked-in crowd pick until the final score lands in the schedule.
- **Your number:** add it to `config/predictions.js` when your pregame post goes up, like `'2026-10-11-NYG': { commanders: 24, opponent: 17 }`. Until then the card says your number drops in the pregame post. The key is the kickoff date and the opponent's abbreviation.
- **Where picks go:** the `predictions` blob store. Each pick is one blob whose name is the pick (`2026-10-11-NYG/24-17/<id>`), so adding up a game is a single listing. `netlify/functions/predictions.js` serves the totals, cached for a minute.
- **One per browser:** remembered in the reader's browser, the same way the newsletter popup remembers a signup. The server only accepts picks for the game that's open, before kickoff.
- **Can't test it locally:** the dev server has no Netlify Functions, so locally you only see the form and "Your call." The crowd numbers only show up on the live site.

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

**Added October 2026, from what r/Commanders reads:** The Athletic's whole Commanders section (filtered, since it carries league-wide power rankings too; Nicki's own pieces keep her byline because her feed is listed first), Bullock's Film Room (Mark Bullock's Substack film reviews), and Beltway Football (JP Finlay and Mitch Tischler's Monumental Sports Network show, each new episode).

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
| `config/predictions.js` | Your own score for each game, shown under the reader poll |
| `src/lib/refcrew.js` | Ref crew card: Football Zebras assignment + ESPN flag counts |
| `src/lib/predictions.js` | Reader poll: which game is open, the pick format, the crowd math |
| `netlify/functions/predictions.js` | The crowd's pick for a game, for the poll card |
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
npm run share-cards    # make link-preview cards (add a slug or date for one post)
npm run collect        # fetch news now
npm run team-stats     # refresh the Team Stats widget
npm run ref-crew       # refresh the ref card (next game's referee + flag counts)
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
