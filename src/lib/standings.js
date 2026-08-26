import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * NFC East standings, for the sidebar widget above the schedule.
 *
 * One endpoint carries the whole league — verified by hand before writing
 * this (same policy as config/sources.js): a plain GET, no key, returns a
 * conference tree with every team's record, streak, and logo already
 * attached, so this just filters down to the four NFC East teams rather
 * than hitting a division-specific endpoint that doesn't seem to exist.
 *
 * Sorted by win percentage, not a rank ESPN hands back pre-computed — the
 * response does carry rank-shaped fields (playoffSeed, lockedDivRank), but
 * neither is a true division rank: playoffSeed is conference-wide seeding,
 * and lockedDivRank reads 0 for every team until the league itself locks
 * it in, well after the regular season is under way. Win percentage isn't
 * a full substitute for the NFL's own tiebreaker procedure (head-to-head,
 * common games, strength of victory/schedule) in a genuine tie, but it's
 * correct whenever records actually differ, which is most of the time, and
 * not attempting to reimplement that procedure here is deliberate.
 */
// seasontype=2 explicitly (regular season) rather than the default, which
// tracks whatever ESPN considers the "current" season phase — during
// preseason that defaulted to preseason win-loss, which nobody actually
// wants ranked here. Verified by hand: with this param, every NFC East team
// reads 0-0 right now, during preseason, exactly as it should — and it
// needs no further code change once real Week 1 games are played, since
// this same URL will just start reporting real regular-season records at
// that point on its own.
const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings?seasontype=2';
const CACHE_PATH = path.join(DATA_DIR, 'standings.json');

// Keyed by ESPN's own team abbreviation, which the standings response uses.
const NFC_EAST_ESPN_ABBR = ['WSH', 'DAL', 'PHI', 'NYG'];

/**
 * NFL.com's own abbreviation differs from ESPN's for exactly one of these
 * four teams (Washington: WSH vs. WAS). Mapped here rather than adding a
 * second logo CDN — this reuses the exact static.www.nfl.com pattern the
 * schedule widget already hotlinks from (see scheduleRow() in
 * templates.js), verified working for all four teams by hand before this
 * was written.
 */
const ESPN_TO_NFL_ABBR = { WSH: 'WAS', DAL: 'DAL', PHI: 'PHI', NYG: 'NYG' };

/**
 * Returns null on a fetch/parse failure or an unexpected shape, matching
 * fetchTeamStats()/fetchInjuries() — the caller decides whether to leave the
 * previous cache in place rather than overwrite it with nothing.
 */
export async function fetchNfcEastStandings() {
  const raw = await fetchText(STANDINGS_URL, { cache: false });
  if (!raw) {
    log.warn('standings: could not fetch NFL standings');
    return null;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    log.warn(`standings: response was not valid JSON: ${err.message}`);
    return null;
  }

  const nfc = data.children?.find((c) => c.abbreviation === 'NFC');
  const entries = nfc?.standings?.entries;
  if (!entries) {
    log.warn('standings: NFC standings not present in the response');
    return null;
  }

  const east = entries.filter((e) => NFC_EAST_ESPN_ABBR.includes(e.team?.abbreviation));
  if (east.length !== 4) {
    log.warn(`standings: expected 4 NFC East teams, found ${east.length}`);
    return null;
  }

  const statValue = (entry, name) => entry.stats?.find((s) => s.name === name);
  const displayOf = (entry, name) => statValue(entry, name)?.displayValue ?? null;
  const winPercentOf = (entry) => parseFloat(statValue(entry, 'winPercent')?.value ?? '0');

  const teams = east
    .map((e) => ({
      abbr: ESPN_TO_NFL_ABBR[e.team.abbreviation] || e.team.abbreviation,
      name: e.team.displayName,
      overall: displayOf(e, 'overall'),
      streak: displayOf(e, 'streak'),
      winPercent: winPercentOf(e),
    }))
    .sort((a, b) => b.winPercent - a.winPercent);

  return {
    season: data.season?.year ? String(data.season.year) : null,
    fetchedAt: new Date().toISOString(),
    teams,
  };
}

export async function saveStandingsCache(standings) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(standings, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadStandingsCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`standings: could not read cache: ${err.message}`);
    return null;
  }
}
