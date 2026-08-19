/**
 * Source registry.
 *
 * Every entry is a working RSS/Atom feed, verified by hand (2026-08-19) with
 * a direct curl before being added here — several plausible-looking
 * candidates (Commanders Wire, Reddit r/Commanders, SI/Riggo's Rag, The
 * Athletic, Washington Post) either serve no public feed or block bot
 * fetches outright, and are left out rather than scraped around.
 *
 * Fields:
 *   id             stable slug, used in stored item IDs — do not rename casually
 *   name           display name, shown as attribution
 *   homepage       human-facing landing page for the source
 *   category       'team' | 'league' — drives the badge shown on each item
 *   collector      which collector module handles it (only 'rss' for now)
 *   alwaysRelevant true when everything the source publishes is about the
 *                  Commanders already, so the keyword filter in
 *                  src/lib/relevance.js is skipped
 *   enabled        set false to park a source without deleting its config
 */

export const SOURCES = [
  // --------------------------------------------------------------- team
  {
    id: 'commanders-official',
    name: 'Commanders.com',
    homepage: 'https://www.commanders.com/news/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    enabled: true,
    url: 'https://www.commanders.com/rss/news',
  },
  {
    id: 'hogs-haven',
    name: 'Hogs Haven',
    homepage: 'https://www.hogshaven.com/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    enabled: true,
    url: 'https://www.hogshaven.com/rss/index.xml',
  },

  // ------------------------------------------------------------- league
  // NFL-wide feeds. Most items are about other teams, so these go through
  // the keyword filter in src/lib/relevance.js and only Commanders-tagged
  // items survive.
  {
    // PARKED. espn.com serves its RSS behind an AWS WAF JavaScript challenge
    // to automated clients (confirmed 2026-08-19) — an explicit request not
    // to be read by a script. Defeating it is out of scope; if ESPN ever
    // opens the feed back up, flip enabled back to true.
    id: 'espn-nfl',
    name: 'ESPN',
    homepage: 'https://www.espn.com/nfl/team/_/name/wsh/washington-commanders',
    category: 'league',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: false,
    url: 'https://www.espn.com/espn/rss/nfl/news',
  },
  {
    id: 'pft',
    name: 'Pro Football Talk',
    homepage: 'https://www.nbcsports.com/profootballtalk',
    category: 'league',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: true,
    url: 'https://www.nbcsports.com/profootballtalk.rss',
  },
  {
    id: 'cbs-nfl',
    name: 'CBS Sports',
    homepage: 'https://www.cbssports.com/nfl/teams/WAS/washington-commanders/',
    category: 'league',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: true,
    url: 'https://www.cbssports.com/rss/headlines/nfl/',
  },
  {
    id: 'yahoo-nfl',
    name: 'Yahoo Sports',
    homepage: 'https://sports.yahoo.com/nfl/teams/washington/',
    category: 'league',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: true,
    url: 'https://sports.yahoo.com/nfl/rss/',
  },
];

export function enabledSources() {
  return SOURCES.filter((s) => s.enabled !== false);
}

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id);
}
