/**
 * Ben's own number for each game, shown under the reader poll ("Call your
 * shot" in the sidebar) once he's put it in writing in a pregame post, and
 * scored on the season leaderboard alongside the readers.
 *
 * Keyed the same way the poll keys its picks: the kickoff date in Eastern time
 * and the opponent's abbreviation from the schedule, so "2026-10-11-NYG" is the
 * Giants at home on October 11. Until a game has an entry here, the widget
 * says his number is coming in the pregame post.
 *
 *   '2026-10-11-NYG': { commanders: 24, opponent: 17 },
 */
export const BEN_PICKS = {
  // "Full Volume" (data/originals/full-volume.json), Oct 8: we keep it close, then pull away.
  '2026-10-11-NYG': { commanders: 24, opponent: 20 },
  // "Turning the Page" (data/originals/turning-the-page.json), Oct 16: we win, and only God knows why.
  '2026-10-19-SF': { commanders: 17, opponent: 16 },
};

/**
 * Leaderboard names to take off the board, as typed (case and spacing don't
 * matter). Their picks still count toward the crowd's number. The automatic
 * filter in src/lib/predictions.js catches the obvious stuff; this is for
 * anything it misses.
 */
export const HIDDEN_PLAYERS = [];
