import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * commanders.com's own injury report page is a legacy JS widget with no
 * server-rendered table and no discoverable API — unlike roster.js/
 * depthchart.js/schedule.js, there's nothing on the team's own site to
 * scrape here. Sleeper's public players endpoint (built for fantasy
 * football apps, no key required) carries per-player injury_status/
 * injury_body_part/injury_notes for the whole league, refreshed on the
 * same cadence real injury designations change. It's a third-party read on
 * the same underlying reports, not the official one, so this is
 * disclosed on the page itself rather than presented as commanders.com's
 * own report.
 */
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const CACHE_PATH = path.join(DATA_DIR, 'injuries.json');

// "Sus" (suspension) and "COV" show up in the same injury_status field but
// aren't injuries — excluding them here, not just at render time, keeps the
// cache itself an honest answer to "who's actually hurt".
const INJURY_STATUSES = new Set(['Questionable', 'Doubtful', 'Out', 'IR', 'PUP', 'NFI']);

/**
 * Returns null on a fetch/parse failure, distinct from a real empty array
 * (nobody currently listed as hurt) — the caller needs to tell those apart
 * to know whether the existing cache should be overwritten.
 */
export async function fetchInjuries() {
  const raw = await fetchText(SLEEPER_PLAYERS_URL, { cache: false });
  if (!raw) {
    log.warn('injuries: could not fetch Sleeper players list');
    return null;
  }

  let players;
  try {
    players = JSON.parse(raw);
  } catch (err) {
    log.warn(`injuries: Sleeper response was not valid JSON: ${err.message}`);
    return null;
  }

  return Object.values(players)
    .filter((p) => p.team === 'WAS' && INJURY_STATUSES.has(p.injury_status))
    .map((p) => ({
      name: p.full_name,
      position: p.position,
      status: p.injury_status,
      bodyPart: p.injury_body_part || null,
      notes: p.injury_notes || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInjuriesCache(entries) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadInjuriesCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`injuries: could not read cache: ${err.message}`);
    return [];
  }
}
