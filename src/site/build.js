import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCES } from '../../config/sources.js';
import { LOCAL_SPOTS } from '../../config/local-spots.js';
import { HERO_IMAGES, HERO_PINNED, HERO_CREDITS } from '../../config/hero-images.js';
import { writeBuildHash } from './build-hash.js';
import { log } from '../lib/log.js';
import { loadItems, sortedItems, loadSocial, sortedSocial } from '../lib/store.js';
import { loadRosterCache } from '../lib/roster.js';
import { loadDepthChartCache } from '../lib/depthchart.js';
import { loadScheduleCache } from '../lib/schedule.js';
import { parseGameTime, daysAgo } from '../lib/dates.js';
import { clusterItems } from '../lib/cluster.js';
import { loadBettingCache } from '../lib/betting.js';
import { loadInjuriesCache } from '../lib/injuries.js';
import { loadTeamStatsCache } from '../lib/teamstats.js';
import { loadStandingsCache } from '../lib/standings.js';
import { loadRefCrewCache, refCrewCard, refCrewPage } from '../lib/refcrew.js';
import { pollGame } from '../lib/predictions.js';
import { BEN_PICKS } from '../../config/predictions.js';
import { REF_NOTES } from '../../config/ref-notes.js';
import { isGameWindowActive } from '../lib/gamewindow.js';
import { loadLiveGameState } from '../lib/livegame.js';
import { buildRosterIndex, countMentions } from '../lib/roster-links.js';
import { ROSTER_ALIASES } from '../../config/roster-aliases.js';
import { listDigests } from '../digest/generate.js';
import { listPreviews } from '../digest/preview-generate.js';
import { listOriginals } from '../digest/originals.js';
import { listMondays } from '../digest/monday-generate.js';
import { renderPage, renderRss, renderSitemap, renderWeeklyIndex, renderWeeklyPost, renderPreviewPost, renderOriginalPost, renderMondayPost, renderPodcastsPage, renderVideosPage, renderMusicPage, renderHowItWorksPage, renderRosterPage, renderDepthChartPage, renderInjuryReportPage, renderContactPage, renderDonatePage, renderLocalSpotsPage, renderRefsPage, renderLeaderboardPage, renderCreditsPage, renderWireTapsPage, renderHailMailPage, renderAbroadPage, renderRollCallPage, renderFiveThousandPage, renderAboutPage, renderAdminPage, renderBeatWritersPage, renderSocialFeedPage, renderTvPage, blogRiverItems, liveGameRiverItem, PAGES } from './templates.js';

const DIST_DIR = path.resolve(process.env.DIST_DIR || 'dist');
const SITE_NAME = process.env.SITE_NAME || 'The Burgundy Wire';
// Production by default (Oct 28, 2026). This used to fall back to
// http://localhost:8080, and a build on any machine without SITE_URL set
// stamped that into every canonical, og:url, the sitemap, the feed and the
// structured data. One such build was deployed over the live site every
// morning for weeks (see docs/retire-work-pc-tasks.md). Links inside the
// pages are relative, so a local preview works fine with the real URL here.
// Set SITE_URL to override on purpose: SITE_URL=http://localhost:8080 npm run build
const SITE_URL = process.env.SITE_URL || 'https://theburgundywire.com';
const MAX_RIVER_ITEMS = Number(process.env.MAX_RIVER_ITEMS || 60);

/**
 * Ticker length. Both copies of the track are in the DOM, so this is doubled in
 * the markup — enough to fill a wide screen without bloating the page.
 */
const MAX_TICKER_POSTS = Number(process.env.MAX_TICKER_POSTS || 30);

/** How many clips the right-hand video rail carries. */
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 6);

/**
 * Sources whose links are YouTube watch URLs, flagged in config/sources.js
 * rather than matched on id here — adding a second channel should be a config
 * edit, not a code edit.
 */
const VIDEO_SOURCE_IDS = new Set(SOURCES.filter((s) => s.media === 'video').map((s) => s.id));

/** Each Film Room source's rule from config/sources.js: true, or a RegExp its titles have to match. */
const FILM_ROOM_RULES = new Map(SOURCES.filter((s) => s.filmRoom).map((s) => [s.id, s.filmRoom]));
const MAX_FILM_ROOM = 4;
/**
 * Mark Bullock posts a review most mornings and Beltway Football does one
 * postgame show a week, so without a per-source cap a single week of his
 * reviews would push the postgame show out of the box entirely.
 */
