import { fetchText } from '../lib/http.js';
import { log } from '../lib/log.js';
import { sha1, stripHtml, canonicalizeUrl } from '../lib/text.js';
import { toIso } from '../lib/dates.js';

/**
 * Reads public Mastodon timelines. See config/social.js for why the reporters'
 * tweets are reachable this way at all.
 *
 * Nothing here is authenticated and nothing scrapes HTML — these are the
 * instance's documented public API endpoints.
 */

const INSTANCE = process.env.SOCIAL_INSTANCE || 'https://mastodon.social';
const BRIDGE = process.env.SOCIAL_BRIDGE || 'sportsbots.xyz';
const PER_ACCOUNT = Number(process.env.SOCIAL_PER_ACCOUNT || 8);
const PER_TAG = Number(process.env.SOCIAL_PER_TAG || 25);

async function fetchJson(url) {
  const text = await fetchText(url);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    log.warn(`social: unparseable JSON from ${url} (${err.message})`);
    return null;
  }
}

/**
 * The bridge decorates mirrored tweets in a few consistent ways that look like
 * junk in a one-line ticker:
 *
 *   - Quote-posts are prefixed with `RE: <link to the quoted post>`.
 *   - Long URLs are re-emitted with whitespace injected at arbitrary points
 *     ("https:// sportsbots.xyz/users/JosinaAnd erson/statuses/123"), so a
 *     single `https?://\S+` match stops at the first space and leaves debris
 *     like "erson/statuses/123" stranded in the text.
 *   - Hashtags and mentions render as separate nodes, so stripping tags leaves
 *     "# Commanders" rather than "#Commanders".
 *
 * None of these are links we can repair, so the remnants get dropped — the
 * permalink to the original post is what we actually link to.
 */
function cleanPostText(html) {
  let text = stripHtml(html);

  // Take the quote-post prefix out whole, up to and including the post ID, so
  // spaces injected inside the URL can't leave a tail behind.
  text = text.replace(/^RE:\s*.*?statuses?\/\d+/is, '');

  text = text.replace(/https?:\/\/\s*\S*/gi, '');
  // Leftover fragments of a split URL: a bare domain, or any stray path ending
  // in a status ID.
  text = text.replace(/\S*\bstatuses?\/\d+\S*/gi, '');
  text = text.replace(/\b\S+\.(?:com|org|net|xyz|io|co|gg|tv)\/\S*/gi, '');
  text = text.replace(/\bvia\s+@\S+@twitter\.com\s+App\b/gi, '');

  // Reattach hashtag/mention sigils to their word.
  text = text.replace(/([#@])\s+(?=[A-Za-z0-9_])/g, '$1');

  return text.replace(/\s+/g, ' ').trim();
}

/** Mirror accounts carry a 🤖 marker (and single-tweet stubs a 💬𝑋 prefix). */
function cleanDisplayName(name) {
  return String(name || '')
    .replace(/[💬𝑋🤖]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The bridge publishes each mirrored tweet with its original x.com permalink,
 * so the ticker can link to the real post rather than to the mirror.
 */
function permalinkOf(status) {
  const url = status.url || status.uri || '';
  if (/(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/\d+/i.test(url)) {
    return canonicalizeUrl(url.replace(/^https?:\/\/(?:www\.)?twitter\.com/i, 'https://x.com'));
  }
  return canonicalizeUrl(url);
}

/** Strip the bridge suffix so "JPFinlayNBCS@sportsbots.xyz" reads as "@JPFinlayNBCS". */
function handleOf(status) {
  const acct = status.account?.acct || '';
  return acct.split('@')[0];
}

function normalize(status, { account, sourceKey }) {
  // A boost carries the real post nested inside it.
  const post = status.reblog || status;
  const url = permalinkOf(post);
  const text = cleanPostText(post.content);
  if (!url || !text) return null;

  const handle = handleOf(post);
  // `account`'s name/label describe the timeline we asked for, not necessarily
  // this post's actual author — a boosted post arrives with the booster's
  // config attached unless we check. Only apply them when the post is the
  // watched account's own; otherwise fall back the same way a tag-timeline
  // stranger already does.
  const isOwnPost = Boolean(account) && handle.toLowerCase() === account.handle.toLowerCase();
  // mastodon.social's own cached copy, not the tweet's original pbs.twimg.com
  // URL — same reasoning as the Beat Writers avatars, one less thing to break
  // if X ever changes how it serves media to third parties.
  const images = (post.media_attachments || [])
    .filter((m) => m.type === 'image' && m.url)
    .map((m) => m.url);
  return {
    id: `social-${sha1(url).slice(0, 12)}`,
    url,
    text,
    handle,
    author: (isOwnPost && account.name) || cleanDisplayName(post.account?.display_name) || handle,
    label: (isOwnPost && account.label) || '',
    sourceKey,
    images,
    publishedAt: toIso(post.created_at),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Resolve a handle to this instance's local numeric ID. Done per run rather
 * than hardcoded in config, so a handle the bridge has dropped shows up as a
 * named warning instead of a silently dead ID.
 */
async function resolveAccountId(handle) {
  const url = `${INSTANCE}/api/v1/accounts/lookup?acct=${encodeURIComponent(`${handle}@${BRIDGE}`)}`;
  const data = await fetchJson(url);
  if (!data || !data.id) return null;
  return data.id;
}

export async function collectAccount(account) {
  const id = await resolveAccountId(account.handle);
  if (!id) {
    log.warn(`social: @${account.handle} is not mirrored on ${BRIDGE} — skipped`);
    return [];
  }

  const url = `${INSTANCE}/api/v1/accounts/${id}/statuses?limit=${PER_ACCOUNT}`;
  const statuses = await fetchJson(url);
  if (!Array.isArray(statuses)) {
    log.warn(`social: no timeline for @${account.handle}`);
    return [];
  }

  return statuses.map((s) => normalize(s, { account, sourceKey: `@${account.handle}` })).filter(Boolean);
}

export async function collectTag(entry) {
  const url = `${INSTANCE}/api/v1/timelines/tag/${encodeURIComponent(entry.tag)}?limit=${PER_TAG}`;
  const statuses = await fetchJson(url);
  if (!Array.isArray(statuses)) {
    log.warn(`social: no timeline for #${entry.tag}`);
    return [];
  }

  // Tag posts come from arbitrary accounts, so the author name has to be read
  // off each post instead of taken from config.
  return statuses.map((s) => normalize(s, { account: null, sourceKey: entry.name })).filter(Boolean);
}
