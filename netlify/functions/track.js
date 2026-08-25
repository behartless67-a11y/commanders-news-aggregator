import { getStore } from '@netlify/blobs';

/**
 * Fired by two tiny beacons in site.js — the only way to get real traffic
 * numbers without a paid analytics add-on or a third-party script, since
 * Netlify's own CDN logs aren't exposed to a site owner on this plan.
 * "Basic statistics," deliberately: a running total, a per-day trend (now
 * with a same-day unique count alongside it), an all-time top path list,
 * where traffic actually comes from, and which sources readers click through
 * to read — not a replacement for real analytics tooling.
 *
 * Two event shapes share this one endpoint rather than two separate
 * functions, distinguished by `type`:
 *   - a pageview (default, `type` omitted) — { path, referrer, sid }
 *   - an outbound click (`type: 'outbound'`) — { sourceId }
 * A single endpoint keeps the beacon wiring in site.js to one URL and lets
 * both share the underlying bump() helper and store.
 */

const MAX_LEN = 200;

/**
 * Recognizable referring sites get a friendly label instead of their raw
 * hostname, matched on the registrable domain so a mobile subdomain
 * (m.facebook.com) or a link-shortener host (t.co) still lands in the right
 * bucket. Anything unmatched falls through to its own bare hostname — still
 * useful (a specific blog linking in is worth knowing), just not worth
 * hand-mapping every possible one up front.
 */
const REFERRER_LABELS = [
  [/(^|\.)google\.[a-z.]+$/i, 'Google'],
  [/(^|\.)bing\.com$/i, 'Bing'],
  [/(^|\.)duckduckgo\.com$/i, 'DuckDuckGo'],
  [/(^|\.)yahoo\.com$/i, 'Yahoo'],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/i, 'X (Twitter)'],
  [/(^|\.)reddit\.com$/i, 'Reddit'],
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/i, 'LinkedIn'],
  [/(^|\.)discord(app)?\.com$/i, 'Discord'],
  [/(^|\.)flipboard\.com$/i, 'Flipboard'],
  [/^t\.me$/i, 'Telegram'],
];

/**
 * Returns a display label, or null when the click shouldn't be counted as a
 * referral at all — an empty/missing referrer (typed URL, bookmark, most
 * in-app browsers) is a real "direct" visit, but a referrer pointing back at
 * this same site is just a reader clicking from the river to a Blog post; that's
 * internal navigation, not a traffic source, so it's excluded rather than
 * inflating a "Direct" bucket that's supposed to mean something specific.
 */
function referrerBucket(rawReferrer, requestHost) {
  if (!rawReferrer) return 'Direct / no referrer';
  let url;
  try {
    url = new URL(rawReferrer);
  } catch {
    return 'Direct / no referrer';
  }
  const host = url.hostname.replace(/^www\./, '');
  const ownHost = String(requestHost || '').replace(/^www\./, '');
  if (ownHost && host === ownHost) return null;
  for (const [pattern, label] of REFERRER_LABELS) {
    if (pattern.test(host)) return label;
  }
  return host;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json().catch(() => ({}));
  const store = getStore('site-stats');

  // Read-then-write, same as the rest of this file — Blobs has no atomic
  // increment, and at this site's traffic volume the occasional lost count
  // under concurrent requests is the same acceptable-and-already-present risk
  // the original single-counter version of this function carried.
  const bump = async (key) => {
    const current = Number((await store.get(key, { type: 'text' })) || '0');
    await store.set(key, String(current + 1));
  };

  if (body.type === 'outbound') {
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.slice(0, MAX_LEN) : null;
    if (!sourceId) return new Response(null, { status: 204 });
    await Promise.all([bump('outboundTotal'), bump(`outbound:${encodeURIComponent(sourceId)}`)]);
    return new Response(null, { status: 204 });
  }

  const path = typeof body.path === 'string' ? body.path.slice(0, MAX_LEN) : '/';
  const day = new Date().toISOString().slice(0, 10);

  const tasks = [bump('total'), bump(`day:${day}`), bump(`path:${encodeURIComponent(path)}`)];

  const bucket = referrerBucket(
    typeof body.referrer === 'string' ? body.referrer.slice(0, MAX_LEN) : '',
    req.headers.get('host'),
  );
  if (bucket) tasks.push(bump(`ref:${encodeURIComponent(bucket)}`));

  // Unique-visitor count for today, deduped against a per-day session-id set
  // rather than a persistent cookie — `sid` (see site.js) lives in
  // sessionStorage, so it identifies "this browser tab today," never a
  // person across visits, and nothing here can turn it back into one: it's a
  // client-generated random string with no other data attached.
  //
  // The set itself (`visitors:<date>`) is read-modify-written per pageview,
  // same non-atomic tradeoff as bump() above, and is never pruned — it's
  // written once a day per date and only ever read back on that same date, so
  // old ones just sit unused. Acceptable at this site's scale; revisit if
  // storage ever becomes a real cost.
  const sid = typeof body.sid === 'string' ? body.sid.slice(0, 100) : null;
  if (sid) {
    const visitorsKey = `visitors:${day}`;
    const seen = (await store.get(visitorsKey, { type: 'json' }).catch(() => null)) || [];
    if (!seen.includes(sid)) {
      seen.push(sid);
      tasks.push(store.setJSON(visitorsKey, seen), bump(`day:${day}:uniques`));
    }
  }

  await Promise.all(tasks);
  return new Response(null, { status: 204 });
};