const MAX_FILM_ROOM_PER_SOURCE = 3;
/** A breakdown of a game two weeks gone isn't what anyone opening the box is after. */
const FILM_ROOM_MAX_AGE_DAYS = 10;

function filmRoomItems(sorted) {
  const perSource = new Map();
  const picked = [];
  for (const item of sorted) {
    const rule = FILM_ROOM_RULES.get(item.sourceId);
    if (!rule || (rule !== true && !rule.test(item.title))) continue;
    if (!item.publishedAt || daysAgo(item.publishedAt) > FILM_ROOM_MAX_AGE_DAYS) continue;
    const n = perSource.get(item.sourceId) || 0;
    if (n >= MAX_FILM_ROOM_PER_SOURCE) continue;
    perSource.set(item.sourceId, n + 1);
    picked.push(item);
    if (picked.length === MAX_FILM_ROOM) break;
  }
  return picked;
}

const HEADING = {
  'index.html': 'Latest headlines',
  'team-sources.html': 'Team source headlines',
  'national-coverage.html': 'National coverage',
};

/** How long a fresh Blog post holds the top of the river. */
const PIN_WINDOW_MS = Number(process.env.BLOG_PIN_HOURS || 24) * 60 * 60 * 1000;

/**
 * One hero photo per calendar day, the same for every reader that day rather
 * than a different one per page or per visit. Day-of-year modulo the pool
 * size, so a small pool repeats across the year instead of needing to keep
 * growing to stay "new". Exact UTC-vs-local-midnight edge cases don't matter
 * for a cosmetic background photo. A date in `pinned` (HERO_PINNED in
 * config/hero-images.js) skips the rotation for that one day.
 */
function heroImageForDate(pool, date, pinned = {}) {
  const pin = pinned[date.toISOString().slice(0, 10)];
  if (pin) return pin;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  return pool[dayOfYear % pool.length];
}

/**
 * Breakdowns of the team's press conferences and podcasts, written by hand
 * from YouTube's own transcripts and kept in data/video-notes.json, keyed by
 * YouTube video id. How they get made is in docs/how-everything-works.md
 * ("Video breakdowns"): YouTube refuses transcript requests from a build
 * server, and there's no model in the pipeline to summarize one anyway.
 * A missing file just means no breakdowns.
 */
