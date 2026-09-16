import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * Team-level offense and defense totals, for the sidebar's Team Stats widget.
 *
 * Two different ESPN endpoints, because each one only has half of it:
 *
 *   - Offense: the core-API season team-statistics route (STATS_URL), which
 *     carries a league rank per stat.
 *   - Defense: the site-API team-statistics route (OPPONENT_URL), whose
 *     `results.opponent` split is what opponents have done *to* this team,
 *     with real league ranks per stat.
 *
 * The defensive half used to be derived by crawling every completed box score
 * and summing what the opponent gained, with ranks hardcoded to null and a
 * comment asserting ESPN simply does not publish them. That was half right, and
 * the wrong half cost real accuracy, so it's worth being precise about:
 *
 *   - `defensive.yardsAllowed`/`pointsAllowed` on the *core* API really are
 *     always 0 with a bogus rank of "Tied-1st". Re-confirmed 2026-09-15, after
 *     a regular-season game had been played, so it isn't an offseason artifact.
 *   - There really is no `/statistics/opponent` sibling and no common/v3 team
 *     statistics route (both 404).
 *   - But the site-API route below was never tried, and it has all of it. Ben
 *     asked "ESPN shows a defensive rank, can you not see it?" and the answer
 *     was that the code had been looking in the one place it isn't.
 *
 * Two things to know before touching this:
 *
 *   - `results.opponent` has no *net* total-yards stat. Its `totalYards` /
 *     `yardsPerGame` add gross passing yards to rushing (203 + 136 = 339 in
 *     Week 1 2026) where the offense's `netYardsPerGame` is net of sack
 *     yardage (295, which is what the box score's own total says). So total
 *     yards allowed is summed here from net passing + rushing to match the
 *     offense's definition, and is the one defensive stat left without a rank:
 *     the only rank ESPN offers for it belongs to the gross figure.
 *   - The response's own `season.year` always reports the current season even
 *     when `?season=` asks for an older one. The data honours the parameter
 *     (2025 returns 17 games), the echo doesn't, so don't read the season back
 *     off this response.
 */
const TEAM_ID = '28'; // Washington Commanders — confirmed via seasons/2025/teams/28
const TEAM_ABBR = 'wsh';

const STATS_URL = (season, seasonType) =>
  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/${seasonType}/teams/${TEAM_ID}/statistics`;
const OPPONENT_URL = (season, seasonType) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_ABBR}/statistics?season=${season}&seasontype=${seasonType}`;
const LEADERS_URL = (season, seasonType) =>
  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/${seasonType}/teams/${TEAM_ID}/leaders`;

const CACHE_PATH = path.join(DATA_DIR, 'team-stats.json');

/** ESPN's seasontype 2 is the regular season (1 preseason, 3 postseason). */
const REGULAR_SEASON = 2;

async function fetchJson(url, label) {
  const raw = await fetchText(url, { cache: false });
  if (!raw) {
    log.warn(`team-stats: could not fetch ${label}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    log.warn(`team-stats: ${label} was not valid JSON: ${err.message}`);
    return null;
  }
}

/**
 * ESPN repeats the same team-wide totals inside several categories (passing,
 * rushing and receiving all carry `netYardsPerGame`), so this takes the first
 * category that has the stat rather than assuming which one owns it.
 *
 * Some ranks in this response are plainly not league ranks — `totalOffensivePlays`
 * comes back "58th" out of 32 teams, and `totalYardsFromScrimmage` reports
 * "Tied-1st" for the same value that `totalYards` ranks 23rd. Only stats whose
 * rank is a sane 1–32 are trusted; anything outside that keeps its value and
 * drops the rank.
 */
function readStat(categories, name) {
  for (const category of categories) {
    const stat = (category.stats || []).find((s) => s.name === name);
    if (!stat) continue;
    const rankIsSane = Number.isFinite(stat.rank) && stat.rank >= 1 && stat.rank <= 32;
    return {
      value: stat.displayValue ?? null,
      rank: rankIsSane ? stat.rank : null,
      rankLabel: rankIsSane ? stat.rankDisplayValue || null : null,
    };
  }
  return null;
}

