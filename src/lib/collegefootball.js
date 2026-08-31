import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * Real, cited college football material for "A Case of the Mondays" (see
 * monday-generate.js) — added specifically because the site owner asked for
 * UVA/college football content in that weekly post, and this project's
 * whole corpus otherwise carries zero college sports (verified by hand:
 * checked recent items, all Commanders/NFL). Same ESPN public-site-API
 * pattern already used for standings.js/schedule.js/teamstats.js, and same
 * policy: verified these are plain public GETs, no key, before writing this.
 *
 * Two ESPN endpoints, two different score shapes (their own inconsistency,
 * not a bug here) — the team-schedule endpoint nests
 * `competitor.score.displayValue`, the scoreboard endpoint has a bare
 * string at `competitor.score`. Each parser below matches its own endpoint.
 */
const UVA_TEAM_ID = '258'; // Virginia Cavaliers — confirmed via the schedule endpoint returning "Virginia Cavaliers"
const UVA_SCHEDULE_URL = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${UVA_TEAM_ID}/schedule`;
// groups=80 is the FBS group (ESPN's own grouping ID) — without it this
// endpoint mixes in FCS/lower-division games that dilute "notable results."
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=200';
const CACHE_PATH = path.join(DATA_DIR, 'collegefootball.json');
const MAX_NOTABLE = 8;

async function fetchJson(url, label) {
  const raw = await fetchText(url, { cache: false });
  if (!raw) {
    log.warn(`college-football: could not fetch ${label}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    log.warn(`college-football: ${label} was not valid JSON: ${err.message}`);
    return null;
  }
}

async function fetchUvaResult() {
  const data = await fetchJson(UVA_SCHEDULE_URL, 'UVA schedule');
  const events = data?.events || [];
  const completed = events.filter((e) => e.competitions?.[0]?.status?.type?.completed);
  const upcoming = events.filter((e) => !e.competitions?.[0]?.status?.type?.completed);
  const last = completed[completed.length - 1];
  const next = upcoming[0];

  const summarize = (event) => {
    const comp = event?.competitions?.[0];
    if (!comp) return null;
    const uva = comp.competitors.find((c) => c.team.abbreviation === 'UVA');
    const opponent = comp.competitors.find((c) => c.team.abbreviation !== 'UVA');
    if (!uva || !opponent) return null;
    return {
      date: event.date,
      uvaScore: uva.score?.displayValue ?? null,
      opponentScore: opponent.score?.displayValue ?? null,
      opponent: opponent.team.displayName,
      isHome: uva.homeAway === 'home',
      won: uva.winner === true,
      venue: comp.venue?.fullName || null,
    };
  };

  const nextOpponent = (event) => {
    const comp = event?.competitions?.[0];
    const opponent = comp?.competitors?.find((c) => c.team.abbreviation !== 'UVA');
    const uva = comp?.competitors?.find((c) => c.team.abbreviation === 'UVA');
    if (!opponent) return null;
    return { date: event.date, opponent: opponent.team.displayName, isHome: uva?.homeAway === 'home' };
  };

  return {
    lastGame: last ? summarize(last) : null,
    nextGame: next ? nextOpponent(next) : null,
  };
}

/** Ranked-team results/upsets, for "the rest of college football" color — same reasoning as buildCorpus()'s own numbered-entry shape, just for a different sport. */
async function fetchNotableResults() {
  const data = await fetchJson(SCOREBOARD_URL, 'CFB scoreboard');
  const events = data?.events || [];

  const ranked = events.filter((e) =>
    e.competitions?.[0]?.competitors?.some((c) => c.curatedRank?.current && c.curatedRank.current <= 25),
  );

  return ranked
    .filter((e) => e.competitions[0].status?.type?.completed)
    .slice(0, MAX_NOTABLE)
    .map((e) => {
      const comp = e.competitions[0];
      const teams = comp.competitors.map((c) => ({
        name: c.team.displayName,
        abbr: c.team.abbreviation,
        rank: c.curatedRank?.current <= 25 ? c.curatedRank.current : null,
        score: c.score ?? null,
        winner: c.winner === true,
      }));
      return { date: e.date, teams };
    });
}

export async function fetchCollegeFootball() {
  const [uva, notable] = await Promise.all([fetchUvaResult(), fetchNotableResults()]);
  if (!uva.lastGame && !notable.length) {
    log.warn('college-football: no usable data from either endpoint');
    return null;
  }
  return { fetchedAt: new Date().toISOString(), uva, notable };
}

export async function saveCollegeFootballCache(data) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadCollegeFootballCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`college-football: could not read cache: ${err.message}`);
    return null;
  }
}
