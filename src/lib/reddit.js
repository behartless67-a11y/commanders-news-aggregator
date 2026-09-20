import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * r/Commanders, for the Monday post's "what the fanbase was saying" material.
 *
 * Deliberately never rendered in the river or a sidebar. The feed carries no
 * score, no upvotes and no flair (only title, author, link and timestamp), so
 * nothing here can be sorted by quality, only by recency, and an unfiltered
 * "latest from the sub" widget would put a meme next to an injury report under
 * Ben's own brand. Handing the raw week to the Monday generator instead makes
 * the model the quality filter the data doesn't come with, and a post that
 * quotes the sub reads better than a box that embeds it.
 *
 * Two Atom feeds, because they answer different questions:
 *   /r/Commanders/.rss           what the sub posted
 *   /r/Commanders/comments/.rss  what the sub actually said
 * Reddit's JSON API is 403 from here; these two are not.
 *
 * Only ever the newest 25 per feed, so a week's worth has to be accumulated
 * across runs (see mergeEntries) rather than fetched on Monday morning.
 */

const SUBREDDIT = 'Commanders';
const POSTS_URL = `https://www.reddit.com/r/${SUBREDDIT}/.rss`;
const COMMENTS_URL = `https://www.reddit.com/r/${SUBREDDIT}/comments/.rss`;

const CACHE_PATH = path.join(DATA_DIR, 'reddit.json');

/** A little longer than the Monday post's own window, so nothing falls out mid-week. */
const KEEP_DAYS = Number(process.env.REDDIT_KEEP_DAYS || 9);

/** Hard ceilings so an accumulating cache can't grow without bound. */
const MAX_POSTS = 400;
const MAX_COMMENTS = 600;

/** A comment longer than this is a wall of text no prompt needs in full. */
const MAX_COMMENT_CHARS = 600;

/**
 * Bots and the daily container threads. These are the bulk of what a
 * recency-sorted feed surfaces and none of it is anybody's opinion.
 */
const SKIP_AUTHORS = new Set(['/u/automoderator', '/u/[deleted]']);
const SKIP_TITLE_PATTERNS = [
  /^daily open discussion/i,
  /^game thread/i,
  /^post[- ]game thread/i,
  /^pregame thread/i,
];

/**
 * Reddit rate-limits hard on a short window: one request lands, a second a few
 * seconds later gets a 429, and it clears after roughly fifteen seconds.
 * http.js retries 429s but only three times at 1.2s and 2.4s, which is not
 * long enough to outlast that window, so this waits properly. `cache: false`
 * matters, because fetchText memoizes a null and a cached null would make
 * every retry a no-op.
 */
async function fetchFeed(url, label) {
  const waits = [0, 6000, 12000, 20000];
  for (let i = 0; i < waits.length; i += 1) {
    if (waits[i]) await new Promise((r) => setTimeout(r, waits[i]));
    const text = await fetchText(url, { cache: false });
    if (text && text.includes('<entry')) return text;
    log.debug(`reddit: ${label} attempt ${i + 1} came back empty`);
  }
  log.warn(`reddit: could not fetch ${label} after ${waits.length} attempts`);
  return null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&nbsp;|&#32;/gi, ' ')
    .replace(/&amp;/g, '&');
}

/** Entities are decoded last, so a literal "&lt;" in someone's comment can't become a tag. */
function stripHtml(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<\/(p|div|br|li)>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(entry, name) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(entry);
  return m ? decodeEntities(m[1].trim()) : null;
}

function parseEntries(xml) {
  return [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
}

function commonFields(entry) {
  const author = (tag(entry, 'name') || '').trim();
  const link = (/<link[^>]*href="([^"]+)"/.exec(entry) || [])[1] || null;
  return {
    id: tag(entry, 'id'),
    author,
    link,
    at: tag(entry, 'published') || tag(entry, 'updated') || null,
  };
}

function skip(author, title) {
  if (SKIP_AUTHORS.has(String(author || '').toLowerCase())) return true;
  return SKIP_TITLE_PATTERNS.some((re) => re.test(title || ''));
}

function parsePosts(xml) {
  const out = [];
  for (const entry of parseEntries(xml)) {
    const base = commonFields(entry);
    const title = tag(entry, 'title');
    if (!base.id || !title || skip(base.author, title)) continue;
    out.push({ ...base, title, body: stripHtml(tag(entry, 'content')).slice(0, MAX_COMMENT_CHARS) });
  }
  return out;
}

function parseComments(xml) {
  const out = [];
  for (const entry of parseEntries(xml)) {
    const base = commonFields(entry);
    const rawTitle = tag(entry, 'title') || '';
    // Reddit titles a comment "/u/someone on <the post they replied to>", so
    // the thread it belongs to only exists as part of that string.
    const onPost = rawTitle.startsWith(`${base.author} on `)
      ? rawTitle.slice(`${base.author} on `.length)
      : rawTitle;
    const body = stripHtml(tag(entry, 'content'));
    if (!base.id || !body || skip(base.author, onPost)) continue;
    out.push({ ...base, onPost, body: body.slice(0, MAX_COMMENT_CHARS) });
  }
  return out;
}

/**
 * Newest-first union of what's cached and what just arrived, deduped on
 * Reddit's own entry id, with anything past the window dropped. Each feed only
 * returns 25 items, so without this the Monday post would only ever see
 * whatever happened to be on the sub's front page that morning.
 */
function mergeEntries(existing, incoming, cap, now) {
  const cutoff = now - KEEP_DAYS * 86400000;
  const byId = new Map();
  for (const item of [...(existing || []), ...incoming]) {
    if (!item?.id) continue;
    const when = Date.parse(item.at || '');
    if (Number.isFinite(when) && when < cutoff) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, cap);
}

/**
 * Returns null on a total failure so the caller can leave the existing cache
 * alone, matching every other collector here. A partial failure (one of the
 * two feeds) still returns, because half the sub is better than none of it.
 */
export async function fetchReddit({ now = Date.now() } = {}) {
  const previous = await loadRedditCache();

  const postsXml = await fetchFeed(POSTS_URL, 'posts feed');
  const commentsXml = await fetchFeed(COMMENTS_URL, 'comments feed');
  if (!postsXml && !commentsXml) return null;

  const posts = mergeEntries(previous?.posts, postsXml ? parsePosts(postsXml) : [], MAX_POSTS, now);
  const comments = mergeEntries(
    previous?.comments,
    commentsXml ? parseComments(commentsXml) : [],
    MAX_COMMENTS,
    now,
  );

  return { subreddit: SUBREDDIT, fetchedAt: new Date(now).toISOString(), posts, comments };
}

export async function saveRedditCache(data) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadRedditCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`reddit: could not read cache: ${err.message}`);
    return null;
  }
}
