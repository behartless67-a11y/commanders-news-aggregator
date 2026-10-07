import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';
import { parseGameTime, TZ } from './dates.js';

/**
 * The ref crew card: who has the Commanders' next game, and how many flags
 * that referee's crews throw.
 *
 * Two sources, because nobody publishes both halves:
 *
 *   Football Zebras posts the week's referee assignments every Tuesday, as an
 *   ordinary WordPress post in its Assignments category. robots.txt allows it
 *   and the category has its own RSS feed, so finding the post is a feed read;
 *   only the assignment table itself comes from the post's HTML.
 *
 *   ESPN names the full crew for every finished game and keeps each team's
 *   penalty totals, but never names a crew ahead of kickoff. The core API is
 *   used rather than the summary endpoint because a summary is 600KB per game
 *   and the two small calls here carry everything this card needs.
 *
 * Finished games never change, so each one is fetched exactly once and kept
 * in data/refcrew.json. A nightly run only ever fetches the handful of games
 * played since the last one. Last season is kept alongside this one because
 * four weeks in, a referee has worked four games, which is too few to say
 * anything about how often his crew throws a flag.
 */

const CACHE_PATH = path.join(DATA_DIR, 'refcrew.json');

const SCOREBOARD_URL = (season, week) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`;
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events';
const OFFICIALS_URL = (id) => `${CORE}/${id}/competitions/${id}/officials`;
const TEAM_STATS_URL = (id, teamId) => `${CORE}/${id}/competitions/${id}/competitors/${teamId}/statistics`;

const ASSIGNMENTS_FEED = 'https://www.footballzebras.com/category/assignments/feed/';

const REGULAR_SEASON_WEEKS = 18;

/** 32 teams, 17 games each, two teams a game. */
const GAMES_PER_SEASON = 272;

/** Below this, a referee's flag rate is mostly noise, so he isn't ranked against the others. */
const MIN_GAMES_TO_RANK = 5;

async function fetchJson(url) {
  // cache: false because a team's stats document is 125KB and a backfill reads
  // hundreds of them. fetchText's memo would hold every one in memory for the
  // rest of the run, and none is ever read twice.
  const raw = await fetchText(url, { cache: false });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Lowercase and strip suffixes, so "Clete Blakeman" on one site matches "Clete Blakeman Jr." on the other. */
export function refKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z]/g, '');
}

async function fetchPenalties(eventId, teamId) {
  const data = await fetchJson(TEAM_STATS_URL(eventId, teamId));
  if (!data) return null;
  const misc = data.splits?.categories?.find((c) => c.name === 'miscellaneous');
  const stat = (name) => misc?.stats?.find((s) => s.name === name)?.value;
  const flags = stat('totalPenalties');
  const yards = stat('totalPenaltyYards');
  return flags == null ? null : { flags: Number(flags), yards: Number(yards || 0) };
}

/**
 * One finished game, or null when a call failed (it's retried next run, not
 * cached half-filled).
 *
 * A game ESPN answers for but lists no crew on comes back with referee: null.
 * That's 13 of 2025's 272 games, the same 13 every time and missing from the
 * summary endpoint too, so retrying would never fill them in. Their flags
 * still count toward the league average and the team rates; they just don't
 * count for any referee.
 */
async function fetchGame(event, season, week) {
  const comp = event.competitions?.[0];
  const sides = Object.fromEntries((comp?.competitors || []).map((c) => [c.homeAway, c]));
  if (!sides.home || !sides.away) return null;

  const officials = await fetchJson(OFFICIALS_URL(event.id));
  if (!officials) return null;
  const referee = officials.items?.find((o) => /^referee$/i.test(o.position?.name || ''))?.displayName || null;

  const home = await fetchPenalties(event.id, sides.home.id);
  const away = await fetchPenalties(event.id, sides.away.id);
  if (!home || !away) return null;

  return {
    season,
    week,
    date: event.date,
    referee,
    home: { abbr: sides.home.team?.abbreviation, ...home },
    away: { abbr: sides.away.team?.abbreviation, ...away },
  };
}

/** Every finished regular-season game in a season that isn't in the cache yet. */
async function collectSeason(season, games) {
  let added = 0;
  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
    const board = await fetchJson(SCOREBOARD_URL(season, week));
    const events = board?.events || [];
    const finished = events.filter((e) => e.status?.type?.completed);
    for (const event of finished) {
      if (games[event.id]) continue;
      const game = await fetchGame(event, season, week);
      if (game) {
        games[event.id] = game;
        added += 1;
      } else {
        log.warn(`ref-crew: could not read ${event.shortName} (${season} week ${week}), will retry next run`);
      }
    }
    // A week with games still to play is the current week, so nothing after it
    // has been played either. Stopping here saves a dozen empty scoreboards.
    if (events.length && finished.length < events.length) break;
  }
  return added;
}

/** NFL seasons run into January and February, which still belong to the season that started the September before. */
function seasonOfDate(date) {
  return date.getUTCMonth() <= 1 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
}

/**
 * The Commanders' assignment from Football Zebras' newest "Week N referee
 * assignments" post: { season, week, game, referee, url } or null before the
 * week's post is up (it lands on Tuesdays) or in a bye week, when there is no
 * Commanders game in the table to find.
 */
export async function fetchAssignment() {
  const feed = await fetchText(ASSIGNMENTS_FEED, { cache: false });
  if (!feed) return null;
  const items = feed.split('<item>').slice(1);
  for (const item of items) {
    const title = (item.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const week = Number((title.match(/^Week (\d+) referee assignments$/i) || [])[1]);
    if (!week) continue;
    const url = (item.match(/<link>([^<]*)<\/link>/) || [])[1];
    const posted = new Date((item.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1] || '');
    if (!url || Number.isNaN(posted.getTime())) continue;

    // Only the newest regular-season post matters: an older week's crew is
    // history, and the schedule match in refCrewCard() decides whether this
    // one is for the game that's actually next.
    const html = await fetchText(url, { cache: false });
    if (!html) return null;
    const rows = [...html.matchAll(/<div class='b_post-game'>([^<]+)<\/div>\s*<div class='b_post-referee'>([^<]+)<\/div>/g)];
    const ours = rows.find(([, game]) => /Commanders/.test(game));
    return ours
      ? { season: seasonOfDate(posted), week, game: ours[1].trim(), referee: ours[2].trim(), url }
      : null;
  }
  return null;
}

export async function fetchRefCrew({ season = seasonOfDate(new Date()) } = {}) {
  const cache = (await loadRefCrewCache()) || { games: {} };
  const games = { ...cache.games };
  let added = 0;
  for (const s of [season - 1, season]) {
    // Last season stops changing once all of it is cached, and re-reading its
    // eighteen scoreboards every night to learn nothing is the one wasteful
    // part of this collector.
    const have = Object.values(games).filter((g) => g.season === s).length;
    if (s < season && have >= GAMES_PER_SEASON) continue;
    added += await collectSeason(s, games);
  }

  const assignment = await fetchAssignment();
  if (!assignment) log.info('ref-crew: no Commanders assignment posted yet (it goes up on Tuesdays)');

  return {
    result: { fetchedAt: new Date().toISOString(), season, assignment, games },
    added,
  };
}

export async function saveRefCrewCache(data) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadRefCrewCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`ref-crew: could not read cache: ${err.message}`);
    return null;
  }
}

const WSH = 'WSH';

/** ESPN's abbreviations, which differ from the NFL's in a few places (WSH, not WAS). */
const NICKNAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears',
  CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LAC: 'Chargers', LAR: 'Rams',
  LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WSH: 'Commanders',
};
const nickname = (abbr) => NICKNAMES[abbr] || abbr;
const round1 = (n) => Math.round(n * 10) / 10;

/** The Commanders' next unplayed game from the schedule cache: { week, opponent, iso } or null. */
function nextCommandersGame(schedule) {
  const now = Date.now();
  for (const g of schedule || []) {
    if (g.season !== 'regular' || g.isBye || g.result) continue;
    const iso = parseGameTime(g.gametime);
    if (iso && Date.parse(iso) > now - 4 * 3600000) {
      return { week: Number(String(g.week).replace(/\D/g, '')), opponent: g.opponentShort || g.opponent, iso };
    }
  }
  return null;
}

/**
 * Everything the card shows, worked out from the cache at build time so the
 * numbers always agree with the games in it. Null when there's nothing worth
 * a card: no cache yet, or no Commanders game in it and no assignment.
 *
 *   assignment     the referee for the next game, only when Football Zebras'
 *                  newest post is for that game's week
 *   ref            that referee's flag rate over this season and last, with
 *                  his rank among referees who've worked enough games
 *   withUs         his games involving Washington in the same window
 *   lastGame       the most recent Washington game in the cache, whoever reffed
 *   commanders     Washington's own flags per game this season, and its rank
 */
export function refCrewCard(cache, schedule) {
  const all = Object.values(cache?.games || {});
  if (!all.length) return null;
  const season = cache.season;
  const window = all.filter((g) => g.season === season || g.season === season - 1);

  const flagsIn = (g) => g.home.flags + g.away.flags;
  const byRef = new Map();
  for (const g of window) {
    if (!g.referee) continue;
    const key = refKey(g.referee);
    const entry = byRef.get(key) || { name: g.referee, games: 0, flags: 0, yards: 0, homeFlags: 0, awayFlags: 0 };
    entry.games += 1;
    entry.flags += flagsIn(g);
    entry.yards += g.home.yards + g.away.yards;
    entry.homeFlags += g.home.flags;
    entry.awayFlags += g.away.flags;
    byRef.set(key, entry);
  }
  const ranked = [...byRef.values()]
    .filter((r) => r.games >= MIN_GAMES_TO_RANK)
    .sort((a, b) => b.flags / b.games - a.flags / a.games);
  const leagueFlags = window.length ? round1(window.reduce((n, g) => n + flagsIn(g), 0) / window.length) : null;

  const next = nextCommandersGame(schedule);
  const a = cache.assignment;
  const assignment = a && next && a.season === season && a.week === next.week ? a : null;

  let ref = null;
  let withUs = [];
  if (assignment) {
    const key = refKey(assignment.referee);
    const r = byRef.get(key);
    if (r) {
      const rank = ranked.findIndex((x) => refKey(x.name) === key);
      ref = {
        games: r.games,
        flagsPerGame: round1(r.flags / r.games),
        yardsPerGame: Math.round(r.yards / r.games),
        homeFlagsPerGame: round1(r.homeFlags / r.games),
        awayFlagsPerGame: round1(r.awayFlags / r.games),
        rank: rank >= 0 ? rank + 1 : null,
        rankedRefs: ranked.length,
      };
    }
    withUs = window
      .filter((g) => g.referee && refKey(g.referee) === key && (g.home.abbr === WSH || g.away.abbr === WSH))
      .sort((x, y) => String(y.date).localeCompare(String(x.date)))
      .map((g) => {
        const us = g.home.abbr === WSH ? g.home : g.away;
        const them = g.home.abbr === WSH ? g.away : g.home;
        return { season: g.season, week: g.week, opponent: nickname(them.abbr), ourFlags: us.flags, theirFlags: them.flags };
      });
  }

  const ours = all
    .filter((g) => g.home.abbr === WSH || g.away.abbr === WSH)
    .sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const last = ours[0];
  const lastGame = last
    ? (() => {
        const us = last.home.abbr === WSH ? last.home : last.away;
        const them = last.home.abbr === WSH ? last.away : last.home;
        return { season: last.season, week: last.week, referee: last.referee, opponent: nickname(them.abbr), ourFlags: us.flags, theirFlags: them.flags };
      })()
    : null;

  // This season only: last year's team is a different team.
  const perTeam = new Map();
  for (const g of all.filter((x) => x.season === season)) {
    for (const side of [g.home, g.away]) {
      const t = perTeam.get(side.abbr) || { games: 0, flags: 0 };
      t.games += 1;
      t.flags += side.flags;
      perTeam.set(side.abbr, t);
    }
  }
  const teamRates = [...perTeam.entries()].map(([abbr, t]) => ({ abbr, rate: t.flags / t.games, games: t.games }));
  teamRates.sort((x, y) => y.rate - x.rate);
  const usIdx = teamRates.findIndex((t) => t.abbr === WSH);
  const commanders = usIdx >= 0
    ? { flagsPerGame: round1(teamRates[usIdx].rate), games: teamRates[usIdx].games, rank: usIdx + 1, teams: teamRates.length }
    : null;

  if (!assignment && !lastGame) return null;
  return {
    season,
    assignment,
    ref,
    leagueFlagsPerGame: leagueFlags,
    withUs,
    lastGame,
    commanders,
    nextWeek: next?.week || null,
    // "Sunday", for the "Sunday's ref" heading: most weeks, but not Thursdays,
    // Mondays, Christmas or London.
    nextDay: next ? new Date(next.iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' }) : null,
  };
}
