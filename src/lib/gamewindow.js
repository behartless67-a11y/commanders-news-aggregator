import { parseGameTime } from './dates.js';

/**
 * "Is a Commanders game in its live window right now?" — driven entirely by
 * the already-cached schedule (data/schedule.json, see schedule.js), not a
 * live ESPN poll. Kickoff times don't move once the schedule fetch has run,
 * so a static per-game window is enough to decide "should the 15-minute
 * ticker cadence be running" without hitting another API just to ask.
 *
 * 3 hours (not e.g. 3.5) is deliberately a little short for the occasional
 * long game rather than padded generously — this only gates an *extra*
 * refresh cadence on top of the normal 2-hour one, so running a bit short
 * costs a slightly-less-fresh ticker for the last few minutes of overtime,
 * never a missing one.
 */
const GAME_WINDOW_HOURS = Number(process.env.GAME_WINDOW_HOURS || 3);

/** Games with a parseable kickoff time, soonest first — byes and TBD games can't have a window at all. */
function withKickoff(games) {
  return (games || [])
    .filter((g) => !g.isBye && g.gametime)
    .map((g) => ({ ...g, kickoffIso: parseGameTime(g.gametime) }))
    .filter((g) => g.kickoffIso)
    .sort((a, b) => new Date(a.kickoffIso) - new Date(b.kickoffIso));
}

/** The one game (if any) whose [kickoff, kickoff + GAME_WINDOW_HOURS] window contains `now`. */
export function currentGameWindow(games, now = new Date()) {
  const nowMs = now.getTime();
  for (const g of withKickoff(games)) {
    const kickoffMs = new Date(g.kickoffIso).getTime();
    const endMs = kickoffMs + GAME_WINDOW_HOURS * 3600000;
    if (nowMs >= kickoffMs && nowMs <= endMs) return g;
  }
  return null;
}

export function isGameWindowActive(games, now = new Date()) {
  return currentGameWindow(games, now) !== null;
}
