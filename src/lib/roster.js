import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';
import { fetchPlayerStats } from './roster-stats.js';

const CACHE_PATH = path.join(DATA_DIR, 'roster.json');

/**
 * ESPN's own team roster endpoint — the same undocumented, public, key-free
 * API already used for the scoreboard and betting line. Replaced a
 * commanders.com HTML scrape that gave name/jersey/position but no photo and
 * no stable per-player ID, which the Roster page's headshots and season
 * stats both need.
 */
const ROSTER_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/wsh/roster';

/**
 * commanders.com's own profile-page slugs are just the lowercased full name
 * with every run of non-alphanumeric characters (spaces, apostrophes,
 * periods) collapsed to one hyphen — confirmed by reproducing every
 * apostrophe/suffix name already on the roster (K'Lavon Chaisson ->
 * "k-lavon-chaisson", Josh Conerly Jr. -> "josh-conerly-jr", Jer'Zhan Newton
 * -> "jer-zhan-newton") from commanders.com's real slugs. Deriving it here
 * means linking back to a player's commanders.com profile no longer
 * requires scraping that page at all.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchRoster() {
  const text = await fetchText(ROSTER_URL, { cache: false });
  if (!text) {
    log.warn('roster: could not fetch ESPN team roster');
    return [];
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    log.warn('roster: ESPN roster response was not valid JSON — API may have changed shape');
    return [];
  }

  const players = [];
  for (const group of data.athletes || []) {
    for (const p of group.items || []) {
      if (!p.fullName || !p.position?.abbreviation) continue;
      players.push({
        slug: slugify(p.fullName),
        name: p.fullName,
        jersey: String(p.jersey || ''),
        position: p.position.abbreviation,
        espnId: p.id,
        photo: p.headshot?.href || null,
      });
    }
  }

  if (!players.length) {
    log.warn('roster: page fetched but no players matched — ESPN may have changed its response shape');
  }
  return players;
}

/**
 * One ESPN request per player — too heavy to run on the same frequent
 * cadence as `fetchRoster()`, so this is called on its own weekly schedule
 * instead (Tuesday mornings, see roster-stats.yml and the 'roster-stats'
 * CLI case), never from the build itself. `fetchPlayerStats` already
 * degrades to null per-player on any failure, so one bad response just means
 * that player's card has no stats line, not a failed refresh.
 */
export async function attachStats(players) {
  const withStats = [];
  for (const player of players) {
    const stats = await fetchPlayerStats(player.espnId, player.position);
    withStats.push({ ...player, stats });
  }
  return withStats;
}

/** Wholesale cache, same convention as schedule.js/betting.js — a fresh fetch is always a complete, authoritative snapshot. */
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
