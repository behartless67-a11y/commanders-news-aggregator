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
import { isGameWindowActive } from '../lib/gamewindow.js';
import { loadLiveGameState } from '../lib/livegame.js';
import { buildRosterIndex, countMentions } from '../lib/roster-links.js';
import { ROSTER_ALIASES } from '../../config/roster-aliases.js';
import { listDigests } from '../digest/generate.js';
import { listPreviews } from '../digest/preview-generate.js';
import { listOriginals } from '../digest/originals.js';
import { renderPage, renderRss, renderSitemap, renderWeeklyIndex, renderWeeklyPost, renderPreviewPost, renderOriginalPost, renderPodcastsPage, renderVideosPage, renderMusicPage, renderHowItWorksPage, renderRosterPage, renderDepthChartPage, renderInjuryReportPage, renderContactPage, renderDonatePage, renderAdminPage, renderBeatWritersPage, renderSocialFeedPage, blogRiverItems, PAGES } from './templates.js';

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

  // Published Blog posts compete for river placement on their own publish
  // date, same as any other item — not pinned above or below real headlines.
  const blogItems = blogRiverItems(publishedDigests, publishedPreviews, publishedOriginals);
  const itemsWithBlog = { ...items, ...Object.fromEntries(blogItems.map((b) => [b.id, b])) };

  // Each page is capped to its most recent N rather than rendering the full
  // backlog the store has accumulated since the last prune.
  const allSorted = sortedItems(itemsWithBlog);
  const sorted = allSorted.slice(0, MAX_RIVER_ITEMS);
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
  const isGameLive = isGameWindowActive(games);
  const liveGame = await loadLiveGameState();

  // The Blog tab/page exist if there's a weekly recap, a preview, an
  // original post, or a live game post — a game-day-only blog (no weekly
  // digest ever approved yet) should still be reachable, not hidden behind
  // the weekly gate.
  const hasWeekly = publishedDigests.length > 0 || publishedPreviews.length > 0 || publishedOriginals.length > 0 || Boolean(liveGame?.entries?.length);

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
    const opts = { siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, rosterIndex, videos, games, betting, isGameLive, liveGame };
    await fs.writeFile(
      path.join(DIST_DIR, 'blog.html'),
      renderWeeklyIndex(publishedDigests, { ...opts, previewRecords: publishedPreviews, originalRecords: publishedOriginals }),
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
  }

  await fs.writeFile(
    path.join(DIST_DIR, 'podcasts.html'),
    renderPodcastsPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'videos.html'),
    renderVideosPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting }),
    'utf8',
  );

  await fs.writeFile(
    path.join(DIST_DIR, 'how-it-works.html'),
    renderHowItWorksPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, videos, games, betting }),
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
    renderSocialFeedPage({ siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, hasWeekly, isGameLive, socialPosts: allSocial, videos, games, betting }),
    'utf8',
  );

  const rss = renderRss(sorted, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt });
  await fs.writeFile(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

  // Every real page just written above, for Search Console to crawl from —
  // not admin.html, which robots.txt below excludes from crawling entirely.
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
  ];
  await fs.writeFile(path.join(DIST_DIR, 'sitemap.xml'), renderSitemap(sitemapEntries, { siteUrl: SITE_URL }), 'utf8');
  await fs.writeFile(
    path.join(DIST_DIR, 'robots.txt'),
    `User-agent: *\nDisallow: /admin.html\nSitemap: ${SITE_URL}/sitemap.xml\n`,
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
  ]) {
    await fs.copyFile(path.resolve('src/site/assets', asset), path.join(DIST_DIR, asset));
  }

  // The hype songs and their cover art, recursive since it's a whole
  // subfolder rather than the single flat files handled above.
  await fs.cp(path.resolve('src/site/assets/music'), path.join(DIST_DIR, 'music'), { recursive: true });

  log.ok(
    `built dist/ — ${sorted.length} item(s) across ${PAGES.length} page(s), ` +
      `${socialPosts.length} ticker post(s), ${videos.length} video(s), ${publishedDigests.length} weekly recap(s)`,
  );
  return { count: sorted.length, social: socialPosts.length, videos: videos.length, digests: publishedDigests.length };
}
