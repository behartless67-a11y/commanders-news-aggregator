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

/**
 * Deliberately reads the headline and the URL slug only — never the body.
 *
 * The excerpt used to count, and it let through articles that are plainly about
 * another team but happen to name this one in passing: a Miami blog's mailbag
 * ("The Phinsider Mailbag: Willie Gay roster status") reached the top of the
 * river on an incidental mention alone. Joint-practice notes, photo captions,
 * and "related reading" tails all produce that false positive.
 *
 * A headline (or the slug an editor derived from it) is what an outlet says the
 * article is *about*, which is the question we actually care about. The cost is
 * dropping the occasional on-topic piece behind a coy headline; for a link
 * river, precision beats recall — a wrong item is visible and annoying, a
 * missing one usually arrives via another source.
 */
export function isRelevant(source, item) {
  if (source.alwaysRelevant) return true;
  const haystack = [item.title, item.url].filter(Boolean).join(' \n ');
  return relevanceSignal(haystack) !== null;
}

/**
 * Reject titles that are hashtag strings rather than headlines — the shape of a
 * social clip, not an article. The team's YouTube feed mixes press conferences
 * ("HC Dan Quinn Speaks To The Media Before Practice") with Shorts whose entire
 * title is "🔥🔥🔥 #nfl #commanders #football #shorts #raisehail", and the latter
 * tells a reader nothing in a headline river.
 *
 * Three hashtags is the threshold: real headlines essentially never carry that
 * many, and every Short observed carries at least three.
 */
export function isSocialFiller(title) {
  return (String(title || '').match(/#\w+/g) || []).length >= 3;
}

export const RELEVANCE_TERMS = TERMS;
