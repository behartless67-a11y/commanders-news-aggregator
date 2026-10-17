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
 * SCOPE: the Commanders beat accounts only (alwaysRelevant in
 * config/social.js), not the six national insiders. Two reasons. Every post
 * from a beat account is on topic, so this needs none of the keyword
 * relevance machinery the collector runs; and each account is a separate
 * upstream request, so the account list is the function's latency budget.
 * National insiders still reach the ticker the normal way, through the
 * scheduled collection.
 *
 * FRESHNESS: the fetching is src/lib/live-social.js, shared with the Social
 * Feed page's live mode. Until Oct 16 this went through collectAccount(),
 * whose fetch helper memoizes every URL with no expiry; on a warm instance
 * (which steady game-day polling guarantees) that meant serving the first
 * answer over and over. See live-social.js.
 */
import { SOCIAL_ACCOUNTS } from '../../config/social.js';
import { fetchLivePosts } from '../../src/lib/live-social.js';

// Not the browser-only accounts (Nicki): they aren't on the mirror at all,
// so looking them up here is a guaranteed miss every minute.
const BEAT_ACCOUNTS = SOCIAL_ACCOUNTS.filter((a) => a.alwaysRelevant && !a.viaBrowser);

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
  // All accounts at once; a slow or failed one just contributes nothing.
  const live = await fetchLivePosts(BEAT_ACCOUNTS);

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const byUrl = new Map();
  for (const { post } of live) {
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
