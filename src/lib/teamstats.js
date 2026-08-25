import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * Team-level offense and defense totals, for the sidebar's Team Stats widget.
 *
 * Offense comes straight from ESPN's season team-statistics endpoint, which
 * carries a league rank per stat alongside the value. Defense does not, and
 * that asymmetry drives the whole shape of this file:
 *
 *   - `defensive.yardsAllowed` and `defensive.pointsAllowed` exist in that
 *     response but are always literally 0 with a rank of "Tied-1st" — ESPN
 *     does not populate the opponent side of a team's season line. Verified by
 *     hand against seasons/2025/types/2/teams/28/statistics before writing
 *     this, same policy as the feeds in config/sources.js.
 *   - There is no `/statistics/opponent` sibling (404) and no common/v3 team
 *     statistics route (404 for both `wsh` and `28`).
 *
 * So the defensive side is derived instead: fetch the team's schedule, then
 * each completed game's box score, and sum what the opponent gained and
 * scored. That yields a real yards-allowed and points-allowed per game — but
 * NOT a league rank for either, because ranking those would mean deriving the
 * same figures for all 32 teams, which needs every game in the league (~272
 * box scores per season), not just this team's ~17. Defensive ranks are
 * therefore null on purpose, and the widget renders the number without one
 * rather than inventing it. Don't "fix" the nulls by reading ESPN's zeroes.
 */
const TEAM_ID = '28'; // Washington Commanders — confirmed via seasons/2025/teams/28
const TEAM_ABBR = 'wsh';

const STATS_URL = (season, seasonType) =>
  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/${seasonType}/teams/${TEAM_ID}/statistics`;
const SCHEDULE_URL = (season, seasonType) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_ABBR}/schedule?season=${season}&seasontype=${seasonType}`;
const SUMMARY_URL = (eventId) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;

const CACHE_PATH = path.join(DATA_DIR, 'team-stats.json');

/** ESPN's seasontype 2 is the regular season (1 preseason, 3 postseason). */
const REGULAR_SEASON = 2;

/**
 * Box scores are ~500KB each, so a season's worth is the single most expensive
 * fetch in this project. Capped so a bad season value can't turn into an
 * unbounded crawl; a full regular season is 17 games.
 */
const MAX_GAMES = Number(process.env.TEAM_STATS_MAX_GAMES || 20);

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
 * Opponent yards and points per game, summed from this team's own completed
 * box scores. Returns null when no game could be read, so the caller can tell
 * "the defense fetch failed" apart from "the season hasn't started".
 */
async function fetchDefenseAllowed(season, seasonType) {
  const schedule = await fetchJson(SCHEDULE_URL(season, seasonType), 'team schedule');
  if (!schedule) return null;

  const completed = (schedule.events || [])
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .slice(0, MAX_GAMES);

  if (!completed.length) {
    log.warn(`team-stats: no completed games for ${season} seasontype ${seasonType}`);
    return null;
  }

  let games = 0;
  let yards = 0;
  let points = 0;

  for (const event of completed) {
    const summary = await fetchJson(SUMMARY_URL(event.id), `box score ${event.id}`);
    const teams = summary?.boxscore?.teams;
    if (!teams || teams.length !== 2) continue;

    // The opponent is whichever box-score entry isn't ours, matched on ESPN's
    // own team id rather than the abbreviation, which it spells inconsistently
    // across endpoints ("WSH" here, "wsh" in the schedule path).
    const opponent = teams.find((t) => String(t.team?.id) !== TEAM_ID);
    if (!opponent) continue;

    const totalYards = (opponent.statistics || []).find((s) => s.name === 'totalYards');
    const opponentScore = (summary.header?.competitions?.[0]?.competitors || []).find(
      (c) => String(c.team?.id) !== TEAM_ID,
    )?.score;

    if (totalYards == null && opponentScore == null) continue;

    games += 1;
    yards += Number(String(totalYards?.displayValue ?? 0).replace(/,/g, '')) || 0;
    points += Number(opponentScore ?? 0) || 0;
  }

  if (!games) {
    log.warn('team-stats: no readable box scores — defense figures unavailable');
    return null;
  }

  return {
    games,
    // Ranks are null by design — see the note at the top of this file.
    yardsPerGame: { value: (yards / games).toFixed(1), rank: null, rankLabel: null },
    pointsPerGame: { value: (points / games).toFixed(1), rank: null, rankLabel: null },
  };
}

/**
 * Returns null on failure rather than throwing or writing a half-empty cache,
 * matching fetchInjuries()/fetchBettingLine() — the caller decides whether to
 * leave the previous cache in place.
 */
export async function fetchTeamStats({ season, seasonType = REGULAR_SEASON } = {}) {
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

  const defense = await fetchDefenseAllowed(year, seasonType);

  return {
    season: String(year),
    seasonType,
    fetchedAt: new Date().toISOString(),
    offense,
    // Null when the derivation failed; the widget hides the defense half
    // rather than showing zeroes.
    defense,
  };
}

/**
 * Per-group statistical leaders, read out of the roster cache rather than
 * fetched — roster-stats.js already stores a season stat line per player, so
 * this is free.
 *
 * Position filtering is what disambiguates the labels, not the label alone:
 * "YDS" appears in the passing, rushing, receiving *and* defensive stat lines
 * (see CATEGORY_FIELDS in roster-stats.js), so "most YDS" without a position
 * filter would compare a quarterback's passing yards against a receiver's
 * receiving yards and call the quarterback the receiving leader.
 *
 * Caveat worth knowing before trusting these: the underlying line is whatever
 * ESPN's per-athlete endpoint reports for that season, so a player who changed
 * teams mid-season carries his combined total, not just his Washington one.
 */
const LEADER_GROUPS = {
  offense: [
    { key: 'Pass', label: 'YDS', positions: ['QB'] },
    { key: 'Rush', label: 'YDS', positions: ['RB', 'FB'] },
    { key: 'Recv', label: 'YDS', positions: ['WR', 'TE'] },
  ],
  defense: [
    { key: 'Tckl', label: 'TCKL', positions: null },
    { key: 'Sack', label: 'SACK', positions: null },
    { key: 'Int', label: 'INT', positions: ['CB', 'DB', 'S', 'SS', 'FS', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'EDGE'] },
  ],
};

export function buildLeaders(players = []) {
  const numeric = (raw) => {
    const n = parseFloat(String(raw).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const fieldOf = (player, label) => (player.stats?.fields || []).find((f) => f.label === label);

  const leaderFor = ({ key, label, positions }) => {
    const best = players
      .filter((p) => p.stats && (!positions || positions.includes(p.position)))
      .map((p) => ({ player: p, field: fieldOf(p, label) }))
      .filter((x) => x.field && numeric(x.field.value) > 0)
      .sort((a, b) => numeric(b.field.value) - numeric(a.field.value))[0];
    return best ? { key, name: best.player.name, value: String(best.field.value) } : null;
  };

  return {
    offense: LEADER_GROUPS.offense.map(leaderFor).filter(Boolean),
    defense: LEADER_GROUPS.defense.map(leaderFor).filter(Boolean),
  };
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
