import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCES } from '../../config/sources.js';
import { log } from '../lib/log.js';
import { loadItems, sortedItems, loadSocial, sortedSocial } from '../lib/store.js';
import { loadRosterCache } from '../lib/roster.js';
import { loadDepthChartCache } from '../lib/depthchart.js';
import { loadScheduleCache } from '../lib/schedule.js';
import { loadBettingCache } from '../lib/betting.js';
import { loadInjuriesCache } from '../lib/injuries.js';
import { loadTeamStatsCache } from '../lib/teamstats.js';
import { loadStandingsCache } from '../lib/standings.js';
import { isGameWindowActive } from '../lib/gamewindow.js';
import { loadLiveGameState } from '../lib/livegame.js';
import { buildRosterIndex, countMentions } from '../lib/roster-links.js';
import { ROSTER_ALIASES } from '../../config/roster-aliases.js';
import { listDigests } from '../digest/generate.js';
import { listPreviews } from '../digest/preview-generate.js';
import { listOriginals } from '../digest/originals.js';
import { listMondays } from '../digest/monday-generate.js';
import { renderPage, renderRss, renderSitemap, renderWeeklyIndex, renderWeeklyPost, renderPreviewPost, renderOriginalPost, renderMondayPost, renderPodcastsPage, renderVideosPage, renderMusicPage, renderHowItWorksPage, renderRosterPage, renderDepthChartPage, renderInjuryReportPage, renderContactPage, renderDonatePage, renderAdminPage, renderBeatWritersPage, renderSocialFeedPage, renderTvPage, blogRiverItems, liveGameRiverItem, PAGES } from './templates.js';

const DIST_DIR = path.resolve(process.env.DIST_DIR || 'dist');
const SITE_NAME = process.env.SITE_NAME || 'The Burgundy Wire';
const SITE_URL = process.env.SITE_URL || 'http://localhost:8080';
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

const HEADING = {
  'index.html': 'Latest headlines',
  'team-sources.html': 'Team source headlines',
  'national-coverage.html': 'National coverage',
};

/** How long a fresh Blog post holds the top of the river. */
const PIN_WINDOW_MS = Number(process.env.BLOG_PIN_HOURS || 24) * 60 * 60 * 1000;

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
      item.sourceId === 'blog' && item.publishedAt && now - Date.parse(item.publishedAt) < PIN_WINDOW_MS;
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
  const allSorted = sortedItems(itemsWithBlog);
  // Pin before capping, so a fresh post can't be cut by MAX_RIVER_ITEMS on the
  // way to the top. allSorted stays in pure date order for the video rail and
  // mention counts below, neither of which should see the pinned reordering.
  const sorted = pinFreshBlogPosts(allSorted, Date.now()).slice(0, MAX_RIVER_ITEMS);
  const allSocial = sortedSocial(await loadSocial());
  const socialPosts = allSocial.slice(0, MAX_TICKER_POSTS);
  // Drawn from the whole store, not the capped river — the rail shouldn't empty
  // out just because a busy news week pushed the clips past MAX_RIVER_ITEMS.
  const videos = allSorted.filter((item) => VIDEO_SOURCE_IDS.has(item.sourceId)).slice(0, MAX_VIDEOS);
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
  // liveGame already loaded above for river item inclusion.

  // The Blog tab/page exist if there's a weekly recap, a preview, an
  // original post, or a live game post — a game-day-only blog (no weekly
  // digest ever approved yet) should still be reachable, not hidden behind
  // the weekly gate.
  const hasWeekly = publishedDigests.length > 0 || publishedPreviews.length > 0 || publishedOriginals.length > 0 || publishedMondays.length > 0 || Boolean(liveGame?.entries?.length);

  await fs.mkdir(DIST_DIR, { recursive: true });

  for (const page of PAGES) {
    const filtered = sorted.filter(page.match);
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
      hasWeekly,
      isGameLive,
      rosterIndex,
    });
    await fs.writeFile(path.join(DIST_DIR, page.file), html, 'utf8');
  }

  if (hasWeekly) {
    // "Blog" is the reader-facing name and URL only — the underlying digest
    // pipeline, `npm run digest`, and `data/digests/<week>.json` are still
    // "weekly" internally, since posts may cover a single game day now but
    // generation/review/approve didn't change.
    const opts = { siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, rosterIndex, videos, games, betting, teamStats, standings, isGameLive, liveGame };
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
      await fs.writeFile(path.join(DIST_DIR, `blog-original-${record.slug}.html`), renderOriginalPost(record, opts), 'utf8');
    }
    for (const record of publishedMondays) {
      await fs.writeFile(path.join(DIST_DIR, `blog-monday-${record.key}.html`), renderMondayPost(record, opts), 'utf8');
    }
  }

  await fs.writeFile(
    path.join(DIST_DIR, 'podcasts.html'),
    renderPodcastsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting, teamStats, standings }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'videos.html'),
    renderVideosPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting, teamStats, standings }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'how-it-works.html'),
    renderHowItWorksPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting, teamStats, standings }),
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
    path.join(DIST_DIR, 'donate.html'),
    renderDonatePage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'music.html'),
    renderMusicPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'admin.html'),
    renderAdminPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt }),
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
    renderSocialFeedPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, socialPosts: allSocial, videos, games, betting, teamStats, standings }),
    'utf8',
  );

  const rss = renderRss(sorted, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt });
  await fs.writeFile(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

  // Every real page just written above, for Search Console to crawl from —
  // not admin.html or tv.html, which robots.txt below excludes from
  // crawling entirely (neither is a page a reader browses to).
  const staticPaths = [
    'index.html', 'team-sources.html', 'national-coverage.html',
    'podcasts.html', 'videos.html', 'how-it-works.html', 'roster.html',
    'depth-chart.html', 'injury-report.html', 'contact.html', 'donate.html',
    'music.html', 'beat-writers.html',
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
    `User-agent: *\nDisallow: /admin.html\nDisallow: /tv.html\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'utf8',
  );

  for (const asset of [
    'site.css',
    'site.js',
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

  log.ok(
    `built dist/ — ${sorted.length} item(s) across ${PAGES.length} page(s), ` +
      `${socialPosts.length} ticker post(s), ${videos.length} video(s), ${publishedDigests.length} weekly recap(s)`,
  );
  return { count: sorted.length, social: socialPosts.length, videos: videos.length, digests: publishedDigests.length };
}
