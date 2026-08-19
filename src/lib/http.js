import { log } from './log.js';

/**
 * Polite HTTP client for public feeds.
 *
 * Several outlets sit behind bot protection that rejects the default Node
 * user agent, so we send a full browser header set. We also rate-limit
 * ourselves per host and cache responses on disk for the life of a run,
 * because hammering someone's feed to build a headline river would be rude
 * and would get us blocked.
 */

const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="121", "Not A(Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const PER_HOST_DELAY_MS = Number(process.env.FETCH_DELAY_MS || 700);
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30000);
const MAX_ATTEMPTS = 3;

const lastHit = new Map();
const memo = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Recognize an interstitial anti-bot page. These come back with HTTP 200 and
 * a body that looks like a normal document, so without this check a
 * challenged source looks like a source whose feed URL changed.
 */
function isBotChallenge(text) {
  if (!text || text.length > 20000) return false;
  if (/<title>\s*(Client Challenge|Just a moment|Attention Required|Access denied)/i.test(text)) return true;
  // AWS WAF's JS challenge page serves an empty <title> and HTTP 200, so the
  // title check alone misses it — this is the one other reliable marker.
  return /awsWafCookieDomainList|challenge-container/i.test(text);
}

async function throttle(host) {
  const previous = lastHit.get(host) || 0;
  const wait = previous + PER_HOST_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/**
 * Fetch a URL as text. Returns null rather than throwing, because one dead
 * feed should never abort a whole collection run.
 */
export async function fetchText(url, { cache = true } = {}) {
  if (cache && memo.has(url)) return memo.get(url);

  let host;
  try {
    host = new URL(url).host;
  } catch {
    log.warn(`malformed url skipped: ${url}`);
    return null;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`http ${res.status}`);
      }
      if (!res.ok) {
        log.debug(`http ${res.status} ${url}`);
        if (cache) memo.set(url, null);
        return null;
      }

      const text = await res.text();

      if (isBotChallenge(text)) {
        log.warn(`bot challenge served by ${host} — source needs an official feed or permission`);
        if (cache) memo.set(url, null);
        return null;
      }

      if (cache) memo.set(url, text);
      return text;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === MAX_ATTEMPTS) {
        log.warn(`fetch failed after ${attempt} attempts: ${url} (${err.message})`);
        if (cache) memo.set(url, null);
        return null;
      }
      await sleep(attempt * 1200);
    }
  }
  return null;
}
