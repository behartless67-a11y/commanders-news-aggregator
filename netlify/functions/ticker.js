/**
 * Live beat-reporter posts for the ticker, fetched at request time.
 *
 * WHY THIS EXISTS
 * ---------------
 * A reader wrote in during Week 1 to say the ticker is stale exactly when it
 * matters: he wants to see what JP Finlay or John Keim are saying while the
 * game is happening, and this site is static pages that only change when a
 * build deploys. Building more often is the obvious fix and the wrong one,
 * since deploy volume is what drives the hosting bill.
 *
 * So the ticker keeps its server-rendered posts (which is what search
 * engines, feed readers and anyone with JS off will see) and site.js layers
 * fresh ones on top from here. Nothing about the page depends on this
 * responding: a failure, a timeout or a blocked request all leave the
 * built-in ticker exactly as it was.
 *
 * SCOPE: the seven Commanders beat accounts only (alwaysRelevant in
 * config/social.js), not the six national insiders. Two reasons. Every post
 * from a beat account is on topic, so this needs none of the keyword
 * relevance machinery the collector runs; and each account is a separate
 * upstream request behind a shared per-host throttle, so the account list is
 * the function's latency budget. National insiders still reach the ticker
 * the normal way, through the scheduled collection.
 */
import { SOCIAL_ACCOUNTS } from '../../config/social.js';
import { collectAccount } from '../../src/collectors/mastodon.js';

const BEAT_ACCOUNTS = SOCIAL_ACCOUNTS.filter((a) => a.alwaysRelevant);

/** Matches the collector's own bar so a post can't appear here and nowhere else. */
const MIN_TEXT_CHARS = Number(process.env.MIN_SOCIAL_TEXT_CHARS || 25);
const MAX_AGE_DAYS = Number(process.env.MAX_SOCIAL_AGE_DAYS || 3);
const MAX_POSTS = Number(process.env.MAX_TICKER_POSTS || 30);

/**
 * How long the CDN may serve a cached copy. This, not the client's polling
 * interval, is what bounds load on the upstream mirror: a thousand readers
 * refreshing inside the same minute produce one origin request between them.
 * stale-while-revalidate means a reader never waits on the refetch either.
 */
const CDN_MAX_AGE = Number(process.env.TICKER_CDN_MAX_AGE || 60);

export default async () => {
  // Parallel, though the per-host throttle in http.js still paces the actual
  // requests. Sequential would add each response's latency on top of that
  // pacing and is what would put this near the function timeout.
  const settled = await Promise.allSettled(BEAT_ACCOUNTS.map((a) => collectAccount(a)));

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const byUrl = new Map();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const post of result.value) {
      if (!post?.url || !post.text || post.text.length < MIN_TEXT_CHARS) continue;
      const at = Date.parse(post.publishedAt || '');
      if (Number.isFinite(at) && at < cutoff) continue;
      byUrl.set(post.url, {
        handle: post.handle,
        text: post.text,
        url: post.url,
        publishedAt: post.publishedAt || null,
      });
    }
  }

  const posts = [...byUrl.values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, MAX_POSTS);

  // Every account failing means the mirror is down or blocking. Returning 503
  // with no body lets site.js leave the built-in ticker alone, rather than
  // replacing real posts with an empty rail.
  if (!posts.length) {
    return new Response(JSON.stringify({ posts: [] }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(JSON.stringify({ posts, fetchedAt: new Date().toISOString() }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${Math.round(CDN_MAX_AGE / 2)}`,
      'netlify-cdn-cache-control': `public, s-maxage=${CDN_MAX_AGE}, stale-while-revalidate=300`,
    },
  });
};

export const config = { path: '/api/ticker' };
