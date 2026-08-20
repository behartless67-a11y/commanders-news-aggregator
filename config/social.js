/**
 * Social accounts for the bottom ticker.
 *
 * WHY THIS GOES THROUGH MASTODON
 * ------------------------------
 * Everyone here posts on X, and X has no usable free read API — search is
 * paywalled and the undocumented syndication endpoint rate-limits immediately.
 * What does work: sportsbots.xyz runs a public ActivityPub bridge that mirrors
 * these reporters' tweets, and mastodon.social federates a copy. We read
 * mastodon.social's public API (no auth, no key, no bot wall) and every post
 * links straight back to the original tweet on x.com.
 *
 * Two consequences worth knowing:
 *   - The roster is limited to accounts the bridge actually mirrors. Some
 *     reporters aren't on it at all (Nicki Jhabvala, for one — only a
 *     single-tweet stub exists, not a real mirror). Adding a handle here that
 *     the bridge doesn't carry logs a warning and is skipped, not fatal.
 *   - This is a third-party mirror, so it can lag or go away. Everything
 *     downstream degrades to "no ticker" rather than breaking the build.
 *
 * `alwaysRelevant` marks Commanders beat accounts, where every post is on
 * topic. National insiders cover all 32 teams, so their posts run through the
 * same keyword filter the league-wide news feeds use.
 */

export const SOCIAL_ACCOUNTS = [
  // --- Commanders beat: everything they post is about this team ---
  {
    handle: 'Commanders',
    name: 'Washington Commanders',
    label: 'Official',
    alwaysRelevant: true,
  },
  {
    handle: 'JPFinlayNBCS',
    name: 'JP Finlay',
    label: 'NBC Sports Washington',
    alwaysRelevant: true,
  },
  {
    handle: 'john_keim',
    name: 'John Keim',
    label: 'ESPN',
    alwaysRelevant: true,
  },
  {
    handle: 'BenStandig',
    name: 'Ben Standig',
    label: 'The Athletic',
    alwaysRelevant: true,
  },
  {
    handle: 'tashanreed',
    name: 'Tashan Reed',
    label: 'The Athletic',
    alwaysRelevant: true,
  },

  // --- National insiders: filtered for a Commanders signal ---
  {
    handle: 'AdamSchefter',
    name: 'Adam Schefter',
    label: 'ESPN',
    alwaysRelevant: false,
  },
  {
    handle: 'RapSheet',
    name: 'Ian Rapoport',
    label: 'NFL Network',
    alwaysRelevant: false,
  },
  {
    handle: 'MikeGarafolo',
    name: 'Mike Garafolo',
    label: 'NFL Network',
    alwaysRelevant: false,
  },
  {
    handle: 'JosinaAnderson',
    name: 'Josina Anderson',
    label: 'Insider',
    alwaysRelevant: false,
  },
  {
    handle: 'pfrumors',
    name: 'Pro Football Rumors',
    label: 'PFR',
    alwaysRelevant: false,
  },
];

/**
 * Hashtag timelines. These catch on-topic posts from people who aren't on the
 * roster above, which is the whole point of watching a tag rather than a fixed
 * follow list. Always keyword-filtered: a tag is a weaker signal than a beat
 * reporter's account, and "#commanders" collides with the Magic: the Gathering
 * format on the wider fediverse.
 */
export const SOCIAL_TAGS = [
  { tag: 'Commanders', name: '#Commanders' },
  { tag: 'RaiseHail', name: '#RaiseHail' },
  { tag: 'HTTC', name: '#HTTC' },
];

export const SOCIAL_ENABLED = process.env.SOCIAL_ENABLED !== 'false';
