import { parseGameTime, TZ } from './dates.js';

/**
 * The reader score poll ("Call your shot" in the sidebar). Shared by the build,
 * which renders the form for the next game, and by two Netlify Functions:
 * submission-created.js, which files each pick, and predictions.js, which
 * hands back the crowd's numbers.
 *
 * A pick is stored as a blob whose key carries the whole pick,
 * "<game>/<commanders>-<opponent>/<id>", with an empty value. Totting up a
 * game is then a single list() call rather than one read per pick, which is
 * what keeps the results endpoint cheap enough to hit from every page view.
 */

/** Picks stay open until kickoff, and the card keeps showing that game's crowd pick until a final score is in the schedule. */
const LOCKED_GAME_GRACE_MS = 12 * 3600000;

export const MAX_SCORE = 99;

/** "2026-10-11-NYG": the kickoff date in Eastern time and the opponent's abbreviation. */
export function pollKey(game) {
  const iso = parseGameTime(game?.gametime);
  if (!iso || !game.opponentAbbr) return null;
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
  return `${day}-${game.opponentAbbr}`;
}

export const POLL_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}-[A-Z]{2,3}$/;

/**
 * The game the poll is about: the first one without a final score whose
 * kickoff isn't long gone. Includes the game in progress, so during a game the
 * card shows the locked-in crowd pick instead of jumping ahead a week.
 */
export function pollGame(schedule, now = Date.now()) {
  for (const g of schedule || []) {
    if (g.isBye || g.result || g.season !== 'regular') continue;
    const iso = parseGameTime(g.gametime);
    if (!iso || Date.parse(iso) < now - LOCKED_GAME_GRACE_MS) continue;
    const key = pollKey(g);
    if (!key) continue;
    return { key, iso, opponent: g.opponentShort || g.opponent, opponentAbbr: g.opponentAbbr, homeAway: g.homeAway };
  }
  return null;
}

/** A score as typed into the form, or null when it isn't a whole number in range. */
export function parseScore(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n <= MAX_SCORE ? n : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The crowd's numbers from a game's blob keys. Medians, not averages: one
 * reader typing 99-0 moves an average by several points and a median not at
 * all, and "the typical reader says 24-17" is the sentence the card wants
 * anyway.
 */
export function summarizePicks(keys, game) {
  const picks = [];
  for (const key of keys) {
    const m = /^([^/]+)\/(\d{1,2})-(\d{1,2})\//.exec(key);
    if (!m || m[1] !== game) continue;
    picks.push({ us: Number(m[2]), them: Number(m[3]) });
  }
  if (!picks.length) return { game, count: 0 };
  const wins = picks.filter((p) => p.us > p.them).length;
  return {
    game,
    count: picks.length,
    commanders: median(picks.map((p) => p.us)),
    opponent: median(picks.map((p) => p.them)),
    winPct: Math.round((wins / picks.length) * 100),
  };
}