/**
 * What opponents have averaged against this team, with league ranks, read
 * straight from the `results.opponent` split (see the note at the top).
 *
 * This replaced a crawl of every completed box score, which was the single most
 * expensive fetch in the project (~500KB per game, so ~8MB by a full season's
 * end) and produced no ranks. One request now, and three of the four stats
 * arrive already ranked.
 *
 * Returns null when the split is missing or carries no games, so the caller can
 * still tell "the fetch failed" apart from "this season hasn't started".
 */
async function fetchDefenseAllowed(season, seasonType) {
  const data = await fetchJson(OPPONENT_URL(season, seasonType), `opponent stats ${season}`);
  const categories = data?.results?.opponent;
  if (!categories?.length) {
    log.warn(`team-stats: no opponent split for ${season} seasontype ${seasonType}`);
    return null;
  }

  const games = Number(readStat(categories, 'gamesPlayed')?.value ?? 0);
  if (!games) {
    log.warn(`team-stats: opponent split for ${season} reports no games played`);
    return null;
  }

  const pointsPerGame = readStat(categories, 'totalPointsPerGame');
  const passYardsPerGame = readStat(categories, 'netPassingYardsPerGame');
  const rushYardsPerGame = readStat(categories, 'rushingYardsPerGame');
  if (!passYardsPerGame && !rushYardsPerGame && !pointsPerGame) {
    log.warn(`team-stats: opponent split for ${season} carried no usable totals`);
    return null;
  }

  // Net, to match the offense's `netYardsPerGame`, rather than ESPN's own
  // opponent `yardsPerGame`, which adds *gross* passing yards to rushing and so
  // reads ~20 yards a game higher than any box score's total. No rank: the only
  // one ESPN publishes here belongs to that gross figure.
  const num = (s) => (s?.value == null ? null : Number(String(s.value).replace(/,/g, '')));
  const pass = num(passYardsPerGame);
  const rush = num(rushYardsPerGame);
  const netYards =
    Number.isFinite(pass) && Number.isFinite(rush)
      ? { value: (pass + rush).toFixed(1), rank: null, rankLabel: null }
      : null;

  return {
    games,
    yardsPerGame: netYards,
    pointsPerGame,
    passYardsPerGame,
    rushYardsPerGame,
  };
}

/**
 * True when a season line exists but carries no actual football yet: every
 * headline total is zero.
 *
 * ESPN publishes a complete, structurally valid statistics object for a season
 * as soon as it exists on the calendar, months before week 1, with every value
 * 0.0 and a rank of 1 ("Tied-1st") because all 32 teams are genuinely tied at
 * nothing. That line passes every other check in this file. The categories are
 * present and the ranks are inside 1-32, so it has to be recognized explicitly.
 * Rendering it produced a widget reading "Tied-1st 0.0 yds/gm" four times with
 * the defense half missing entirely (no completed box scores to derive it
 * from), which is how this was found in production on 2026-09-09.
 */
function seasonHasNoPlay(offense) {
  const totals = [
    offense.yardsPerGame,
    offense.pointsPerGame,
    offense.passYardsPerGame,
    offense.rushYardsPerGame,
  ];
  return totals.every((s) => s == null || Number(String(s.value).replace(/,/g, '')) === 0);
}

/**
 * Returns null on failure rather than throwing or writing a half-empty cache,
 * matching fetchInjuries()/fetchBettingLine() — the caller decides whether to
 * leave the previous cache in place.
 *
 * `allowFallback` guards a single step back to the previous season when the
 * requested one hasn't been played yet (see seasonHasNoPlay). One step only:
 * the recursive call passes false, so a genuinely empty run walks back exactly
 * one year and stops rather than crawling backwards through ESPN's archive.
 */
