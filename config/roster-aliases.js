/**
 * Names that don't match what commanders.com's own roster page displays.
 * Beat reporters and outlets routinely use a nickname or common name that
 * differs from the official one — DT Jer'Zhan Newton is "Johnny Newton" in
 * every piece of coverage that mentions him, and the roster page has no way
 * to know that.
 *
 * Add an entry the moment a real mismatch turns up; this list only grows
 * when something actually breaks; it isn't meant to anticipate every
 * possible nickname in advance.
 *
 * Each value must be a FULL name (first + last), never a bare surname alone
 * — matching drops to last-name-only and Trevon Diggs (Seahawks) would link
 * to Stefon Diggs's Commanders profile the moment they're mentioned in the
 * same sentence, which they were, in the very first week this shipped.
 */
export const ROSTER_ALIASES = {
  'jer-zhan-newton': ['Johnny Newton'],
};
