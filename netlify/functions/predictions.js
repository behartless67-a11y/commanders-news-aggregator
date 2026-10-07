import { getStore } from '@netlify/blobs';
import { POLL_KEY_PATTERN, summarizePicks } from '../../src/lib/predictions.js';

/**
 * The crowd's pick for one game, for the sidebar's "Call your shot" card:
 * GET ?game=2026-10-11-NYG returns { game, count, commanders, opponent, winPct }.
 * Public, since every number in it is already an aggregate.
 *
 * One list() call per request (see src/lib/predictions.js for why the pick
 * lives in the key), and the CDN holds each answer for a minute, so a busy
 * Sunday morning reads the blob store about once a minute rather than once a
 * page view.
 */
export default async (req) => {
  const game = new URL(req.url).searchParams.get('game') || '';
  if (!POLL_KEY_PATTERN.test(game)) {
    return new Response(JSON.stringify({ error: 'unknown game' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { blobs } = await getStore('predictions').list({ prefix: `${game}/` }).catch(() => ({ blobs: [] }));
  const summary = summarizePicks(blobs.map((b) => b.key), game);

  return new Response(JSON.stringify(summary), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Netlify-CDN-Cache-Control': 'public, max-age=60',
    },
  });
};
