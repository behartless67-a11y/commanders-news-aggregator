import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

const CACHE_PATH = path.join(DATA_DIR, 'live-game.json');

/**
 * ESPN's public `summary` endpoint (same undocumented, key-free API family
 * as betting.js's scoreboard call) for live play-by-play, current
 * period/clock, and score. The pregame shape doesn't carry `drives` at all
 * (confirmed 2026-08-22, hours before kickoff) — fields are read
 * defensively throughout, since the in-progress shape can only be verified
 * once a game is actually live.
 */
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const COMMANDERS_ABBR = 'WSH';

async function fetchJson(url) {
  const text = await fetchText(url, { cache: false });
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    log.warn(`livegame: response from ${url} was not valid JSON`);
    return null;
  }
}

/**
 * The Commanders event ID that's either `in` progress or just went `post`
 * (final), or null if there's neither right now. Matching only `in` was a
 * real bug found 2026-08-22, hours after shipping: the instant a game
 * finishes and flips to `post`, that check returned null and the whole
 * pipeline stopped seeing the game at all, one tick before it could ever
 * write the last quarter's recap or the final-thoughts wrap-up. Including
 * `post` is safe against re-processing an old game forever, since
 * `updateLiveGame`'s own `targetPeriod <= lastRecappedPeriod` check already
 * no-ops once everything's been recapped, and the default scoreboard call
 * only ever returns the current week's games regardless.
 */
export async function findLiveEventId() {
  const data = await fetchJson(SCOREBOARD_URL);
  if (!data) return null;
  const event = (data.events || []).find(
    (e) =>
      ['in', 'post'].includes(e.competitions?.[0]?.status?.type?.state) &&
      e.competitions[0].competitors?.some((c) => c.team?.abbreviation === COMMANDERS_ABBR),
  );
  return event?.id || null;
}

/**
 * Flattens every play from every drive (previous + current) into one
 * chronological list, tagged with its quarter — the summary endpoint
 * nests plays under drives, not under a single top-level list, and a drive
 * can span a quarter boundary so plays are filtered by period after
 * flattening, not by which drive they came from.
 */
function flattenPlays(drives) {
  const buckets = [...(drives?.previous || []), drives?.current].filter(Boolean);
  const plays = [];
  for (const drive of buckets) {
    for (const play of drive.plays || []) {
      plays.push({
        period: play.period?.number ?? null,
        clock: play.clock?.displayValue ?? null,
        text: play.text || '',
        scoringPlay: !!play.scoringPlay,
      });
    }
  }
  return plays;
}

/**
 * Everything a quarter-recap prompt needs for one game snapshot: current
 * period/clock/state, the score, and every play so far this quarter (the
 * caller slices to "this quarter's plays" using `period`, since ESPN gives
 * the full game's plays, not a per-quarter list).
 */
export async function fetchLiveGame(eventId) {
  const data = await fetchJson(`${SUMMARY_URL}?event=${eventId}`);
  if (!data) {
    log.warn(`livegame: could not fetch summary for event ${eventId}`);
    return null;
  }

  const comp = data.header?.competitions?.[0];
  const status = comp?.status;
  const commanders = comp?.competitors?.find((c) => c.team?.abbreviation === COMMANDERS_ABBR);
  const opponent = comp?.competitors?.find((c) => c.team?.abbreviation !== COMMANDERS_ABBR);
  if (!commanders || !opponent) {
    log.warn(`livegame: event ${eventId} summary is missing one of the two competitors`);
    return null;
  }

  const plays = flattenPlays(data.drives);
  // `status.period` disappears entirely once a game goes final (confirmed
  // 2026-08-22, checking the real completed game right after this bug blocked
  // that game's own final recap) — only `status.type` survives. The actual
  // last period played is recoverable from the plays themselves, which keep
  // their period number regardless of game state.
  const lastPlayedPeriod = plays.reduce((max, p) => (p.period != null && p.period > max ? p.period : max), 0);
  const period = status?.period ?? (lastPlayedPeriod || null);

  return {
    eventId,
    state: status?.type?.state || null, // 'pre' | 'in' | 'post'
    period,
    clock: status?.displayClock ?? null,
    opponent: opponent.team?.displayName || null,
    commandersScore: commanders.score ?? null,
    opponentScore: opponent.score ?? null,
    isHome: commanders.homeAway === 'home',
    plays,
  };
}

/**
 * `entries` accumulates across the game (one per completed quarter, plus a
 * final one at game end) — a wholesale overwrite on every save, same as
 * roster.js/schedule.js/betting.js, since the caller always has the full
 * current list in memory rather than a partial one to merge.
 */
export async function saveLiveGameState(state) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

/** Null (never an error) if no game has ever been tracked, or the file hasn't been written yet. */
export async function loadLiveGameState() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`livegame: could not read state: ${err.message}`);
    return null;
  }
}
