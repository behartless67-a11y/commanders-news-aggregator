/**
 * Relevance filter for league-wide feeds.
 *
 * ESPN, PFT, CBS, and Yahoo publish NFL-wide feeds — most items are about other
 * teams. Rather than publish those, we require a Commanders signal. Sources
 * flagged alwaysRelevant in config/sources.js (the team's own site, Hogs
 * Haven) skip this check entirely, since everything they publish is already
 * about this team.
 *
 * The anchor term is just "commanders" — inside an NFL-only feed that is
 * effectively unambiguous, no other prominent NFL-context entity shares the
 * name. The extra proper nouns below exist only to catch the occasional
 * headline that names a player/coach without naming the team ("Daniels
 * shines again"); they will drift out of date as the roster turns over, and
 * that's fine — they're a bonus, not the primary signal.
 */

const TERMS = [
  'commanders',
  'jayden daniels',
  'dan quinn',
  'terry mclaurin',
  'adam peters',
];

export function relevanceSignal(text) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return null;
  for (const term of TERMS) {
    if (haystack.includes(term)) return term;
  }
  return null;
}

export function isRelevant(source, item) {
  if (source.alwaysRelevant) return true;
  const haystack = [item.title, item.excerpt, item.url].filter(Boolean).join(' \n ');
  return relevanceSignal(haystack) !== null;
}

export const RELEVANCE_TERMS = TERMS;
