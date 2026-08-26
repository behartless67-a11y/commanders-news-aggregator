/**
 * Source registry.
 *
 * Every entry is a working RSS/Atom feed, verified by hand with a direct curl
 * before being added here — many plausible-looking candidates either serve no
 * public feed or block bot fetches outright, and are left out rather than
 * scraped around. Confirmed dead or blocked as of 2026-08-20: Commanders Wire
 * (USA Today), SI/FanNation, Yardbarker, Yahoo's team feed, WTOP, Athlon,
 * Bleacher Report, CBS's team feed, SB Nation's league feed, 247Sports,
 * FanSided's network feed, Reddit r/Commanders, Washington Post,
 * WUSA9 (200 status, but every URL serves the JS homepage — no real feed),
 * FOX5 DC (no discoverable feed), Washington Times (works but low
 * Commanders density), USA Today's own NFL feed (redirects to homepage),
 * DC Black (not a sports site at all).
 *
 * Fields:
 *   id             stable slug, used in stored item IDs — do not rename casually
 *   name           display name, shown as attribution
 *   homepage       human-facing landing page for the source
 *   category       'team' | 'league' | 'fantasy' — drives the badge shown on
 *                  each item. 'fantasy' sources are matched against the full
 *                  roster (+ aliases) instead of the short marquee-name list,
 *                  since fantasy headlines name players without naming the
 *                  team — see src/lib/relevance.js.
 *   collector      which collector module handles it (only 'rss' for now)
 *   alwaysRelevant true when everything the source publishes is about the
 *                  Commanders already, so the keyword filter in
 *                  src/lib/relevance.js is skipped
 *   media          optional; 'video' marks a feed whose links are YouTube watch
 *                  URLs, which the build also renders as the video shelf
 *   paywalled      optional; true shows a "Paywall" pill on that source's
 *                  cards — the excerpt here is always free, but the link-out
 *                  to read the full piece is not
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
    // A dedicated Commanders category feed, not a filtered slice of a
    // general NFL feed — verified 2026-08-26 with a direct curl: standard
    // WordPress RSS, robots.txt allows everything, and every item across the
    // fetch (8 at a time) was genuinely Commanders-specific, not just
    // NFL-tagged. Lower volume than Hogs Haven/Riggo's Rag (8 items per
    // fetch vs. their dozens), but same-week fresh.
    id: 'atoz-sports',
    name: 'A to Z Sports',
    homepage: 'https://atozsports.com/nfl/washington-commanders-news/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    enabled: true,
    url: 'https://atozsports.com/nfl/washington-commanders-news/feed/',
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
    // The Athletic's beat writer for the Commanders. Not the same as the
    // dead team-tag feed noted above — this is her personal author feed
    // (discovered via the <link rel="alternate"> tag on her author page),
    // which robots.txt allows even though it disallows /athletic/rss-feed/
    // and rss=1 query links. Mixed with her older Broncos-era pieces and the
    // occasional league-wide story, so filtered rather than trusted whole —
    // same pattern as ClutchPoints above. Links go to a paywalled article
    // like every other source on this site; only the free excerpt is shown.
    id: 'athletic-jhabvala',
    name: 'Nicki Jhabvala (The Athletic)',
    homepage: 'https://www.nytimes.com/athletic/author/nicki-jhabvala/',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: false,
    paywalled: true,
    enabled: true,
    url: 'https://www.nytimes.com/athletic/rss/author/nicki-jhabvala/',
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
  {
    // ABC's DC affiliate runs a dedicated Commanders vertical with its own
    // feed, not just a general sports section — confirmed 2026-08-20 with
    // same-day-fresh, Commanders-only items (Sonny Styles, Nick Cross).
    id: 'wjla-commanders',
    name: 'WJLA (ABC7)',
    homepage: 'https://wjla.com/sports/washington-commanders',
    category: 'team',
    collector: 'rss',
    alwaysRelevant: true,
    enabled: true,
    url: 'https://wjla.com/sports/washington-commanders.rss',
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

  // ------------------------------------------------------------ fantasy
  // PARKED 2026-08-22. Both feeds are real and verified working, but a
  // Fantasy tab built on them stayed empty in practice: they're small,
  // NFL-wide tickers (5-15 items) that rarely happen to mention one specific
  // team, and no free/keyless team-filtered fantasy RSS exists (RotoWire's
  // own `team=` param is silently ignored — confirmed by diffing output
  // with and without it). The site's `category: 'fantasy'` handling and the
  // roster/surname-based relevance fallback in src/lib/relevance.js were
  // left in place rather than ripped out, in case this is revisited with a
  // better source. FantasyPros' rss.php now 302s to a plain webpage, not a
  // feed — never worked, not included even parked.
  {
    id: 'rotowire-fantasy',
    name: 'RotoWire',
    homepage: 'https://www.rotowire.com/',
    category: 'fantasy',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: false,
    url: 'https://www.rotowire.com/rss/news.php?sport=NFL',
  },
  {
    id: 'rotoballer',
    name: 'RotoBaller',
    homepage: 'https://www.rotoballer.com/',
    category: 'fantasy',
    collector: 'rss',
    alwaysRelevant: false,
    enabled: false,
    url: 'https://www.rotoballer.com/feed',
  },
];

export function enabledSources() {
  return SOURCES.filter((s) => s.enabled !== false);
}

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id);
}
