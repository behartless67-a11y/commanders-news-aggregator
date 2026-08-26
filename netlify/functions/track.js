import { getStore } from '@netlify/blobs';
import { TZ } from '../../src/lib/dates.js';

/**
 * Fired by two tiny beacons in site.js — the only way to get real traffic
 * numbers without a paid analytics add-on or a third-party script, since
 * Netlify's own CDN logs aren't exposed to a site owner on this plan.
 * "Basic statistics," deliberately: a running total, day/month/hour/weekday
 * trends, same-day and ever-returning visitor counts, an all-time top path
 * list, where traffic actually comes from, which sources readers click
 * through to read, and a rough browser/OS/device/language split — not a
 * replacement for real analytics tooling.
 *
 * Two event shapes share this one endpoint rather than two separate
 * functions, distinguished by `type`:
 *   - a pageview (default, `type` omitted) — { path, referrer, sid, returning, viewportWidth }
 *   - an outbound click (`type: 'outbound'`) — { sourceId }
 * A single endpoint keeps the beacon wiring in site.js to one URL and lets
 * both share the underlying bump() helper and store.
 *
 * Every bucketing decision here — referrer, browser, OS, device, language —
 * happens server-side off signals the browser already sends (a header) or a
 * raw number the client has no reason to lie about (viewport width), rather
 * than trusting a pre-labeled string from the client. That keeps the set of
 * possible Blobs keys bounded and predictable no matter what a browser
 * extension or a stray script sends in.
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

/**
 * Coarse browser/OS names off the User-Agent header every request already
 * sends — no client code needed. Order matters: Edge and Opera both carry a
 * "Chrome/" token for compatibility, and iOS Chrome (CriOS) carries "Safari/"
 * too, so the specific tokens are checked before the generic ones they'd
 * otherwise be swallowed by.
 */
function parseUserAgent(ua) {
  const s = String(ua || '');
  let browser = 'Other';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/CriOS\//.test(s)) browser = 'Chrome';
  else if (/Chrome\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';

  let os = 'Other';
  if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  return { browser, os };
}

/**
 * Matches the site's own responsive breakpoints (see site.css — 640px is the
 * phone-nav-dropdown cutoff, 900px is where the sidebar becomes two columns,
 * 1400px is where the video/schedule rail itself goes two-across), so this
 * answers "how many readers see the layout the mobile-specific CSS was
 * written for" rather than an arbitrary phone/tablet/desktop split that
 * doesn't line up with any real decision this site has made.
 *
 * Returns null on a missing/invalid width rather than guessing — the caller
 * skips the counter entirely for that pageview instead of miscounting it.
 */
function deviceBucket(rawWidth) {
  const width = Number(rawWidth);
  if (!Number.isFinite(width) || width <= 0) return null;
  if (width <= 640) return 'Phone';
  if (width <= 899) return 'Tablet';
  if (width <= 1399) return 'Desktop';
  return 'Wide desktop';
}

/**
 * Only the primary language subtag ("en" out of "en-US"), not the full
 * Accept-Language header — a full header (with its exact ordering and
 * quality values) is specific enough to help fingerprint a browser; the
 * primary subtag alone is not, and a rough "how many non-English readers
 * does this get" is genuinely useful for an English-only site while the raw
 * header buys nothing more for that question.
 */
const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian',
  ar: 'Arabic', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', hi: 'Hindi',
};

function languageBucket(acceptLanguage) {
  if (!acceptLanguage) return 'Unknown';
  const primary = acceptLanguage.split(',')[0].split(';')[0].trim().split('-')[0].toLowerCase();
  return LANGUAGE_NAMES[primary] || primary.toUpperCase() || 'Unknown';
}

/**
 * Hour (00-23) and weekday, in the site's own timezone rather than UTC —
 * "when do readers show up" is only useful measured against the clock they
 * actually keep. Uses Intl rather than hand-rolled offset math, same as the
 * site's own date formatting in src/lib/dates.js.
 */
function hourAndWeekday(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const hour = String(parseInt(parts.find((p) => p.type === 'hour').value, 10)).padStart(2, '0');
  const weekday = parts.find((p) => p.type === 'weekday').value;
  return { hour, weekday };
}

export default async (req, context) => {
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
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);

  const tasks = [
    bump('total'),
    bump(`day:${day}`),
    bump(`path:${encodeURIComponent(path)}`),
    // A direct forward-written counter, not a sum of 30 daily counters read
    // back later — a year of history is 12 cheap reads this way instead of
    // ~365, at the cost of one extra bump() here.
    bump(`month:${month}`),
  ];

  const bucket = referrerBucket(
    typeof body.referrer === 'string' ? body.referrer.slice(0, MAX_LEN) : '',
    req.headers.get('host'),
  );
  if (bucket) tasks.push(bump(`ref:${encodeURIComponent(bucket)}`));

  const { browser, os } = parseUserAgent(req.headers.get('user-agent'));
  tasks.push(bump(`browser:${browser}`), bump(`os:${os}`));

  const device = deviceBucket(body.viewportWidth);
  if (device) tasks.push(bump(`device:${device}`));

  tasks.push(bump(`lang:${languageBucket(req.headers.get('accept-language'))}`));

  const { hour, weekday } = hourAndWeekday(now);
  tasks.push(bump(`hour:${hour}`), bump(`dow:${weekday}`));

  // Netlify resolves this from the request's IP at the edge and hands the
  // Function only the derived place-name fields — country/subdivision(state)
  // name and code, city, coordinates, postal code — not a separate lookup
  // this code has to make. context.ip (the raw address) is available on the
  // same object and is deliberately never touched here or written anywhere:
  // country/state is a coarse-enough bucket to be a reasonable thing to
  // aggregate, the address it was derived from is not, and the whole point
  // of this file has been to never store anything that specific. Subdivision
  // is skipped without a country ("state" isn't a meaningful bucket on its
  // own — Virginia and a same-named subdivision in another country would
  // collide) and geo itself is skipped entirely when Netlify doesn't supply
  // it (some local/CI requests won't have it), rather than bumping a
  // misleading "Unknown".
  const geo = context?.geo;
  if (geo?.country?.name) {
    tasks.push(bump(`country:${encodeURIComponent(geo.country.name)}`));
    if (geo.subdivision?.name) {
      tasks.push(bump(`state:${encodeURIComponent(`${geo.subdivision.name}, ${geo.country.code || geo.country.name}`)}`));
    }
  }

  // Ever-returning vs. new — see the localStorage flag in site.js. Two
  // all-time running totals, same shape as `total` itself; no per-visitor
  // record is kept, just which of two buckets this one pageview falls into.
  tasks.push(bump(body.returning ? 'visitor:return' : 'visitor:new'));

  // Unique-visitor count for today, deduped against a per-day session-id set
  // rather than a persistent cookie — `sid` (see site.js) lives in
  // sessionStorage, so it identifies "this browser tab today," never a
  // person across visits, and nothing here can turn it back into one: it's a
  // client-generated random string with no other data attached. (Separate
  // from the returning-visitor flag above, which is the opposite lifetime —
  // that one deliberately does outlive the tab, this one deliberately
  // doesn't; see the comments in site.js for why both exist.)
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
