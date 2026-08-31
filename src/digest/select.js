import { loadItems, loadSocial, sortedItems, sortedSocial } from '../lib/store.js';
import { SOURCES } from '../../config/sources.js';
import { SOCIAL_ACCOUNTS } from '../../config/social.js';

/**
 * Builds the numbered corpus a model is shown when writing the weekly digest.
 *
 * The index assigned here (`n`) is the citation key for the rest of the
 * pipeline — validate.js resolves every "[3, 11]" the model writes back through
 * it, and the review screen resolves it back to a real source. It only needs to
 * be stable within one generation run, so it's assigned fresh each time rather
 * than stored.
 */

const WINDOW_DAYS = Number(process.env.DIGEST_WINDOW_DAYS || 7);

// Hard cap on corpus size. A 450-entry corpus (~16k tokens) causes Bedrock
// Sonnet to lose track of the JSON schema for the threads array. Capping at
// 60 articles and 80 social posts keeps the prompt well under 8k tokens,
// which is reliable with tool_use structured output.
const MAX_CORPUS_ARTICLES = Number(process.env.DIGEST_MAX_ARTICLES || 40);
const MAX_CORPUS_POSTS = Number(process.env.DIGEST_MAX_POSTS || 50);

// A post with fewer real words than this is a graphic or a sponsor tag, not
// information — "🔥🔥🔥 @SeatGeek | #RaiseHail" has zero of substance to write
// about it.
const MIN_POST_WORDS = Number(process.env.DIGEST_MIN_POST_WORDS || 6);

// Wire-service photo captions leak into RSS excerpts and read like reporting
// without being it: "LANDOVER, MD - AUGUST 14: Jer'zhan Newton #95 ... looks on".
// A model handed one will build a sentence out of a photographer's slug. The
// state is sometimes abbreviated, sometimes spelled out; the colon after the day
// is the load-bearing part of the pattern — it's what separates a caption slug
// from a sentence that merely opens with a place name.
const CAPTION = /^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z.]+\s*[-–—]\s*[A-Z]+\s+\d+\s*:/;

/** Other NFL clubs, for judging whether a national insider's post is actually about Washington. */
const OTHER_TEAMS =
  /\b(cowboys|eagles|giants|bears|packers|vikings|lions|49ers|seahawks|rams|cardinals|saints|falcons|panthers|buccaneers|bucs|chiefs|raiders|chargers|broncos|texans|colts|jaguars|titans|bengals|browns|steelers|ravens|bills|patriots|jets|dolphins)\b/gi;
const WASHINGTON = /\b(commanders|washington)\b/gi;

const VIDEO_SOURCE_IDS = new Set(SOURCES.filter((s) => s.media === 'video').map((s) => s.id));

/**
 * Authors we're willing to quote, keyed by handle — NOT by which timeline a
 * post arrived on. A boosted post keeps the booster's config, not the
 * original author's, so a Tashan Reed post found via #Commanders is still
 * Tashan Reed, and a stranger's post boosted by a roster account is still a
 * stranger. `alwaysRelevant` marks the beat, where every post is on topic.
 */
const AUTHORS = new Map(SOCIAL_ACCOUNTS.map((a) => [a.handle.toLowerCase(), a]));

const tidy = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const count = (text, re) => (String(text).match(re) || []).length;

