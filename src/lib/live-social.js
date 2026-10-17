import { normalizeStatus, INSTANCE, BRIDGE, PER_ACCOUNT } from '../collectors/mastodon.js';

/**
 * The reporters' newest posts, fetched fresh, for the two live game-day
 * functions: the ticker (netlify/functions/ticker.js, /api/ticker) and the
 * Social Feed page (netlify/functions/social-live.js).
 *
 * Same mirror and same normalize() as collectAccount() in
 * src/collectors/mastodon.js, but not through fetchText() in http.js. That
 * keeps a memo of every URL it has fetched, which is right for a collection
 * run (one fetch per URL per run) and wrong for a function: a warm Netlify
 * instance kept the memo between requests, and during a game, readers polling
 * every minute keep the instance warm, so /api/ticker kept answering with
 * whatever it fetched first. It memoized failures too, so one upstream hiccup
 * blanked that reporter for as long as the instance lived. Found Oct 16, after
 * a reader on r/Commanders said posts showed up on the site well after they
 * went out.
 *
 * The one thing kept between requests is each handle's numeric account id,
 * which doesn't change, and only once a lookup has succeeded.
 */
const accountIds = new Map();

async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'TheBurgundyWire/1.0 (+https://theburgundywire.com)' },
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function accountId(handle) {
  if (accountIds.has(handle)) return accountIds.get(handle);
  const data = await getJson(`${INSTANCE}/api/v1/accounts/lookup?acct=${encodeURIComponent(`${handle}@${BRIDGE}`)}`);
  const id = data?.id || null;
  if (id) accountIds.set(handle, id);
  return id;
}

async function postsFor(account) {
  const id = await accountId(account.handle);
  if (!id) return [];
  const statuses = await getJson(`${INSTANCE}/api/v1/accounts/${id}/statuses?limit=${PER_ACCOUNT}`);
  if (!Array.isArray(statuses)) return [];
  return statuses
    .map((s) => normalizeStatus(s, { account, sourceKey: `@${account.handle}` }))
    .filter(Boolean)
    .map((post) => ({ post, account }));
}

/**
 * Every account's newest posts, all fetched at once, deduped by id and sorted
 * newest first, as { post, account } pairs so each caller can apply its own
 * bar. An account that fails just contributes nothing.
 */
export async function fetchLivePosts(accounts) {
  const results = await Promise.allSettled(accounts.map(postsFor));
  const seen = new Set();
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter(({ post }) => (seen.has(post.id) ? false : seen.add(post.id)))
    .sort((a, b) => Date.parse(b.post.publishedAt || 0) - Date.parse(a.post.publishedAt || 0));
}