export async function fetchTeamStats({ season, seasonType = REGULAR_SEASON, allowFallback = true } = {}) {
  const year = season || new Date().getFullYear();

  const stats = await fetchJson(STATS_URL(year, seasonType), `team statistics ${year}`);
  const categories = stats?.splits?.categories;
  if (!categories?.length) {
    log.warn(`team-stats: no statistics for ${year} seasontype ${seasonType}`);
    return null;
  }

  const offense = {
    yardsPerGame: readStat(categories, 'netYardsPerGame'),
    pointsPerGame: readStat(categories, 'totalPointsPerGame'),
    passYardsPerGame: readStat(categories, 'netPassingYardsPerGame'),
    rushYardsPerGame: readStat(categories, 'rushingYardsPerGame'),
  };

  if (!offense.yardsPerGame && !offense.pointsPerGame) {
    log.warn(`team-stats: ${year} statistics carried no usable offensive totals`);
    return null;
  }

  // Show last season's real numbers through the whole offseason and preseason
  // instead of a wall of zeroes, and flag it so the widget can label the year
  // as finished rather than implying it's current.
  if (seasonHasNoPlay(offense) && allowFallback) {
    log.info(`team-stats: ${year} has no games played yet, falling back to ${year - 1}`);
    const prior = await fetchTeamStats({ season: year - 1, seasonType, allowFallback: false });
    if (prior) return { ...prior, complete: true };
    log.warn(`team-stats: ${year - 1} fallback failed, keeping the empty ${year} line`);
  }

  const defense = await fetchDefenseAllowed(year, seasonType);
  const leaders = await fetchTeamLeaders(year, seasonType);

  return {
    season: String(year),
    seasonType,
    fetchedAt: new Date().toISOString(),
    offense,
    // Null when the derivation failed; the widget hides the defense half
    // rather than showing zeroes.
    defense,
    leaders,
  };
}

/**
 * Per-category statistical leaders, from ESPN's own team+season-scoped
 * leaders endpoint — NOT derived from the roster cache. An earlier version
 * cross-referenced the *current* roster against each player's own most
 * recent season stat line, which silently misattributed a stat to
 * Washington whenever a since-signed player actually earned it somewhere
 * else: verified wrong in production, where it named the 2025 tackle and
 * sack leaders as two players who weren't on the team that season, while
 * ESPN's own leaders list correctly named Bobby Wagner and Von Miller.
 * This endpoint only ever lists players who accumulated the stat while
 * actually on this team that season, so that whole failure mode is gone.
 *
 * Only the top leader per category is kept, matching the widget's "one
 * name per stat" display. Each entry only carries an athlete $ref, not a
 * name, so every category needs one follow-up fetch to resolve it.
 */
const LEADER_CATEGORIES = [
  { name: 'passingYards', group: 'offense', key: 'Pass' },
  { name: 'rushingYards', group: 'offense', key: 'Rush' },
  { name: 'receivingYards', group: 'offense', key: 'Recv' },
  { name: 'totalTackles', group: 'defense', key: 'Tckl' },
  { name: 'sacks', group: 'defense', key: 'Sack' },
  { name: 'interceptions', group: 'defense', key: 'Int' },
];

async function fetchAthleteName(ref) {
  const athlete = await fetchJson(ref, 'athlete');
  return athlete?.displayName || null;
}

export async function fetchTeamLeaders(season, seasonType = REGULAR_SEASON) {
  const data = await fetchJson(LEADERS_URL(season, seasonType), `team leaders ${season}`);
  const categories = data?.categories;
  if (!categories?.length) {
    log.warn(`team-stats: no leaders for ${season} seasontype ${seasonType}`);
    return { offense: [], defense: [] };
  }

  const result = { offense: [], defense: [] };
  for (const { name, group, key } of LEADER_CATEGORIES) {
    const top = categories.find((c) => c.name === name)?.leaders?.[0];
    if (!top?.athlete?.$ref) continue;
    const athleteName = await fetchAthleteName(top.athlete.$ref);
    if (!athleteName) continue;
    result[group].push({ key, name: athleteName, value: top.displayValue });
  }
  return result;
}

export async function saveTeamStatsCache(stats) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadTeamStatsCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`team-stats: could not read cache: ${err.message}`);
    return null;
  }
}
