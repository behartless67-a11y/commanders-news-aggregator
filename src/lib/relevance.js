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

/**
 * Fantasy-specific fallback for skill players whose surname is genuinely
 * unambiguous league-wide — checked only after both `relevanceSignal` and
 * the full-roster full-name match (see `isRelevant`) have already missed,
 * since fantasy headlines skip the team name AND often skip the first name
 * ("McLaurin: Full practice participant"). Deliberately hand-picked, not
 * generated from the roster: most skill-position surnames are too common to
 * risk it (Jones, Williams, Brown, White, Allen, Ford, Bates — every one of
 * those collides with an actual fantasy-relevant player on a different
 * team), and even a distinctive-looking one needs a real check before
 * joining this list, not just "no other Commander has it." Add an entry
 * only after confirming no other current skill player league-wide shares
 * the surname; this list grows the same way ROSTER_ALIASES does, one
 * verified addition at a time, not swept in wholesale.
 */
const FANTASY_SURNAMES = [
  'mclaurin',
  'croskey-merritt',
  'kaliakmanis',
  'okonkwo',
  'sinnott',
  'yankoff',
  'mariota',
  'hartman',
  'mcnichols',
  'burks',
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
/**
 * `rosterIndex` (from `buildRosterIndex` in roster-links.js — the same index
 * that powers player-name linking in the digest) is only consulted for
 * `category: 'fantasy'` sources. Fantasy headlines are exactly the case the
 * short TERMS list above can't handle: "Start or sit: McLaurin in Week 3"
 * never says "Commanders", and TERMS is deliberately kept to a handful of
 * marquee names (coach/QB/GM) rather than grown to cover every skill
 * position, since it would go stale every roster cycle. The full roster is
 * already fetched and cached for player-name linking, so reusing it here
 * costs nothing extra and stays current the same way.
 *
 * `rosterIndex.pattern` carries the `g` flag (shared with `linkPlayers`,
 * which needs it for `matchAll`) — `.test()` on a global regex is stateful,
 * so `lastIndex` is reset before every call rather than trusting a fresh
 * regex per source.
 */
export function isRelevant(source, item, rosterIndex = null) {
  if (source.alwaysRelevant) return true;
  const haystack = [item.title, item.url].filter(Boolean).join(' \n ');
  if (relevanceSignal(haystack) !== null) return true;
  if (source.category !== 'fantasy') return false;
  if (rosterIndex) {
    rosterIndex.pattern.lastIndex = 0;
    if (rosterIndex.pattern.test(haystack)) return true;
  }
  const lower = haystack.toLowerCase();
  return FANTASY_SURNAMES.some((surname) => lower.includes(surname));
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
