import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCES } from '../../config/sources.js';
import { log } from '../lib/log.js';
import { loadItems, sortedItems, loadSocial, sortedSocial } from '../lib/store.js';
import { loadRosterCache } from '../lib/roster.js';
import { buildRosterIndex } from '../lib/roster-links.js';
import { ROSTER_ALIASES } from '../../config/roster-aliases.js';
import { listDigests } from '../digest/generate.js';
import { renderPage, renderRss, renderWeeklyIndex, renderWeeklyPost, PAGES } from './templates.js';

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
  // Each page is capped to its most recent N rather than rendering the full
  // backlog the store has accumulated since the last prune.
  const allSorted = sortedItems(items);
  const sorted = allSorted.slice(0, MAX_RIVER_ITEMS);
  const socialPosts = sortedSocial(await loadSocial()).slice(0, MAX_TICKER_POSTS);
  // Drawn from the whole store, not the capped river — the rail shouldn't empty
  // out just because a busy news week pushed the clips past MAX_RIVER_ITEMS.
  const videos = allSorted.filter((item) => VIDEO_SOURCE_IDS.has(item.sourceId)).slice(0, MAX_VIDEOS);
  const generatedAt = new Date().toISOString();

  // Null (not an empty index) when the cache is empty, so linkPlayers()
  // degrades to plain escaped text instead of matching against nothing.
  const rosterPlayers = await loadRosterCache();
  const rosterIndex = rosterPlayers.length ? buildRosterIndex(rosterPlayers, ROSTER_ALIASES) : null;

  // Only status: 'published' ever reaches dist/ — a draft awaiting review, or
  // one that failed review, must never appear on the live site. See
  // src/digest/ for the generation and review gate that sets this field.
  const publishedDigests = (await listDigests())
    .filter((d) => d.status === 'published')
    .sort((a, b) => b.week.localeCompare(a.week));
  const hasWeekly = publishedDigests.length > 0;

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
      hasWeekly,
      rosterIndex,
    });
    await fs.writeFile(path.join(DIST_DIR, page.file), html, 'utf8');
  }

  if (hasWeekly) {
    const opts = { siteName: SITE_NAME, siteUrl: SITE_URL, sources: SOURCES, generatedAt, rosterIndex };
    await fs.writeFile(path.join(DIST_DIR, 'weekly.html'), renderWeeklyIndex(publishedDigests, opts), 'utf8');
    for (const record of publishedDigests) {
      await fs.writeFile(path.join(DIST_DIR, `weekly-${record.week}.html`), renderWeeklyPost(record, opts), 'utf8');
    }
  }

  const rss = renderRss(sorted, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt });
  await fs.writeFile(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

  for (const asset of ['site.css', 'site.js', 'logo.png']) {
    await fs.copyFile(path.resolve('src/site/assets', asset), path.join(DIST_DIR, asset));
  }

  log.ok(
    `built dist/ — ${sorted.length} item(s) across ${PAGES.length} page(s), ` +
      `${socialPosts.length} ticker post(s), ${videos.length} video(s), ${publishedDigests.length} weekly recap(s)`,
  );
  return { count: sorted.length, social: socialPosts.length, videos: videos.length, digests: publishedDigests.length };
}