/** Words left once handles, hashtags, links and emoji are stripped out. */
function substanceWords(text) {
  return String(text)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\S+/g, ' ')
    .replace(/[^\p{L}\p{N}'\- ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Everything published about the team in the last `DIGEST_WINDOW_DAYS`, minus
 * the junk a model would either ignore or mangle. `now` is a parameter (rather
 * than read inside) so a run can be reproduced exactly.
 *
 * `excludeSourceIds` exists for exactly one reason: a cloud-model caller (see
 * preview-generate.js) must never forward Hogs Haven's or ClutchPoints'
 * article text to a third party — both disallow AI crawlers by name in
 * robots.txt (see README, "Why local only"). The local-only weekly digest
 * passes nothing here and reads every source, same as always.
 *
 * `windowDays` exists for the Monday recap (see monday-generate.js), which
 * wants "the weekend that just happened," not the digest's default rolling
 * week — the same call reused with a tighter window rather than a parallel
 * implementation.
 */
export async function buildCorpus(now = Date.now(), { excludeSourceIds = [], windowDays = WINDOW_DAYS } = {}) {
  const cutoff = now - windowDays * 86400000;
  const excluded = new Set(excludeSourceIds);
  const dropped = [];

  const inWindow = sortedItems(await loadItems()).filter(
    (i) => !excluded.has(i.sourceId),
  ).filter(
    (i) => new Date(i.publishedAt || i.collectedAt).getTime() >= cutoff,
  );

  const articles = [];
  const videos = [];
  for (const item of inWindow) {
    const excerpt = tidy(item.excerpt);
    if (VIDEO_SOURCE_IDS.has(item.sourceId)) {
      videos.push({ kind: 'video', ...item, excerpt: '' });
    } else if (CAPTION.test(excerpt)) {
      // Keep the headline — that's the outlet's own statement of the story.
      // Lose the caption, a photographer's slug wearing a paragraph's clothes.
      dropped.push({ reason: 'photo caption excerpt', what: item.title });
      articles.push({ kind: 'article', ...item, excerpt: '' });
    } else {
      articles.push({ kind: 'article', ...item, excerpt });
    }
  }

  const posts = [];
  for (const post of sortedSocial(await loadSocial())) {
    if (new Date(post.publishedAt || post.collectedAt).getTime() < cutoff) continue;
    const text = tidy(post.text);

    // Named, accountable authors only. A ticker can carry a stranger — the post
    // is visibly a stranger on the internet there. Prose written in the site's
    // own voice cannot: the #Commanders hashtag timeline has carried unverified
    // personal allegations about a player, and nothing should be able to
    // launder that into a recap by riding in on a tag.
    const author = AUTHORS.get(String(post.handle).toLowerCase());
    if (!author) {
      dropped.push({ reason: `author not on roster (@${post.handle})`, what: text.slice(0, 80) });
      continue;
    }
    if (substanceWords(text) < MIN_POST_WORDS) {
      dropped.push({ reason: 'no substance (graphic/sponsor tag)', what: text.slice(0, 80) });
      continue;
    }
    // National insiders cover 32 teams, so one #Commanders tag inside a long
    // interview about another team isn't Commanders news. This cannot apply to
    // the beat: their whole timeline is Washington, so they typically name only
    // the opponent — "White won't play against the Lions" scores 1-0 for
    // Detroit and is exactly the content this exists to keep.
    if (!author.alwaysRelevant && count(text, OTHER_TEAMS) > count(text, WASHINGTON)) {
      dropped.push({ reason: 'national post, predominantly another team', what: text.slice(0, 80) });
      continue;
    }
    posts.push({ kind: 'post', ...post, label: author.label, text });
  }

  // One sequence across all three kinds — a citation is always just an
  // integer, so validation and rendering don't need to know what it points to
  // until they look it up. Cap articles and posts to the most recent N so
  // the corpus stays manageable for structured output (sortedItems already
  // puts newest first, so slicing keeps the most relevant material).
  const cappedArticles = articles.slice(0, MAX_CORPUS_ARTICLES);
  const cappedPosts = posts.slice(0, MAX_CORPUS_POSTS);
  const entries = [...cappedArticles, ...videos, ...cappedPosts].map((e, i) => ({ n: i + 1, ...e }));
  const byIndex = new Map(entries.map((e) => [e.n, e]));

  return {
    entries,
    byIndex,
    dropped,
    counts: { articles: articles.length, videos: videos.length, posts: posts.length },
    cutoff,
    now,
  };
}

/** Render the corpus as the plain-text block the model actually reads. */
export function renderCorpus({ entries }) {
  const lines = [];
  const of = (kind) => entries.filter((e) => e.kind === kind);

  lines.push('## PUBLISHED ARTICLES (headline, and where available a truncated opening excerpt)');
  for (const e of of('article')) {
    lines.push(`[${e.n}] ${e.sourceName}, ${e.publishedAt.slice(0, 10)} — ${e.title}`);
    if (e.excerpt) lines.push(`      ${e.excerpt}`);
  }

  const videos = of('video');
  if (videos.length) {
    lines.push('');
    lines.push('## TEAM VIDEO UPLOADS (title only — no transcript is available to you)');
    for (const e of videos) lines.push(`[${e.n}] ${e.title}`);
  }

  const posts = of('post');
  if (posts.length) {
    lines.push('');
    lines.push('## BEAT REPORTER POSTS (full text)');
    for (const e of posts) lines.push(`[${e.n}] @${e.handle}${e.label ? ` (${e.label})` : ''} — ${e.text}`);
  }
  return lines.join('\n');
}
