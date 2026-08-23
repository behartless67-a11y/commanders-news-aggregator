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
    avatar: 'https://files.mastodon.social/cache/accounts/avatars/109/592/331/798/763/619/original/a3701f8e35f78563.jpg',
    bio: 'Covers the Commanders for NBC Sports Washington and hosts the All Ears podcast. Also holds a weekday radio slot on 106.7 The Fan.',
  },
  {
    handle: 'john_keim',
    name: 'John Keim',
    label: 'ESPN',
    alwaysRelevant: true,
    avatar: 'https://files.mastodon.social/cache/accounts/avatars/109/588/365/336/241/532/original/48c6d5c30b2714fc.jpg',
    bio: "ESPN's Commanders beat reporter, covering the team full-time. Also hosts The John Keim Report podcast.",
  },
  {
    // Bio confirms this, 2026-08-23: he's since left The Athletic for his
    // own independent newsletter/podcast — this label feeds the digest's
    // own citations too (see select.js's AUTHORS map), so it needs to stay
    // accurate, not just cosmetic.
    handle: 'BenStandig',
    name: 'Ben Standig',
    label: 'Last Man Standig',
    alwaysRelevant: true,
    avatar: 'https://files.mastodon.social/cache/accounts/avatars/109/589/048/520/308/375/original/0fcf61c6e3514d05.jpg',
    bio: 'Independent Commanders and NFL reporter behind the Last Man Standig newsletter and podcast, previously of The Athletic. A three-time NFL mock draft contest winner.',
  },
  {
    // Same as Ben Standig above — bio confirms The Washington Post, not
    // The Athletic.
    handle: 'tashanreed',
    name: 'Tashan Reed',
    label: 'The Washington Post',
    alwaysRelevant: true,
    avatar: 'https://files.mastodon.social/cache/accounts/avatars/109/787/869/365/684/987/original/605b3c25d3ba43d3.jpg',
    bio: 'Commanders beat reporter for The Washington Post. Hosts the Between the Lines podcast and is a Mizzou journalism alum.',
  },
  {
    // Practice-day video/photo threads, added 2026-08-20 — flag for review if
    // he turns out to also cover other DC teams; treated as beat for now.
    handle: 'Scott7news',
    name: 'Scott Abraham',
    label: 'Local TV',
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
  {
    // Covers NFL *and* NHL for NBC Sports Washington, not Commanders-only —
    // unlike JPFinlayNBCS, whose beat assignment there is specifically the
    // Commanders.
    handle: 'granthpaulsen',
    name: 'Grant Paulsen',
    label: '106.7 The Fan',
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
