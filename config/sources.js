/**
 * Source registry.
 *
 * Every entry is a working RSS/Atom feed, verified by hand with a direct curl
 * before being added here — many plausible-looking candidates either serve no
 * public feed or block bot fetches outright, and are left out rather than
 * scraped around. Confirmed dead or blocked as of 2026-08-20: Commanders Wire
 * (USA Today), SI/FanNation, Yardbarker, Yahoo's team feed, WTOP, Athlon,
 * Bleacher Report, CBS's team feed, SB Nation's league feed, 247Sports,
 * FanSided's network feed, Reddit r/Commanders, The Athletic, Washington Post.
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
 *   media          optional; 'video' marks a feed whose links are YouTube watch
 *                  URLs, which the build also renders as the video shelf
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
  {
    // Commanders-only FanSided blog. High volume (90 items) and same-day fresh.
    id: 'riggos-rag',
    name: "Riggo's Rag",
    homepage: 'https://riggosrag.com/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    enabled: true,
    url: 'https://riggosrag.com/feed/',
  },
  {
    // ClutchPoints' team-tagged feed. Filtered rather than trusted whole: the
    // team feed carries the occasional site-wide piece ("Top 5 Fantasy Football
    // Sleepers At Tight End"). Its real Commanders items all name the team in
    // the headline or the slug, so the keyword filter keeps them — including
    // ones filed under another team ("Seahawks' Diggs signing creates
    // full-circle moment with Commanders").
    id: 'clutchpoints',
    name: 'ClutchPoints',
    homepage: 'https://clutchpoints.com/nfl/washington-commanders',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: true,
    url: 'https://clutchpoints.com/nfl/washington-commanders/feed',
  },
  {
    // The team's own YouTube uploads — press conferences, camp clips. Worth
    // having because commanders.com's text feed has gone stale upstream, so
    // this is currently the only first-party source still publishing.
    id: 'commanders-youtube',
    name: 'Commanders (YouTube)',
    homepage: 'https://www.youtube.com/@Commanders',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    media: 'video',
    enabled: true,
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2a0ENbCZqIO5C1fWXGXZXA',
  },
  {
    // Local DC outlet covering every team in the city (Wizards, Nationals, and
    // the odd WWE history piece), so it is filtered rather than trusted whole.
    id: 'dc-sports-king',
    name: 'DC Sports King',
    homepage: 'https://dcsportsking.com/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: true,
    url: 'https://www.dcsportsking.com/feed/',
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
