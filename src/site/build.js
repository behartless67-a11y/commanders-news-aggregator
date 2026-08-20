import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCES } from '../../config/sources.js';
import { log } from '../lib/log.js';
import { loadItems, sortedItems, loadSocial, sortedSocial } from '../lib/store.js';
import { renderPage, renderRss, PAGES } from './templates.js';

const DIST_DIR = path.resolve(process.env.DIST_DIR || 'dist');
const SITE_NAME = process.env.SITE_NAME || 'The Burgundy Wire';
const SITE_URL = process.env.SITE_URL || 'http://localhost:8080';
const MAX_RIVER_ITEMS = Number(process.env.MAX_RIVER_ITEMS || 60);

/**
 * Ticker length. Both copies of the track are in the DOM, so this is doubled in
 * the markup — enough to fill a wide screen without bloating the page.
 */
const MAX_TICKER_POSTS = Number(process.env.MAX_TICKER_POSTS || 30);

const HEADING = {
  'index.html': 'Latest headlines',
  'team-sources.html': 'Team source headlines',
  'national-coverage.html': 'National coverage',
};

export async function buildSite() {
  const items = await loadItems();
  // Each page is capped to its most recent N rather than rendering the full
  // backlog the store has accumulated since the last prune.
  const sorted = sortedItems(items).slice(0, MAX_RIVER_ITEMS);
  const socialPosts = sortedSocial(await loadSocial()).slice(0, MAX_TICKER_POSTS);
  const generatedAt = new Date().toISOString();

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
    });
    await fs.writeFile(path.join(DIST_DIR, page.file), html, 'utf8');
  }

  const rss = renderRss(sorted, { siteName: SITE_NAME, siteUrl: SITE_URL, generatedAt });
  await fs.writeFile(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

  const css = await fs.readFile(path.resolve('src/site/assets/site.css'), 'utf8');
  await fs.writeFile(path.join(DIST_DIR, 'site.css'), css, 'utf8');

  await fs.copyFile(path.resolve('src/site/assets/logo.png'), path.join(DIST_DIR, 'logo.png'));

  log.ok(
    `built dist/ — ${sorted.length} item(s) across ${PAGES.length} page(s), ${socialPosts.length} ticker post(s)`,
  );
  return { count: sorted.length, social: socialPosts.length };
}
