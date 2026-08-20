import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

const CACHE_PATH = path.join(DATA_DIR, 'roster.json');

/**
 * Commanders.com's roster page — plain server-rendered HTML, no bot wall, on
 * the same domain the news feed already reads from. One page, ~94 rows:
 * name (linked, with a stable /team/players-roster/first-last/ slug), jersey
 * number, position, height, weight, experience, college.
 *
 * The site's displayed name is not always what anyone actually calls a
 * player — DT Jer'Zhan Newton is "Johnny Newton" in every beat reporter's
 * coverage, and the roster page has no idea. That gap is closed by
 * config/roster-aliases.js, not here; this module only knows what
 * commanders.com itself says.
 */

const ROSTER_URL = 'https://www.commanders.com/team/players-roster/';

// Jersey is usually digits, but a practice-squad player gets a "W" suffix
// (e.g. "19W"); position is usually one code, but a swing lineman gets a
// slash ("T/G") — both need a looser character class than a first pass
// assumed, caught by checking the two rows a stricter regex silently missed.
const ROW_RE =
  /<a href="\/team\/players-roster\/([a-z0-9-]+)\/">([^<]+)<\/a><\/span><\/div><\/td><td data-append="1">([\dA-Z]+)<\/td><td data-append="1">([A-Z/]+)<\/td>/g;

function decodeEntities(s) {
  return String(s)
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

export async function fetchRoster() {
  const html = await fetchText(ROSTER_URL, { cache: false });
  if (!html) {
    log.warn('roster: could not fetch commanders.com roster page');
    return [];
  }

  const players = [];
  for (const m of html.matchAll(ROW_RE)) {
    const [, slug, name, jersey, position] = m;
    players.push({ slug, name: decodeEntities(name), jersey, position });
  }

  if (!players.length) {
    log.warn('roster: page fetched but no rows matched — commanders.com may have changed its markup');
  }
  return players;
}

/**
 * A wholesale cache, not an append-only store like items.json/social.json —
 * there's no merge semantics to preserve, since a fresh fetch is always a
 * complete, authoritative roster snapshot, not a partial one to combine with
 * the last.
 */
export async function saveRosterCache(players) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(players, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

/** Empty array (never an error) if `npm run roster` hasn't been run yet — linking degrades to no links, same as a missing social.json degrades to no ticker. */
export async function loadRosterCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`roster: could not read cache: ${err.message}`);
    return [];
  }
}
