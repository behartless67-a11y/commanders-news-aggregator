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

/*
 * The season leaderboard. A reader who leaves a name with their pick gets a
 * second record, in the `leaderboard` blob store at "<game>/<slug>", holding
 * the name and the score. One per name per game, so a resubmitted pick
 * replaces the old one instead of counting twice. The anonymous key above is
 * still written for every pick, named or not, so the crowd's median doesn't
 * care whether anyone typed a name.
 *
 * Scoring is pick'em with a tiebreaker, because it explains itself in one
 * line: the most games with the right winner leads, and between equal
 * records, the smaller average miss (points off on our score plus points off
 * on theirs) wins. Ben's own picks from config/predictions.js are on the
 * board too, under his name, which readers can't take.
 */

export const MAX_NAME_LENGTH = 20;

/**
 * Names go up on a public page, so anything that reads as a slur, profanity
 * or a link is kept off the board. The pick still counts for the crowd. This
 * is a backstop, not moderation: HIDDEN_PLAYERS in config/predictions.js
 * takes anything off by hand.
 */
// Unmistakable anywhere in a name, even with the spaces and dots squeezed out.
const BLOCKED_ANYWHERE = /(fuck|shit|cunt|bitch|nigg|nazi|hitler|pussy|whore|slut|retard|kike|chink|tranny|porn|penis|vagina)/i;
// Only as whole words, so Draper, Hancock and Spicer still get on the board.
const BLOCKED_WORD = /\b(dick|cock|anal|rape|spic|fag|sex|ass)\b/i;
const LINKISH = /(https?|www\.|\.(com|net|org|io|co|xyz)\b)/i;

/** The name as it will show on the board, or '' when there isn't a usable one. */
export function cleanName(value) {
  const name = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} .'_-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  if (!name || LINKISH.test(name) || BLOCKED_WORD.test(name) || BLOCKED_ANYWHERE.test(name.replace(/[\s._-]/g, ''))) return '';
  return name;
}

/** "Big Al" and "big  al" are the same player; the board keys on this. */
export function nameSlug(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugs readers can't claim, because they belong to the house entries. */
export const HOUSE_SLUGS = new Set(['ben']);

/** A reader's entry under a house name goes on the board as "Ben (reader)". */
export function playerFor(value) {
  const name = cleanName(value);
  if (!name) return null;
  const slug = nameSlug(name);
  if (!slug) return null;
  if (HOUSE_SLUGS.has(slug)) return { name: `${name} (reader)`, slug: `${slug}-reader` };
  return { name, slug };
}

function outcome(us, them) {
  return Math.sign(us - them);
}

/** Final scores by poll key, Commanders first, from the schedule's "22 - 24" strings. */
export function finals(schedule) {
  const out = new Map();
  for (const g of schedule || []) {
    if (g.season !== 'regular' || !g.result) continue;
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(g.points || ''));
    const key = pollKey(g);
    if (!m || !key) continue;
    out.set(key, { us: Number(m[1]), them: Number(m[2]), opponent: g.opponentShort || g.opponent });
  }
  return out;
}

export function scorePick(pick, final) {
  return {
    right: outcome(pick.commanders, pick.opponent) === outcome(final.us, final.them),
    miss: Math.abs(pick.commanders - final.us) + Math.abs(pick.opponent - final.them),
  };
}

/**
 * Everything the leaderboard shows, from the stored named picks plus Ben's.
 *   standings: one row per player, best first
 *   games:     each scored game, newest first, with its three closest calls
 *   pending:   who's in for the open game. Names only; the picks themselves
 *              stay hidden until there's a final to hold them against.
 *   finals:    every final score by poll key
 */
export function buildBoard(entries, schedule, { benPicks = {}, hidden = [], now = Date.now() } = {}) {
  const hide = new Set(hidden.map((n) => nameSlug(n)));
  const picks = entries.filter((e) => e && e.slug && !hide.has(e.slug));
  for (const [game, p] of Object.entries(benPicks)) {
    picks.push({ game, slug: 'ben', name: 'Ben', commanders: p.commanders, opponent: p.opponent, house: true });
  }

  const done = finals(schedule);
  const players = new Map();
  const games = new Map();
  for (const p of picks) {
    const final = done.get(p.game);
    if (!final) continue;
    const { right, miss } = scorePick(p, final);
    const row = players.get(p.slug) || { name: p.name, slug: p.slug, right: 0, played: 0, miss: 0, house: Boolean(p.house) };
    row.name = p.name;
    row.played += 1;
    row.right += right ? 1 : 0;
    row.miss += miss;
    players.set(p.slug, row);
    const game = games.get(p.game) || { game: p.game, opponent: final.opponent, final: { us: final.us, them: final.them }, calls: [] };
    game.calls.push({ name: p.name, commanders: p.commanders, opponent: p.opponent, right, miss });
    games.set(p.game, game);
  }

  const standings = [...players.values()]
    .map((r) => ({ ...r, avgMiss: Math.round((r.miss / r.played) * 10) / 10 }))
    .sort((a, b) => b.right - a.right || a.avgMiss - b.avgMiss || b.played - a.played || a.name.localeCompare(b.name));

  const scored = [...games.values()]
    .sort((a, b) => b.game.localeCompare(a.game))
    .map(({ calls, ...g }) => ({
      ...g,
      players: calls.length,
      closest: calls.sort((a, b) => a.miss - b.miss || Number(b.right) - Number(a.right)).slice(0, 3),
    }));

  const open = pollGame(schedule, now);
  const pending = open
    ? {
      game: open.key,
      opponent: open.opponent,
      names: [...new Set(picks.filter((p) => p.game === open.key).map((p) => p.name))].sort((a, b) => (a === 'Ben') - (b === 'Ben') || a.localeCompare(b)),
    }
    : null;

  // Every final, picked or not, for the "Readers called it" box on a post
  // about a game nobody named themselves for.
  return { standings, games: scored, pending, finals: Object.fromEntries(done) };
}
