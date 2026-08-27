import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '../lib/log.js';
import { sha1, canonicalizeUrl } from '../lib/text.js';
import { toIso } from '../lib/dates.js';

const run = promisify(execFile);

/**
 * Reads an X profile through a real, logged-in Chrome — not an API. X has no
 * usable free read API (see config/social.js), and an unauthenticated request
 * gets a flat 403, so every other source in this project goes through the
 * sportsbots.xyz Mastodon bridge instead. Some reporters (Nicki Jhabvala,
 * among others) aren't mirrored there at all. This is the fallback for those:
 * a dedicated throwaway account, in its own Chrome profile, never the site
 * owner's real one.
 *
 * Deliberately NOT wired into collectSocialAll()/the nightly/social GitHub
 * Actions workflows. Those run on a CI runner with no logged-in browser —
 * this only works where CHROME_X_PROFILE's session actually lives, i.e. the
 * machine that logged in. Run by hand via `npm run x-scrape`, and it merges
 * into the same data/social.json every other social source writes to, so
 * once collected these posts are indistinguishable from a Mastodon-bridged
 * one everywhere downstream (ticker, relevance filter, digest citations).
 */

const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE_DIR = process.env.CHROME_X_PROFILE || 'C:/tmp/chrome-x-scraper';
const PER_ACCOUNT = Number(process.env.X_BROWSER_PER_ACCOUNT || 15);

async function dumpProfileDom(handle) {
  const url = `https://x.com/${encodeURIComponent(handle)}`;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${PROFILE_DIR}`,
    '--window-size=1280,2400',
    '--virtual-time-budget=15000',
    '--dump-dom',
    url,
  ];
  const { stdout } = await run(CHROME_PATH, args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/**
 * data-testid="tweetText" holds only inline nodes (spans/links/emoji images),
 * never a nested <div>, so the first </div> after the opening tag always
 * closes it — verified by hand against a real dump before relying on it.
 */
function extractText(articleHtml) {
  const m = articleHtml.match(/data-testid="tweetText"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return '';
  return m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArticles(dom, handle) {
  const articles = dom.match(/<article[\s\S]*?<\/article>/g) || [];
  const statusRe = new RegExp(`href="(/${handle}/status/(\\d+))"`, 'i');

  return articles
    .map((html) => {
      // "Pinned"/"Reposted" render as a socialContext line before the tweet
      // body proper — skip both: a pinned post is often stale by the time it
      // would resurface here, and a repost's real author isn't this handle.
      if (/data-testid="socialContext"[^<]*<[^>]*>\s*(Pinned|[^<]*Reposted)/i.test(html)) return null;

      const statusMatch = html.match(statusRe);
      const time = html.match(/datetime="([^"]*)"/);
      const text = extractText(html);
      if (!statusMatch || !time || !text) return null;

      return {
        statusId: statusMatch[2],
        url: `https://x.com/${handle}/status/${statusMatch[2]}`,
        text,
        publishedAt: toIso(time[1]),
      };
    })
    .filter(Boolean);
}

/**
 * Same shape as mastodon.js's normalize() output, so a browser-sourced post
 * merges into data/social.json and behaves identically to a bridge-sourced
 * one everywhere downstream — ticker, relevance filter, digest citations.
 */
function normalize(post, account) {
  const url = canonicalizeUrl(post.url);
  if (!url) return null;
  return {
    id: `social-${sha1(url).slice(0, 12)}`,
    url,
    text: post.text,
    handle: account.handle,
    author: account.name,
    label: account.label || '',
    sourceKey: `@${account.handle}`,
    images: [],
    publishedAt: post.publishedAt,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Returns { posts, sessionExpired }. A Chrome launch failure or an empty
 * dump is a transient hiccup — logged, posts: [], sessionExpired: false —
 * indistinguishable from "she just didn't post," which is correct: it'll
 * clear up on its own next cycle. A detected logged-out page is different:
 * it won't clear up on its own, so it's flagged separately rather than
 * folded into the same silent-empty-result bucket. The caller (see
 * collectSocialBrowser in collectors/index.js) turns that flag into a
 * failed exit code, so a scheduled task's own run history — not a bespoke
 * notification system — is the failsafe.
 */
export async function collectXProfile(account) {
  let dom;
  try {
    dom = await dumpProfileDom(account.handle);
  } catch (err) {
    log.error(`x-browser @${account.handle}: ${err.message}`);
    return { posts: [], sessionExpired: false };
  }

  if (/Sign in to X|Log in|Access to x\.com was denied/i.test(dom) && !/data-testid="tweetText"/.test(dom)) {
    log.warn(`x-browser @${account.handle}: looks logged out — session may have expired, log in again in the scraper profile`);
    return { posts: [], sessionExpired: true };
  }

  const posts = extractArticles(dom, account.handle).slice(0, PER_ACCOUNT);
  return { posts: posts.map((p) => normalize(p, account)).filter(Boolean), sessionExpired: false };
}