async function loadVideoNotes() {
  try {
    return JSON.parse(await fs.readFile(path.resolve('data/video-notes.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Hangs each breakdown on its video's own item, so every place the video
 * shows up (the river card, the rail card, the Videos page) knows there's
 * one and can say so. Ben asked for exactly that: anywhere a video has a
 * breakdown, the reader should be able to tell.
 */
const BREAKDOWN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
function attachVideoNotes(items, notes) {
  return items.map((item) => {
    const id = (String(item.url || '').match(/[?&]v=([A-Za-z0-9_-]{11})/) || [])[1];
    return id && notes[id] ? { ...item, notes: { ...notes[id], id } } : item;
  });
}

/**
 * The ten newest of Ben's own posts, for the admin newsletter panel's "Start
 * from a post" picker: everything a Hail Mail email about the post needs,
 * with absolute URLs, since an email has no page to resolve a relative one
 * against.
 */
function newsletterPostsFor(originals, mondays, shareCards) {
  const entry = (record, file, cardKey, date) => {
    const card = shareCards[cardKey];
    return {
      title: record.title,
      url: `${SITE_URL}/${file}`,
      summary: record.summary || '',
      image: `${SITE_URL}/${card ? card.file : 'og-image.png'}`,
      alt: card ? card.alt : record.title,
      date,
    };
  };
  return [
    ...originals.map((r) => entry(r, `blog-original-${r.slug}.html`, `original-${r.slug}`, r.publishedAt)),
    ...mondays.map((r) => entry(r, `blog-monday-${r.key}.html`, `monday-${r.key}`, r.reviewedAt || r.generatedAt)),
  ]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10)
    .map(({ date, ...rest }) => rest);
}

/**
 * The next game still to be played, for abroad.html's "kickoff where you are"
 * line: { iso, opponent } or null in the offseason or between builds after the
 * last game. abroad.js hides the line itself once the kickoff has passed.
 */
function nextGameFor(games) {
  const now = Date.now();
  for (const g of games || []) {
    if (g.isBye || g.result) continue;
    const iso = parseGameTime(g.gametime);
    if (iso && Date.parse(iso) > now) return { iso, opponent: g.opponentShort || g.opponent || '' };
  }
  return null;
}

/** Where scripts/make-share-cards.mjs writes the cards and their manifest. */
const SHARE_DIR = 'src/site/assets/share';

/**
 * The share-card manifest ({ "original-<slug>": { file, w, h, alt } }), or an
 * empty map when no card has been made yet. Every post then shares with the
 * site's logo card, exactly as before cards existed.
 */
async function loadShareCards() {
  try {
    return JSON.parse(await fs.readFile(path.resolve(SHARE_DIR, 'cards.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`share cards: could not read cards.json: ${err.message}`);
    return {};
  }
}

/**
 * Hoist Blog posts published within the pin window to the front of the river,
 * then let them fall back into plain date order once it expires. A post takes
 * real effort to write and the wire moves faster than that: six aggregated
 * headlines on a busy morning would bury it before most readers arrive.
 *
 * `sorted` is already newest-first, so the pinned group keeps that order among
 * itself, and the pin flag is set on a copy rather than the stored item so
 * nothing about this presentation choice leaks back into data/items.json.
 */
function pinFreshBlogPosts(sorted, now) {
  const pinned = [];
  const rest = [];
  for (const item of sorted) {
    const fresh =
      item.sourceId === 'blog' && item.publishedAt
      // A post can ask to stay up longer than the default. Used sparingly:
      // a win over the reigning champions is worth more than a day at the
      // top, a routine recap is not.
      && now - Date.parse(item.publishedAt) < (Number(item.pinHours) > 0 ? item.pinHours * 3600000 : PIN_WINDOW_MS);
    if (fresh) pinned.push({ ...item, pinned: true });
    else rest.push(item);
  }
  return [...pinned, ...rest];
}

export async function buildSite() {
  const items = await loadItems();

  // Only status: 'published' ever reaches dist/ — a draft awaiting review, or
  // one that failed review, must never appear on the live site. See
  // src/digest/ for the generation and review gate that sets this field.
  const publishedDigests = (await listDigests())
    .filter((d) => d.status === 'published')
    .sort((a, b) => b.week.localeCompare(a.week));
  const publishedPreviews = (await listPreviews())
    .filter((p) => p.status === 'published')
    .sort((a, b) => b.gameKey.localeCompare(a.gameKey));
  const publishedOriginals = (await listOriginals())
    .filter((o) => o.status === 'published')
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const publishedMondays = (await listMondays())
    .filter((m) => m.status === 'published')
    .sort((a, b) => b.key.localeCompare(a.key));

  // liveGame must be loaded first so its river item can be included here.
  const liveGame = await loadLiveGameState();
  const liveItem = liveGameRiverItem(liveGame);

  // Published Blog posts compete for river placement on their own publish
  // date, same as any other item, once their pin window (below) has expired.
  const blogItems = [
    ...blogRiverItems(publishedDigests, publishedPreviews, publishedOriginals, publishedMondays),
    ...(liveItem ? [liveItem] : []),
  ];

  // A future publishedAt silently defeats that "compete on your own date"
  // rule: the river sorts on this field, so a post dated ahead of now
  // outranks every real headline until the clock catches up, and
  // relativeLabel() reads it as "just now" the whole time (negative minutes
  // fall through its < 1 branch) — so it looks freshly posted rather than
  // wrong. Both hand-written posts so far were stamped with a round
  // hour that landed in the future, which is exactly the mistake this
  // catches. Warn rather than clamp or hide: clamping to build time still
  // pins it to the top, and hiding it would silently un-publish a post
  // someone believed was live.
  const nowIso = new Date().toISOString();
  const futureBlog = blogItems.filter((b) => b.publishedAt && b.publishedAt > nowIso);
  for (const b of futureBlog) {
    log.warn(`build: ${b.id} is dated ${b.publishedAt}, in the future — it will sit above every real headline until then`);
  }
  const itemsWithBlog = { ...items, ...Object.fromEntries(blogItems.map((b) => [b.id, b])) };

  // Each page is capped to its most recent N rather than rendering the full
  // backlog the store has accumulated since the last prune.
  const allSorted = attachVideoNotes(sortedItems(itemsWithBlog), await loadVideoNotes());
  // Pin before capping, so a fresh post can't be cut by MAX_RIVER_ITEMS on the
  // way to the top. allSorted stays in pure date order for the video rail and
  // mention counts below, neither of which should see the pinned reordering.
  const sorted = pinFreshBlogPosts(allSorted, Date.now()).slice(0, MAX_RIVER_ITEMS);
  const allSocial = sortedSocial(await loadSocial());
  const socialPosts = allSocial.slice(0, MAX_TICKER_POSTS);
  // Drawn from the whole store, not the capped river — the rail shouldn't empty
  // out just because a busy news week pushed the clips past MAX_RIVER_ITEMS.
  const videos = allSorted.filter((item) => VIDEO_SOURCE_IDS.has(item.sourceId)).slice(0, MAX_VIDEOS);
  // Every breakdown from the last two weeks, for the Videos page. The rail
  // only holds the six newest uploads, and the team posts enough that a
  // Wednesday press conference has rolled off it by Sunday, well before its
  // breakdown stops being worth reading.
  const breakdowns = allSorted.filter(
    (item) => item.notes && VIDEO_SOURCE_IDS.has(item.sourceId) && Date.now() - Date.parse(item.publishedAt) < BREAKDOWN_WINDOW_MS,
  );
  const generatedAt = new Date().toISOString();

  // Null (not an empty index) when the cache is empty, so linkPlayers()
  // degrades to plain escaped text instead of matching against nothing.
  const rosterPlayers = await loadRosterCache();
  const rosterIndex = rosterPlayers.length ? buildRosterIndex(rosterPlayers, ROSTER_ALIASES) : null;
  const depthChart = await loadDepthChartCache();
  const injuries = await loadInjuriesCache();
  // Full store, not the capped river — a player's mention count shouldn't
  // shrink just because a busy week pushed their one story past MAX_RIVER_ITEMS.
  const mentionCounts = countMentions(allSorted, rosterIndex);
  const games = await loadScheduleCache();
  const betting = await loadBettingCache();
  // Null when `npm run team-stats` has never run (or its last run failed), and
  // the sidebar then omits the widget entirely rather than rendering an empty
  // shell. Leaders are already part of this cache (see fetchTeamStats() in
  // teamstats.js) — fetched from ESPN's own team-scoped leaders endpoint,
  // not derived from the current roster.
  const teamStats = await loadTeamStatsCache();
  // Null when `npm run standings` has never run — same never-render-an-empty-
  // shell rule as teamStats above.
  const standings = await loadStandingsCache();
  const isGameLive = isGameWindowActive(games);
  // The sidebar's next-game boxes and the Film Room (see sidebar() in
  // templates.js), bundled so every page passes one more thing rather than
  // three. Each part is null or empty when it has nothing to say, and its box
  // then doesn't render.
  const nextPoll = pollGame(games);
  const refCache = await loadRefCrewCache();
  const gameWeek = {
    filmRoom: filmRoomItems(allSorted),
    refCrew: refCrewCard(refCache, games),
    poll: nextPoll ? { ...nextPoll, benPick: BEN_PICKS[nextPoll.key] || null } : null,
  };
  // liveGame already loaded above for river item inclusion.

  // The Blog tab/page exist if there's a weekly recap, a preview, an
  // original post, or a live game post — a game-day-only blog (no weekly
  // digest ever approved yet) should still be reachable, not hidden behind
  // the weekly gate.
  const hasWeekly = publishedDigests.length > 0 || publishedPreviews.length > 0 || publishedOriginals.length > 0 || publishedMondays.length > 0 || Boolean(liveGame?.entries?.length);

  await fs.mkdir(DIST_DIR, { recursive: true });

  // Each page's river folds duplicate coverage of a story into one card (see
  // src/lib/cluster.js), drawn from a wider pool than it shows so that folding
  // makes room for more stories instead of a shorter page. RSS below keeps one
  // entry per article.
  const riverPool = pinFreshBlogPosts(allSorted, Date.now()).slice(0, MAX_RIVER_ITEMS * 2);
  for (const page of PAGES) {
    const filtered = clusterItems(riverPool.filter(page.match), { players: rosterPlayers }).slice(0, MAX_RIVER_ITEMS);
    const html = renderPage(filtered, {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      sources: SOURCES,
      generatedAt,
      activeFile: page.file,
      heading: HEADING[page.file],
      socialPosts,
      videos,
      games,
      betting,
      teamStats,
      standings,

      gameWeek,
      hasWeekly,
      isGameLive,
      rosterIndex,
    });
    await fs.writeFile(path.join(DIST_DIR, page.file), html, 'utf8');
  }

  // Link-preview cards from scripts/make-share-cards.mjs, keyed by post (and
  // hail-mail.html). A page without one (a post published before the script
  // was run for it) shares with the site's logo card instead, so a missing
  // card never breaks a page.
  const shareCards = await loadShareCards();

  if (hasWeekly) {
    // "Blog" is the reader-facing name and URL only — the underlying digest
    // pipeline, `npm run digest`, and `data/digests/<week>.json` are still
    // "weekly" internally, since posts may cover a single game day now but
    // generation/review/approve didn't change.
    const opts = { siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, rosterIndex, videos, games, betting, teamStats, standings, gameWeek, isGameLive, liveGame };
    await fs.writeFile(
      path.join(DIST_DIR, 'blog.html'),
      renderWeeklyIndex(publishedDigests, { ...opts, previewRecords: publishedPreviews, originalRecords: publishedOriginals, mondayRecords: publishedMondays }),
      'utf8',
    );
    for (const record of publishedDigests) {
      await fs.writeFile(path.join(DIST_DIR, `blog-${record.week}.html`), renderWeeklyPost(record, opts), 'utf8');
    }
    for (const record of publishedPreviews) {
      await fs.writeFile(path.join(DIST_DIR, `blog-preview-${record.gameKey}.html`), renderPreviewPost(record, opts), 'utf8');
    }
    for (const record of publishedOriginals) {
      const shareImage = shareCards[`original-${record.slug}`] || null;
      await fs.writeFile(path.join(DIST_DIR, `blog-original-${record.slug}.html`), renderOriginalPost(record, { ...opts, shareImage }), 'utf8');
    }
    for (const record of publishedMondays) {
      const shareImage = shareCards[`monday-${record.key}`] || null;
      await fs.writeFile(path.join(DIST_DIR, `blog-monday-${record.key}.html`), renderMondayPost(record, { ...opts, shareImage }), 'utf8');
    }
  }

  await fs.writeFile(
    path.join(DIST_DIR, 'podcasts.html'),
    renderPodcastsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting, teamStats, standings, gameWeek }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'videos.html'),
    renderVideosPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, breakdowns, games, betting, teamStats, standings, gameWeek }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'how-it-works.html'),
    renderHowItWorksPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting, teamStats, standings, gameWeek }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'roster.html'),
    renderRosterPage({
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      sources: SOURCES,
      generatedAt,
      hasWeekly,
      isGameLive,
      videos,
      games,
      betting,
      teamStats,
      standings,

      gameWeek,
      rosterPlayers,
      mentionCounts,
    }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'depth-chart.html'),
    renderDepthChartPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, depthChart }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'injury-report.html'),
    renderInjuryReportPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, injuries }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'contact.html'),
    renderContactPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  // Not in PAGES/HEADING or any nav link yet (2026-09-11) — reachable by
  // direct URL only, for an initial Reddit-driven test before it gets a
  // permanent home in the nav/footer.
  await fs.writeFile(
    path.join(DIST_DIR, 'wiretaps.html'),
    renderWireTapsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  // Not in PAGES/HEADING or any nav link — a lobby/TV display mode reached
  // by its own URL, not a page a reader browses to. allSocial (the full
  // pool), not the ticker's own capped socialPosts — more variety to rotate
  // through over the hours this is meant to stay open.
  await fs.writeFile(
    path.join(DIST_DIR, 'tv.html'),
    renderTvPage({ siteName: SITE_NAME, siteUrl: SITE_URL, socialPosts: allSocial }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'abroad.html'),
    renderAbroadPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, nextGame: nextGameFor(games) }),
    'utf8',
  );

  // The author page every post's byline links to.
  await fs.writeFile(
    path.join(DIST_DIR, 'about.html'),
    renderAboutPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  // Linked from Hail Mail rather than the nav: noindex, and not in the
  // sitemap below.
  await fs.writeFile(
    path.join(DIST_DIR, 'roll-call.html'),
    renderRollCallPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  // Unlisted, like tv.html: only the reader behind the 5,000th pageview gets
  // sent here (see claimMilestone() in netlify/functions/track.js), so it's
  // left out of the sitemap below and disallowed in robots.txt.
  await fs.writeFile(
    path.join(DIST_DIR, 'five-thousand.html'),
    renderFiveThousandPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'hail-mail.html'),
    renderHailMailPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, shareImage: shareCards['page-hail-mail'] || null }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'donate.html'),
    renderDonatePage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'cville.html'),
    renderLocalSpotsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, spots: LOCAL_SPOTS }),
    'utf8',
  );

  // The ref card as its own page, for the weekly "who's reffing" search (see
  // renderRefsPage()). Linked from the card itself, and in the sitemap. The
  // tables under the answer come from refCrewPage(), the same cache in the
  // same pass as the card.
  const refCard = gameWeek.refCrew;
  const refWeek = refCard?.assignment?.week || refCard?.nextWeek;
  await fs.writeFile(
    path.join(DIST_DIR, 'whos-reffing.html'),
    renderRefsPage({
      siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive,
      refCrew: refCard,
      page: refCrewPage(refCache, games),
      poll: gameWeek.poll,
      note: refCard && refWeek ? REF_NOTES[`${refCard.season}-${refWeek}`] || null : null,
    }),
    'utf8',
  );

  // The poll's season standings as a page (renderLeaderboardPage()), filled
  // in by site.js from the predictions function.
  await fs.writeFile(
    path.join(DIST_DIR, 'leaderboard.html'),
    renderLeaderboardPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, poll: gameWeek.poll }),
    'utf8',
  );

  // Who took the header photos (renderCreditsPage()). Linked from the footer.
  await fs.writeFile(
    path.join(DIST_DIR, 'credits.html'),
    renderCreditsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, heroes: HERO_IMAGES, credits: HERO_CREDITS }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'music.html'),
    renderMusicPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'admin.html'),
    renderAdminPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, newsletterPosts: newsletterPostsFor(publishedOriginals, publishedMondays, shareCards) }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'beat-writers.html'),
    renderBeatWritersPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, socialPosts: allSocial }),
    'utf8',
  );

  // A reader-requested "just the social posts, chronologically" view.
  // Deliberately not a top-nav tab — linked inline from the river heading
  // instead (see the river-heading-group in renderPage()), since that's
  // the exact spot readers asked for it.
  await fs.writeFile(
    path.join(DIST_DIR, 'social-feed.html'),
    renderSocialFeedPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, socialPosts: allSocial, videos, games, betting, teamStats, standings, gameWeek }),
    'utf8',
  );

  // Two feeds. feed.xml is Ben's own posts, the one feed readers and feed
  // directories should subscribe to; it used to mix 59 publisher headlines in
  // with them, so subscribing to "The Burgundy Wire" got you mostly other
  // people's work. river.xml keeps the old everything-feed for anyone who
  // wants the river in a reader.
  const ownPosts = allSorted.filter((item) => item.sourceId === 'blog');
  await fs.writeFile(
    path.join(DIST_DIR, 'river.xml'),
    renderRss(sorted, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt, feedPath: 'river.xml', title: `${SITE_NAME}: every Commanders headline`, description: 'Every Washington Commanders headline The Burgundy Wire collects, each linking to the publisher.' }),
    'utf8',
  );
  const rss = renderRss(ownPosts, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt, feedPath: 'feed.xml', title: SITE_NAME, description: 'Posts from Ben, a lifelong Washington Commanders fan in Charlottesville, Virginia.' });
  await fs.writeFile(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

  // Every real page just written above, for Search Console to crawl from —
  // not admin.html or tv.html, which robots.txt below excludes from
  // crawling entirely (neither is a page a reader browses to).
  // Not the pages that only list other people's work (team-sources,
  // national-coverage, podcasts, videos, beat-writers, social-feed, donate):
  // those carry noindex (RIVER_NOINDEX in templates.js), and a sitemap listing
  // a noindexed page sends Google mixed signals.
  const staticPaths = [
    'index.html', 'about.html', 'how-it-works.html', 'roster.html',
    'depth-chart.html', 'injury-report.html', 'contact.html',
    'music.html', 'cville.html', 'wiretaps.html', 'hail-mail.html',
    'whos-reffing.html', 'leaderboard.html',
  ];
  const sitemapEntries = [
    ...staticPaths.map((p) => ({ path: p, lastmod: generatedAt })),
    ...(hasWeekly ? [{ path: 'blog.html', lastmod: generatedAt }] : []),
    ...publishedDigests.map((r) => ({ path: `blog-${r.week}.html`, lastmod: r.reviewedAt || r.generatedAt })),
    ...publishedPreviews.map((r) => ({ path: `blog-preview-${r.gameKey}.html`, lastmod: r.reviewedAt || r.generatedAt })),
    ...publishedOriginals.map((r) => ({ path: `blog-original-${r.slug}.html`, lastmod: r.publishedAt })),
    ...publishedMondays.map((r) => ({ path: `blog-monday-${r.key}.html`, lastmod: r.reviewedAt || r.generatedAt })),
  ];
  await fs.writeFile(path.join(DIST_DIR, 'sitemap.xml'), renderSitemap(sitemapEntries, { siteUrl: SITE_URL }), 'utf8');
  await fs.writeFile(
    path.join(DIST_DIR, 'robots.txt'),
    `User-agent: *\nDisallow: /admin.html\nDisallow: /tv.html\nDisallow: /five-thousand.html\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'utf8',
  );

  // Not a blind copy like the rest of this list: the hero background photo
  // (see the comment above .hero in site.css) is picked here and appended as
  // an override rule, since site.css itself has no templating step of its
  // own and this is the one value in it that changes per build.
  const heroCss = await fs.readFile(path.resolve('src/site/assets/site.css'), 'utf8');
  const heroUrl = heroImageForDate(HERO_IMAGES, new Date(generatedAt), HERO_PINNED);
  await fs.writeFile(
    path.join(DIST_DIR, 'site.css'),
    // Targets ::before, the photo layer, not .hero itself: the photo lives on
    // its own layer now so it can drift under the scrim (see .hero in
    // site.css).
    `${heroCss}\n.hero::before{ background-image: url('${heroUrl}'); }\n`,
    'utf8',
  );

  for (const asset of [
    'site.js',
    // Translations and the survey for readers outside the US. site.js loads
    // it only for them; abroad.html includes it directly.
    'abroad.js',
    'logo.png',
    'og-image.png',
    'apple-touch-icon.png',
    'favicon-32.png',
    'favicon-16.png',
    'icon-192.png',
    'icon-512.png',
    'site.webmanifest',
    // A screenshot of the footer's Warpath callout, hosted here so the link
    // shared on their forum lives on this domain rather than a third-party
    // image host that can expire it.
    'warpath-shoutout.png',
  ]) {
    await fs.copyFile(path.resolve('src/site/assets', asset), path.join(DIST_DIR, asset));
  }

  // The hype songs and their cover art, recursive since it's a whole
  // subfolder rather than the single flat files handled above.
  await fs.cp(path.resolve('src/site/assets/music'), path.join(DIST_DIR, 'music'), { recursive: true });

  // Ben's own photos, referenced as photos/<file> by the `photos` map on a
  // Blog record. Same recursive copy as music/ for the same reason: it's a
  // folder that grows, and listing each file above would mean a code edit
  // every time a post gets a new picture. dimensions.json rides along
  // harmlessly; it's the build-time record of what process-photos.sh emitted.
  await fs.cp(path.resolve('src/site/assets/photos'), path.join(DIST_DIR, 'photos'), { recursive: true });

  // The share cards themselves. bg/ (the stock backgrounds the script draws
  // on) and cards.json (read above) are build inputs, not things a reader
  // ever fetches, so they stay out of dist/.
  await fs
    .cp(path.resolve(SHARE_DIR), path.join(DIST_DIR, 'share'), {
      recursive: true,
      filter: (src) => path.basename(src) !== 'bg' && path.basename(src) !== 'cards.json',
    })
    .catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });

  // Same again for the occasional video clip (scripts/process-videos.sh).
  // The directory only exists once something has been encoded into it, so a
  // checkout that has never run that script must not fail the build here.
  await fs
    .cp(path.resolve('src/site/assets/videos'), path.join(DIST_DIR, 'videos'), { recursive: true })
    .catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });

  // Last, once everything else is in place: the fingerprint the workflows
  // compare with the live site before deciding to deploy (see build-hash.js).
  const buildHash = await writeBuildHash(DIST_DIR, path.resolve('.'));

  log.ok(
    `built dist/ (${buildHash.slice(0, 10)}): ${sorted.length} item(s) across ${PAGES.length} page(s), ` +
      `${socialPosts.length} ticker post(s), ${videos.length} video(s), ${publishedDigests.length} weekly recap(s)`,
  );
  return { count: sorted.length, social: socialPosts.length, videos: videos.length, digests: publishedDigests.length };
}
