import { createHash } from 'node:crypto';

export function sha1(input) {
  return createHash('sha1').update(input).digest('hex');
}

/** Stable item ID, keyed on source plus canonical URL so re-running collection never duplicates anything. */
export function itemId(sourceId, url, title) {
  const base = canonicalizeUrl(url) || normalizeTitle(title);
  return `${sourceId}-${sha1(base).slice(0, 12)}`;
}

export function canonicalizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|_ga|sessionid|phpsessid|ncid|taid)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Strip tags and collapse whitespace. Source HTML is never published as-is. */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normalize a headline from a feed — feeds routinely double-encode entities. */
export function cleanTitle(value) {
  return stripHtml(value).replace(/\s+/g, ' ').trim();
}

/**
 * Photo credits and series boilerplate that some feeds put ahead of the actual
 * story. Hogs Haven's do it on about one excerpt in five: the lead photo's
 * caption ("ASHBURN, VA - AUGUST 01: ... (Photo by .../Getty Images) | Getty
 * Images", or the Imagn/USA TODAY form ending "Mandatory Credit: ..."), then
 * for its recurring posts a standing intro ("All aTwitter – 15 September 2026
 * / We follow Twitter so you don't have to", "The Daily Slop ... Editor's
 * note: Each day, Hogs Haven compiles ...").
 */
const PHOTO_CREDIT = /\(Photo by [^)]*\)|Mandatory Credit:|Getty Images|Imagn Images|via Reuters Con|USA TODAY Sports|\(AP Photo[^)]*\)/i;
// Where a credit *ends*. A caption sometimes runs straight into the story on
// the same line ("... Mandatory Credit: Junfu Han-USA TODAY Sports The Detroit
// Lions hit the midway point ..."), so the cut goes to the end of the last of
// these, not the end of the line.
const CREDIT_END = /\(Photo by [^)]*\)|\(AP Photo[^)]*\)|(?:USA TODAY Sports|IMAGN IMAGES|Imagn Images|Getty Images)(?: via Reuters Con(?:nect)?)?/gi;
const SERIES_BOILERPLATE = [
  /^All aTwitter\b/i,
  /^We follow Twitter so you don.t have to/i,
  /^The goal of All aTwitter\b/i,
  /^The Daily Slop\b/i,
  /^Editor.s note: Each day, Hogs Haven compiles\b/i,
  /^Editor.s note:\s*…?$/i, // the same intro, truncated to nothing
  /^Click here for .*Twitter Feed/i, // All aTwitter's link block
  /^Tip: If a tweet isn.t fully visible\b/i,
];

/**
 * An excerpt with leading photo-credit lines and series boilerplate removed,
 * flattened to one line. Empty when nothing but those was there, in which
 * case the card shows the headline alone rather than a photo caption posing
 * as the story. Only *leading* credit lines go: one mid-excerpt is part of
 * whatever the writer was saying.
 */
export function cleanExcerpt(text) {
  const lines = String(text || '')
    // One feed sends its whitespace as literal "\n" and "\t" text, and a few
    // send punctuation as HTML entity text that would print as "&mdash;".
    .replace(/\\[ntr]/g, '\n')
    .replace(/&(mdash|ndash|nbsp|amp|quot|rsquo|lsquo|rdquo|ldquo|hellip|#39|#8217|#8216|#8220|#8221);/g, (m, e) =>
      ({ mdash: '—', ndash: '–', nbsp: ' ', amp: '&', quot: '"', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”' })[e])
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  while (lines.length && PHOTO_CREDIT.test(lines[0])) {
    const ends = [...lines[0].matchAll(CREDIT_END)];
    const last = ends[ends.length - 1];
    const rest = last ? lines[0].slice(last.index + last[0].length).replace(/^[\s|…]+/, '') : '';
    if (rest) {
      lines[0] = rest;
      break;
    }
    lines.shift();
  }
  const out = lines
    .filter((l) => !SERIES_BOILERPLATE.some((re) => re.test(l)))
    .join(' ')
    // An embedded tweet's footer, "pic.twitter.com/abc — Washington
    // Commanders (@Commanders) October 3, 2026", and any bare t.co links.
    // Left in, its dots also fooled the two-sentence cut into showing
    // "com/g0uLb5rXxB — Washington Commanders..." as a sentence.
    .replace(/(?:https?:\/\/)?(?:pic\.twitter\.com|t\.co|x\.com|twitter\.com)\/\S+/g, ' ')
    .replace(/\s*[—–-]\s*[^()]{1,80}\(@\w+\)\s+[A-Z][a-z]+ \d{1,2}, \d{4}/g, ' ')
    // The host's legal line, appended to every Art19 podcast episode
    // (Beltway Football), on the same line as the episode's real description.
    .replace(/\s*See Privacy Policy at https:\/\/art19\.com\S*.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Nothing left but a truncation ellipsis or a stray pipe.
  return /^[\s…|.]*$/.test(out) ? '' : out;
}

/** Trim a feed's body/summary down to a short river excerpt. */
export function excerpt(text, max = 500) {
  const clean = stripHtml(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}
