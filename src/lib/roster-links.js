import { escapeHtml } from './text.js';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the name → profile-link lookup once per build, from whatever the
 * roster fetch found plus config/roster-aliases.js. Matching is always on a
 * FULL name (first + last) — never a bare surname — specifically because
 * Trevon Diggs (Seahawks) and Stefon Diggs (Commanders) are brothers who
 * turned up in the same sentence the week this shipped. Longest names sort
 * first in the alternation so a full name always wins over any shorter
 * alias that happens to be its prefix.
 *
 * An alias pointing at a slug that isn't in the current roster fetch is
 * skipped quietly rather than treated as an error — the roster and this
 * site's own aggregated content come from different sources and can be out
 * of sync in either direction (a very recent signing may not appear here
 * yet either).
 */
export function buildRosterIndex(players, aliases = {}) {
  const map = new Map();
  for (const p of players) map.set(p.name.trim(), { slug: p.slug, position: p.position });

  for (const [slug, names] of Object.entries(aliases)) {
    const player = players.find((p) => p.slug === slug);
    if (!player) continue;
    for (const alias of names) map.set(alias, { slug: player.slug, position: player.position });
  }

  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  return { map, pattern: new RegExp(`\\b(${names.map(escapeRegExp).join('|')})\\b`, 'g') };
}

/**
 * Wraps every roster-matched full name in a link to that player's
 * commanders.com profile. Everything else in the text is HTML-escaped
 * normally — this is the only place a caller needs, no separate
 * escapeHtml() call before or after.
 */
export function linkPlayers(text, index) {
  const raw = String(text || '');
  if (!index) return escapeHtml(raw);

  let out = '';
  let last = 0;
  for (const m of raw.matchAll(index.pattern)) {
    out += escapeHtml(raw.slice(last, m.index));
    const info = index.map.get(m[0]);
    out += `<a href="https://www.commanders.com/team/players-roster/${info.slug}/" target="_blank" rel="noopener noreferrer">${escapeHtml(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}
