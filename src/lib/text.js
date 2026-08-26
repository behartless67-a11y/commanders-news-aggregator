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
