import { getStore } from '@netlify/blobs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { POLL_KEY_PATTERN, summarizePicks, buildBoard } from '../../src/lib/predictions.js';
import { BEN_PICKS, HIDDEN_PLAYERS } from '../../config/predictions.js';

/**
 * The numbers behind the "Call your shot" card. Public, since nothing in
 * either answer is anything a reader didn't choose to put on the board.
 *
 *   GET ?game=2026-10-11-NYG  the crowd's pick for one game:
 *                             { game, count, commanders, opponent, winPct }
 *   GET ?board=season         the season leaderboard (buildBoard() in
 *                             src/lib/predictions.js): standings, each scored
 *                             game's closest calls, and who's in for the next
 *
 * The crowd pick is one list() call (see src/lib/predictions.js for why the
 * pick lives in the key). The board is a list() plus one read per named pick,
 * a few dozen at most. The CDN holds each answer for a minute, so a busy
 * Sunday morning reads the blob store about once a minute rather than once a
 * page view. Final scores come from the schedule this deploy shipped with
 * (netlify.toml includes it), which the nightly data update keeps current.
 */
const CACHE = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, max-age=60',
};

export default async (req) => {
  const params = new URL(req.url).searchParams;
  if (params.get('board') === 'season') return board();

  const game = params.get('game') || '';
  if (!POLL_KEY_PATTERN.test(game)) {
    return new Response(JSON.stringify({ error: 'unknown game' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { blobs } = await getStore('predictions').list({ prefix: `${game}/` }).catch(() => ({ blobs: [] }));
  const summary = summarizePicks(blobs.map((b) => b.key), game);
  return new Response(JSON.stringify(summary), { headers: CACHE });
};

async function board() {
  let schedule = [];
  try {
    schedule = JSON.parse(await fs.readFile(path.resolve('data/schedule.json'), 'utf8'));
  } catch {
    // No schedule means no finals to score against; Ben's row and the pending
    // list still come back empty rather than as an error.
  }
  const store = getStore('leaderboard');
  const { blobs } = await store.list().catch(() => ({ blobs: [] }));
  const entries = await Promise.all(blobs.map(async ({ key }) => {
    const value = await store.get(key, { type: 'json' }).catch(() => null);
    const [game, slug] = key.split('/');
    return value && slug ? { ...value, game, slug } : null;
  }));
  const result = buildBoard(entries.filter(Boolean), schedule, { benPicks: BEN_PICKS, hidden: HIDDEN_PLAYERS });
  return new Response(JSON.stringify(result), { headers: CACHE });
}
