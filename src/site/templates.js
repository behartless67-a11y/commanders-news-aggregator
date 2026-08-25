import { escapeHtml } from '../lib/text.js';
import { relativeLabel, formatDateTime, formatDate, parseGameTime, formatGameDateTime, rfc822 } from '../lib/dates.js';
import { linkPlayers } from '../lib/roster-links.js';
import { SOCIAL_ACCOUNTS } from '../../config/social.js';
import { SOURCES } from '../../config/sources.js';

const CATEGORY_LABEL = { team: 'Team Source', league: 'National Coverage', blog: 'Blog', original: 'Original' };
const CATEGORY_BADGE_CLASS = { team: 'badge-team', league: 'badge-national', blog: 'badge-blog', original: 'badge-blog' };
const PAYWALLED_SOURCE_IDS = new Set(SOURCES.filter((s) => s.paywalled).map((s) => s.id));

/**
 * Open Graph / Twitter Card tags — without these, a pasted link (Slack,
 * Teams, iMessage, etc.) shows an empty placeholder image, since those
 * clients never fall back to just grabbing any image on the page. `image`
 * needs an absolute URL, not "logo.png", since the client fetching the
 * preview has no page context to resolve a relative one against.
 */
function socialMetaTags({ title, description, siteUrl }) {
  // Not logo.png directly — that's a transparent PNG meant to sit on the
  // hero photo, so a client with no page context to render it against (a
  // Slack/iMessage/Twitter preview card) showed it on whatever background
  // that client defaults to, usually white. og-image.png is the same logo
  // pre-composited onto the site's own near-black background (--bg,
  // #14100f) at the standard 1200x630 social-card size instead.
  const image = `${siteUrl}/og-image.png`;
  return `<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(siteUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">`;
}

const PAGES = [
  { file: 'index.html', label: 'All', match: () => true },
  { file: 'team-sources.html', label: 'Team Sources', match: (item) => item.category === 'team' },
  { file: 'national-coverage.html', label: 'National Coverage', match: (item) => item.category === 'league' },
];

/**
 * How much of the river is visible before the reader asks for more, and how much
 * each "show more" press adds. Every item is still in the HTML — this is a
 * display state, not a fetch, so it costs nothing to expand and the page works
 * fully expanded when JavaScript is unavailable.
 *
 * 14 is measured, not guessed: at 1440px and up the video rail renders 1537px
 * tall and 14 cards come to 1559px, so the two columns start level and there's no
 * visible jump on load. Card heights move with headline and excerpt length
 * though, so site.js measures both columns and tops the river up when a day's
 * items run short — see balance() there. Re-measure if the rail changes.
 */
const RIVER_INITIAL = Number(process.env.RIVER_INITIAL || 14);
const RIVER_BATCH = Number(process.env.RIVER_BATCH || 10);

/** Same progressive-reveal convention as the river, just a shorter initial batch — a player row is much taller than a headline card. */
const ROSTER_INITIAL = Number(process.env.ROSTER_INITIAL || 5);
const ROSTER_BATCH = Number(process.env.ROSTER_BATCH || 5);

/** Same convention again — a full post is much taller than either of the above, so one at a time is already a lot to reveal. */
const BLOG_INITIAL = Number(process.env.BLOG_INITIAL || 1);
const BLOG_BATCH = Number(process.env.BLOG_BATCH || 1);

/** Per-column initial batch on the Beat Writers page — short, since there's one of these per reporter and several columns on screen at once. */
const BEAT_INITIAL = Number(process.env.BEAT_INITIAL || 5);
const BEAT_BATCH = Number(process.env.BEAT_BATCH || 5);

/** Same progressive-reveal convention again, for the single chronological feed (Social page) mixing every watched account together. */
const SOCIAL_FEED_INITIAL = Number(process.env.SOCIAL_FEED_INITIAL || 20);
const SOCIAL_FEED_BATCH = Number(process.env.SOCIAL_FEED_BATCH || 20);

/**
 * `index` here is the card's position in the river (for the RIVER_INITIAL
 * cutoff) — unrelated to `rosterIndex`, the player name → profile-link
 * lookup, named differently on purpose so the two are never confused at a
 * glance. The excerpt is the only part of a card eligible for player links —
 * the headline is already one whole `<a>` to the original article, and HTML
 * can't nest a second `<a>` inside it.
 */
/**
 * First `n` sentences of an excerpt, for the mobile-only short version below
 * (see .card-excerpt-full/.card-excerpt-short) — a plain punctuation split is
 * good enough for a decorative truncation, not a citation boundary, so the
 * rare miss on an abbreviation like "Jr." is an acceptable trade for staying
 * dependency-free.
 */
function firstSentences(text, n) {
  const sentences = String(text || '').match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [];
  if (sentences.length <= n) return String(text || '').trim();
  return sentences.slice(0, n).join('').trim();
}

function itemCard(item, index, rosterIndex) {
  const badgeClass = CATEGORY_BADGE_CLASS[item.category] || 'badge-national';
  const badgeLabel = CATEGORY_LABEL[item.category] || item.category;
  const paywallPill = PAYWALLED_SOURCE_IDS.has(item.sourceId)
    ? '<span class="badge badge-paywall">Paywall</span>'
    : '';
  const when = item.publishedAt ? relativeLabel(item.publishedAt) : '';
  const extra = index >= RIVER_INITIAL ? ' card-extra' : '';
  // Two separate elements, not one truncated by CSS line-clamp — a line
  // count varies with viewport width and font size, but "two sentences" is
  // an exact, meaningful unit a reader can expect consistently on a phone.
  // Always both, even when identical (a short excerpt has nothing to trim),
  // so the mobile CSS swap below never has to guess whether a short version
  // exists.
  const excerptMarkup = item.excerpt
    ? `<p class="card-excerpt card-excerpt-full">${linkPlayers(item.excerpt, rosterIndex)}</p>
      <p class="card-excerpt card-excerpt-short">${linkPlayers(firstSentences(item.excerpt, 2), rosterIndex)}</p>`
    : '';
  return `
    <article class="card${extra}">
      <div class="card-top">
        <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>${paywallPill}
        <span class="card-source">${escapeHtml(item.sourceName)}</span>
        ${when ? `<span class="card-time"><time datetime="${escapeHtml(item.publishedAt || '')}">${escapeHtml(when)}</time></span>` : ''}
      </div>
      <h3 class="card-headline"><a href="${escapeHtml(item.url)}"${item.internal ? '' : ` target="_blank" rel="noopener noreferrer" data-outbound="${escapeHtml(item.sourceId)}"`}>${escapeHtml(item.title)}</a></h3>
      ${excerptMarkup}
    </article>`;
}

/**
 * `hasWeekly` gates the tab entirely rather than always showing it — until a
 * digest is approved, dist/blog.html doesn't exist, and a link to a 404 is
 * worse than no link. Blog pages pass activeFile: 'blog.html' whether
 * they're the archive or a single post, so the tab stays highlighted for both.
 * (Internally still "weekly" — recap generation, `npm run digest`, and
 * `data/digests/` are unchanged; only the reader-facing name and URL moved
 * to "Blog", since posts may start covering single game days, not just a
 * full week.)
 */
function header(activeFile, hasWeekly = false, isGameLive = false) {
  const tabs = PAGES.map(
    (p) =>
      `<a href="${p.file}"${p.file === activeFile ? ' aria-current="page"' : ''}>${escapeHtml(p.label)}</a>`,
  ).join('\n      ');
  // The badge is driven by the same schedule-window check that gates the
  // 15-minute ticker cadence (see src/lib/gamewindow.js) — one signal, two
  // consumers, so a game showing "live" here and the ticker refreshing fast
  // never disagree with each other.
  const liveBadge = isGameLive ? ' <span class="live-badge" aria-label="Game in progress">Live</span>' : '';
  const weeklyTab = hasWeekly
    ? `\n      <a href="blog.html"${activeFile === 'blog.html' ? ' aria-current="page"' : ''}>Blog${liveBadge}</a>`
    : '';
  // Jumps to the schedule widget rather than a filter of its own — always
  // points at index.html#schedule specifically (not a same-page "#schedule"
  // anchor), so it behaves the same from every page even though the widget
  // itself is also present in the sidebar on Blog/Podcasts.
  const scheduleLink = `\n      <a href="index.html#schedule" class="nav-jump">Schedule</a>`;
  const podcastsLink = `\n      <a href="podcasts.html" class="nav-jump"${activeFile === 'podcasts.html' ? ' aria-current="page"' : ''}>Podcasts</a>`;
  const musicLink = `\n      <a href="music.html" class="nav-jump"${activeFile === 'music.html' ? ' aria-current="page"' : ''}>Music</a>`;
  // "Player Updates" is the umbrella nav label for the Roster/Depth
  // Chart/Injury Tracker group (see rosterSubTabs() in templates.js) — the
  // URL and the Roster sub-tab's own label stay "roster.html"/"Roster"
  // since that's still an accurate name for the player-list sub-page
  // itself, same "label moved, internals didn't" pattern as Blog/weekly.
  // Depth Chart and Injury Tracker are second/third views of the same
  // subject, not separate nav destinations — this stays highlighted on all
  // three so the nav doesn't go dark on a page that isn't literally named
  // "Roster".
  const rosterLink = `\n      <a href="roster.html" class="nav-jump"${activeFile === 'roster.html' || activeFile === 'depth-chart.html' || activeFile === 'injury-report.html' ? ' aria-current="page"' : ''}>Player Updates</a>`;
  const howItWorksLink = `\n      <a href="how-it-works.html" class="nav-jump"${activeFile === 'how-it-works.html' ? ' aria-current="page"' : ''}>How It Works</a>`;
  // Phone-only: on the main river pages the video rail is dropped from the
  // sidebar at this width (see .page-river .widget-videos in site.css) so the
  // page is articles and schedule only — this is the only way to reach the
  // videos there. Wider screens still see the rail in place, so the link
  // would just be a redundant second path to the same widget.
  const videosLink = `\n      <a href="videos.html" class="nav-jump nav-mobile-only"${activeFile === 'videos.html' ? ' aria-current="page"' : ''}>Videos</a>`;
  const beatWritersLink = `\n      <a href="beat-writers.html" class="nav-jump"${activeFile === 'beat-writers.html' ? ' aria-current="page"' : ''}>Beat Writers</a>`;
  const contactLink = `\n      <a href="contact.html" class="nav-jump"${activeFile === 'contact.html' ? ' aria-current="page"' : ''}>Contact</a>`;
  const donateLink = `\n      <a href="donate.html" class="nav-jump nav-donate"${activeFile === 'donate.html' ? ' aria-current="page"' : ''}>Donate</a>`;

  return `<header class="site-header" id="top">
  <div class="wrap">
    <div class="header-inner">
      <div class="brand">
        <img class="brand-logo" src="logo.png" alt="The Burgundy Wire" />
        <p class="brand-kicker">Sports &middot; News &middot; DC</p>
        <p class="tagline-big">One page. Every headline. Hail efficiency.</p>
      </div>
    </div>
    <div class="header-bottom-row">
      <input type="checkbox" id="nav-toggle" class="nav-toggle-checkbox" />
      <label for="nav-toggle" class="nav-mobile-toggle">Menu</label>
      <nav class="filter-tabs" aria-label="Filter headlines by source type">
        ${tabs}${weeklyTab}${scheduleLink}${videosLink}${beatWritersLink}${podcastsLink}${musicLink}${rosterLink}${howItWorksLink}${contactLink}${donateLink}
      </nav>
    </div>
  </div>
</header>`;
}

function tickerPost(post) {
  const when = post.publishedAt ? relativeLabel(post.publishedAt) : '';
  return `<a class="ticker-post" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ticker-handle">@${escapeHtml(post.handle)}</span>
        <span class="ticker-text">${escapeHtml(post.text)}</span>
        ${when ? `<span class="ticker-time">${escapeHtml(when)}</span>` : ''}
      </a>`;
}

/**
 * Roughly how many characters of ticker should slide past per second. Posts are
 * shown in full, so the track's width varies a lot from day to day — deriving
 * the animation duration from the actual text length keeps the reading speed
 * constant instead of letting a wordy day scroll faster than a quiet one.
 */
const TICKER_CHARS_PER_SEC = Number(process.env.TICKER_CHARS_PER_SEC || 8.6);

/**
 * Marquee of recent posts. The track is rendered twice so the CSS animation can
 * loop seamlessly — the second copy is aria-hidden so screen readers and search
 * engines see each post once. Returns empty string when there's nothing to show,
 * so a failed social collection leaves no empty furniture behind.
 */
function ticker(posts) {
  if (!posts.length) return '';
  const track = posts.map(tickerPost).join('\n      ');

  // Handle and timestamp occupy space too, so they count toward the width.
  const chars = posts.reduce(
    (total, p) => total + p.text.length + p.handle.length + 12,
    0,
  );
  const seconds = Math.max(60, Math.round(chars / TICKER_CHARS_PER_SEC));

  return `<section class="ticker" aria-label="Recent posts from Commanders reporters">
  <div class="ticker-rail">
    <span class="ticker-label" aria-hidden="true">Live</span>
    <div class="ticker-viewport">
      <div class="ticker-track" style="animation-duration: ${seconds}s">
        <div class="ticker-group">
      ${track}
        </div>
        <div class="ticker-group" aria-hidden="true">
      ${track}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

/**
 * Pull the 11-character video ID out of a YouTube watch URL. Derived at render
 * time rather than stored, so the collector stays a plain RSS collector — a
 * video item is just an item whose link happens to be a watch URL.
 */
function videoId(url) {
  const match = String(url || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * Channel and league names are redundant inside a rail already labelled as the
 * team's channel — "…Before Practice | Washington Commanders | NFL" is mostly
 * boilerplate, and boilerplate is expensive in a 320px column.
 */
function tidyVideoTitle(title) {
  const trimmed = String(title || '')
    .replace(/(?:\s*\|\s*(?:washington commanders|commanders|nfl))+\s*$/i, '')
    .trim();
  return trimmed || String(title || '');
}

function videoCard(item) {
  const id = videoId(item.url);
  if (!id) return '';
  const when = item.publishedAt ? relativeLabel(item.publishedAt) : '';
  return `
        <li class="video-card">
          <a class="video-link" href="${escapeHtml(item.url)}" data-video-id="${escapeHtml(id)}" target="_blank" rel="noopener noreferrer">
            <span class="video-thumb">
              <img src="https://i.ytimg.com/vi/${escapeHtml(id)}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async" />
              <span class="video-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z"/></svg></span>
            </span>
            <span class="video-meta">
              <span class="video-title">${escapeHtml(tidyVideoTitle(item.title))}</span>
              ${when ? `<span class="video-time">${escapeHtml(when)}</span>` : ''}
            </span>
          </a>
        </li>`;
}

/**
 * Right-hand video widget. Each card ships from the build as an ordinary link
 * to YouTube, so it works with no JavaScript at all; site.js upgrades it to an
 * inline player on click — see that file for why the players aren't embedded
 * up front. Returns empty string with no videos.
 */
function videoWidget(videos) {
  const cards = videos.map(videoCard).filter(Boolean).join('\n');
  if (!cards) return '';

  return `
    <div class="widget widget-videos">
      <h2 id="video-rail-heading">Latest video</h2>
      <ul class="video-column">
${cards}
      </ul>
      <p class="videos-note">Uploaded by the Washington Commanders and played here through YouTube's own embedded player. <a href="https://www.youtube.com/@Commanders" target="_blank" rel="noopener noreferrer">View the channel</a></p>
    </div>`;
}

/** Games this many days out that still don't have a real date show "TBD" rather than being silently dropped or mis-sorted against dated games. */
const MAX_SCHEDULE_ROWS = 5;

/**
 * Opponent logos are hotlinked directly from static.www.nfl.com — the exact
 * CDN commanders.com's own schedule page uses to show the same logos, not a
 * downloaded "logo pack". Shown purely to identify an opponent on a
 * schedule, the same nominative use every sports app makes; the footer's
 * existing non-affiliation disclaimer already covers this. Never rehosted.
 */
function weekLabelOf(game) {
  // .replace() alone left a leading space in the fragment ("WEEK 1" -> " 1"),
  // and .trim() on the assembled string only strips the ends, not that
  // internal gap - rendered live as "Pre  1" before this was caught.
  const num = (game.week || '').replace(/^WEEK/i, '').trim();
  return game.season === 'preseason' ? `Preseason ${num}` : `Week ${num}`;
}

/**
 * `odds` is only ever set for the one row `scheduleWidget` has matched to
 * the cached betting line (see there) — every other row gets `null` and
 * renders exactly as before. Inline on the matchup rather than a separate
 * widget, so it reads as "the odds for this game" rather than a second,
 * disconnected feature competing for sidebar space.
 */
function scheduleRow(game, odds = null) {
  if (game.isBye) {
    return `
        <li class="schedule-row schedule-row--bye">
          <span class="schedule-logo schedule-logo--empty" aria-hidden="true"></span>
          <span class="schedule-info">
            <span class="schedule-matchup">Bye week</span>
            <span class="schedule-date">${escapeHtml(weekLabelOf(game) || '')}</span>
          </span>
        </li>`;
  }

  const iso = game.gametime ? parseGameTime(game.gametime) : null;
  // A played game shows its result where the date would go — the date only
  // matters looking forward, the result only matters looking back. An
  // upcoming game's date/time carries its own ISO timestamp so site.js can
  // reformat it into the visitor's own timezone — server-rendered, it's
  // always Eastern (see SITE_TZ in dates.js), which reads wrong for anyone
  // watching from another timezone.
  const dateOrResult = game.result
    ? escapeHtml(`${game.result} ${game.points || ''}`.trim())
    : iso
      ? `<span class="schedule-time" data-iso="${escapeHtml(iso)}">${escapeHtml(formatGameDateTime(iso))}</span>`
      : 'TBD';
  const resultClass = game.result === 'W' ? ' is-win' : game.result === 'L' ? ' is-loss' : '';
  const prefix = game.homeAway === 'AT' ? '@' : 'vs';
  const logo = `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${encodeURIComponent(game.opponentAbbr)}`;
  const oddsLine = odds
    ? `<span class="schedule-odds">${escapeHtml(odds.spreadDetails || '')}${odds.overUnder != null ? ` &middot; O/U ${escapeHtml(String(odds.overUnder))}` : ''}${odds.moneyline ? ` &middot; ML ${escapeHtml(odds.moneyline)}` : ''}</span>`
    : '';

  return `
        <li class="schedule-row">
          <img class="schedule-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(game.opponent)}" width="28" height="28" loading="lazy" decoding="async" />
          <span class="schedule-info">
            <span class="schedule-matchup">${escapeHtml(prefix)} ${escapeHtml(game.opponentShort || game.opponent)}</span>
            <span class="schedule-date${resultClass}">${escapeHtml(weekLabelOf(game) || '')} · ${dateOrResult}</span>
            ${oddsLine}
          </span>
        </li>`;
}

/**
 * Spotify's own oEmbed iframe — no API key, no scraping, just the public
 * embed URL every show page exposes. Shows picked and verified live on
 * Spotify (real, currently-publishing) rather than guessed from memory.
 */
const PODCASTS = [
  {
    name: 'Command Center Podcast',
    id: '5f67fuVkHGhkASVhl3Msby',
    description: 'The team\'s own official podcast. Former Washington players Santana Moss, Fred Smoot, and Logan Paulsen break down the current roster and each week\'s game with an insider\'s eye, mixed with stories from their own playing days.',
  },
  {
    name: 'Beltway Football',
    id: '67M5rgs9T8427Lr1A6BG7n',
    description: 'Monumental Sports Network\'s daily Commanders show, covering practice reports, roster moves, and game breakdowns from a local DC sports desk.',
  },
  {
    name: 'Locked On Commanders',
    id: '4F9T8e4JLYDZrvOAW0MPrf',
    description: 'Part of the Locked On Podcast Network\'s one-team-per-show lineup, publishing daily with a national-analyst take on the Commanders specifically, not the whole NFC East.',
  },
  {
    name: 'All Ears with JP Finlay',
    provider: 'apple',
    id: '1790896157',
    slug: 'all-ears-nbcs-washington-commanders-podcast-with-jp-finlay',
    description: "NBC Sports Washington's JP Finlay covering the Commanders, from a beat reporter who's in the building every day rather than a national or ex-player angle.",
  },
];

/** Both Spotify and Apple ship a public, key-free embed iframe — no scraping, same reasoning as the schedule/betting widgets pulling from public endpoints. */
function podcastEmbed(p) {
  if (p.provider === 'apple') {
    // 175, not Apple's larger default — at 450 the embed has room to switch
    // into its wide two-panel episode-list layout, which threw this card
    // wildly out of proportion with every Spotify one beside it. 175 keeps
    // it to the same compact single-episode card the others use.
    return `<iframe src="https://embed.podcasts.apple.com/us/podcast/${p.slug}/id${p.id}?theme=dark" title="${escapeHtml(p.name)}" width="100%" height="175" style="width:100%;overflow:hidden;background:transparent;" frameborder="0" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" allow="autoplay *; encrypted-media *; clipboard-write" loading="lazy"></iframe>`;
  }
  return `<iframe src="https://open.spotify.com/embed/show/${p.id}?utm_source=generator" title="${escapeHtml(p.name)}" width="100%" height="352" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
}

function podcastEmbeds() {
  return PODCASTS.map(
    (p) => `
      <div class="podcast-embed-block">
        <div class="podcast-embed">
          ${podcastEmbed(p)}
        </div>
        <p class="podcast-description">${escapeHtml(p.description)}</p>
      </div>`,
  ).join('\n');
}

/**
 * The full season, preseason through the regular-season finale, not just
 * what's left to play. `betting` (from data/betting.json, see
 * src/lib/betting.js) is a single next-game snapshot, not a full odds
 * table — matched here to whichever row it belongs to (by opponent, on the
 * first not-yet-played meeting, so a division rival's later rematch never
 * wrongly inherits this week's line) rather than shown as its own widget,
 * so it reads as "the odds for this game" rather than a second, unrelated
 * feature competing for sidebar space.
 */
function scheduleWidget(games, betting = null) {
  if (!games?.length) return '';
  const bettingGame = betting ? games.find((g) => !g.isBye && !g.result && g.opponentAbbr === betting.opponentAbbr) : null;
  // Straight from ESPN's own payload for whichever sportsbook is the
  // provider, not written here — see betting.js. Shown once for the widget,
  // not repeated per row.
  const disclaimer = bettingGame && betting.disclaimer ? `<p class="betting-disclaimer">${escapeHtml(betting.disclaimer)}</p>` : '';
  return `
    <div class="widget-schedule" id="schedule">
      <h2>Schedule</h2>
      <ul class="schedule-list">${games.map((g) => scheduleRow(g, g === bettingGame ? betting : null)).join('\n')}
      </ul>
      ${disclaimer}
    </div>`;
}

/**
 * One stat group at a time behind an Offense/Defense toggle, rather than both
 * stacked — the rail already carries a full-season schedule under it, and
 * showing both groups at once was twice the height for content most readers
 * only want half of. A radio pair plus CSS sibling selectors, same zero-JS
 * approach as the phone nav dropdown (see .nav-toggle-checkbox), so the widget
 * works with JavaScript off and costs the page nothing.
 *
 * The two halves are deliberately not symmetrical, and that's a data limit
 * rather than a design choice: ESPN publishes a league rank for a team's own
 * offensive output but returns zeroes for every opponent field, so the
 * defensive figures are derived from box scores and have no rank to show. See
 * src/lib/teamstats.js. Defense renders its number with no rank instead of
 * borrowing offense's or inventing one.
 */
function teamStatsWidget(teamStats) {
  if (!teamStats?.offense) return '';

  const stat = (s) => (s?.value != null ? s.value : null);
  const rankOf = (s) =>
    s?.rankLabel
      ? `<strong class="ts-rank">${escapeHtml(s.rankLabel)}</strong>`
      : '<span class="ts-norank">rank n/a</span>';

  const group = (side, data, leaders) => {
    if (!data) return '';
    const yds = stat(data.yardsPerGame);
    const pts = stat(data.pointsPerGame);
    const suffix = side === 'def' ? ' allowed' : '';
    const line = [
      yds ? `${escapeHtml(yds)} yds/gm${suffix}` : null,
      pts ? `${escapeHtml(pts)} pts/gm${suffix}` : null,
    ]
      .filter(Boolean)
      .join(' &middot; ');
    return `
      <div class="ts-panel ts-panel-${side}">
        <p class="ts-headline">${rankOf(data.yardsPerGame)} <span class="ts-line">${line}</span></p>
        ${leaders}
      </div>`;
  };

  const leaderList = (rows) =>
    rows.length
      ? `<ul class="ts-leaders">${rows
          .map(
            (r) =>
              `<li class="ts-leader"><span class="ts-leader-key">${escapeHtml(r.key)}</span><span class="ts-leader-name">${escapeHtml(r.name)}</span><span class="ts-leader-val">${escapeHtml(r.value)}</span></li>`,
          )
          .join('')}</ul>`
      : '';

  const offense = group('off', teamStats.offense, leaderList(teamStats.leaders?.offense || []));
  const defense = group('def', teamStats.defense, leaderList(teamStats.leaders?.defense || []));
  if (!offense && !defense) return '';

  // Only offer the toggle when there are two sides to toggle between —
  // with defense unavailable this degrades to a plain offense block.
  const tabs = offense && defense;

  // The single-side variant is flagged with a class rather than detected in CSS
  // with :not(:has(...)) — the panel has to be visible for the widget to say
  // anything at all, so its display must not hinge on :has() support.
  return `
    <div class="widget widget-teamstats${tabs ? '' : ' widget-teamstats-single'}">
      <h2 id="team-stats-heading">Team Stats <span class="ts-season">${escapeHtml(String(teamStats.season || ''))}</span></h2>
${
  tabs
    ? `      <input type="radio" name="ts-tab" id="ts-off" class="ts-radio" checked />
      <input type="radio" name="ts-tab" id="ts-def" class="ts-radio" />
      <div class="ts-tabstrip">
        <label for="ts-off">Offense</label>
        <label for="ts-def">Defense</label>
      </div>
${offense}
${defense}`
    : `${offense}${defense}`
}
    </div>`;
}

/** Returns empty string with nothing to show in any widget, and renderPage then widens the river to the full page rather than leaving a dead column. */
function sidebar(videos, games, betting = null, teamStats = null) {
  const video = videoWidget(videos);
  const stats = teamStatsWidget(teamStats);
  const schedule = scheduleWidget(games, betting);
  if (!video && !schedule && !stats) return '';
  // Stats above the schedule deliberately: the schedule runs a full season of
  // rows, so anything placed under it is effectively unreachable without a
  // long scroll.
  //
  // Stats and schedule share a nested column rather than being siblings of the
  // video widget, because above 1400px the rail turns into a two-across row
  // (see the min-width: 1400px block in site.css) — as flat siblings the stats
  // block became a third column *beside* the schedule instead of above it.
  // Nesting keeps "stats, then schedule" true at every width. Below 1400px the
  // wrapper is a no-op: one column inside one column.
  const stack = [stats, schedule].filter(Boolean).join('\n');
  return `<aside class="sidebar" aria-labelledby="video-rail-heading">
${video}
${stack ? `    <div class="sidebar-stack">\n${stack}\n    </div>` : ''}
  </aside>`;
}

function footer(sources, generatedAt) {
  const teamLinks = sources
    .filter((s) => s.category === 'team')
    .map((s) => `<li><a href="${escapeHtml(s.homepage)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></li>`)
    .join('');
  const leagueLinks = sources
    .filter((s) => s.category === 'league')
    .map((s) => `<li><a href="${escapeHtml(s.homepage)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></li>`)
    .join('');

  return `<footer class="site-footer">
  <div class="wrap">
    <input type="checkbox" id="footer-toggle" class="nav-toggle-checkbox" />
    <label for="footer-toggle" class="footer-toggle">More about this site</label>
    <div class="footer-grid">
      <div class="footer-col footer-about">
        <h3>About this page</h3>
        <p class="footer-about-full">The Burgundy Wire pulls headlines from the Commanders' official site and national outlets into one running feed. Every link goes straight to the original publisher — we host no articles ourselves.</p>
        <p class="footer-about-full">Rebuilt automatically every few hours.</p>
        <p class="footer-about-short">Commanders headlines from official and national sources, rebuilt every few hours.</p>
      </div>
      <div class="footer-col">
        <h3>Team Sources</h3>
        <ul class="source-list source-list-columns">${teamLinks}</ul>
      </div>
      <div class="footer-col">
        <h3>National Coverage</h3>
        <ul class="source-list">${leagueLinks}</ul>
      </div>
      <div class="footer-col">
        <h3>Subscribe</h3>
        <a class="rss-link" href="feed.xml">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 11a9 9 0 0 1 9 9h-2.5a6.5 6.5 0 0 0-6.5-6.5V11zm0-6a15 15 0 0 1 15 15h-2.5A12.5 12.5 0 0 0 4 7.5V5zm2 12.5A1.75 1.75 0 1 1 6 21a1.75 1.75 0 0 1 0-3.5z"/></svg>
          RSS Feed
        </a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>Headlines link to their original publishers. The Burgundy Wire is one fan's independent project, built and run solo, not an official team site and not affiliated with the Washington Commanders or the NFL, just deeply, unreasonably invested.</span>
      <span><a href="admin.html" class="footer-admin-link">Admin</a> &middot; &copy; ${new Date(generatedAt).getFullYear()} The Burgundy Wire</span>
    </div>
  </div>
</footer>`;
}

/**
 * Weekly AI recap.
 *
 * Every claim is generated by a local model from that week's headlines and
 * reporter posts, then held in a draft-review-approve gate (src/digest/) before
 * it ever reaches here — build.js only renders records with status:
 * 'published'. The disclosure is mandatory on both the archive and every post,
 * not just once, because a reader can land on a single post from a search
 * result or a share link without ever seeing the archive page.
 */
function digestDisclosure(model) {
  return `<p class="digest-disclosure">Written by a local AI model (${escapeHtml(model)}) from that week's headlines and reporter posts — not by a person. Every claim is sourced above; nothing here is original reporting. <a href="blog.html">All posts</a></p>`;
}

function weekLabel(record) {
  return `${formatDate(record.windowStart)} – ${formatDate(record.windowEnd)}`;
}

/**
 * The counterpart to digestDisclosure() for a personal post: no model to name
 * and no "every claim is sourced above", because there's no generation step
 * and no corpus behind one of these (see src/digest/originals.js — a record
 * is written by hand and only needs status: 'published'). What it discloses
 * instead is the split the author actually works in: the take is theirs, the
 * prose got an AI polish. Deliberately lighter in tone than the digest's
 * disclosure, since it's a personal essay rather than a machine recap.
 */
function originalDisclosure() {
  return `<p class="digest-disclosure">These are my thoughts &mdash; AI just made them pretty. <a href="blog.html">All posts</a></p>`;
}

/**
 * Model citation markers ("[3, 11]") are for validation, not the reading
 * view — the consolidated source list at the end of the post carries that
 * job instead. Also spaces out ESPN's own play-by-play abbreviation style
 * ("L.Altmyer") into normal prose ("L. Altmyer") — the model quotes that
 * style verbatim from the source plays, but it reads as a typo once it's in
 * a sentence meant to be read, not a box score. "T.J.Watt" only gains the
 * one space before the surname, matching how a compound-initial name is
 * actually punctuated ("T.J. Watt").
 */
const stripInlineCites = (text) =>
  String(text || '')
    .replace(/\s*\[[\d,\s]+\]/g, '')
    .replace(/\b([A-Z])\.([A-Z][a-z])/g, '$1. $2');

/**
 * Published Blog posts (weekly recaps and game previews), reshaped into the
 * same item fields itemCard() already knows how to render — so a new post
 * competes for river placement by its own publish date instead of getting
 * pinned above or below real headlines. `internal: true` is the only field
 * a normal collected item never has; it's what tells itemCard() to link
 * same-site instead of opening a new tab.
 */
export function blogRiverItems(digests, previews, originals = []) {
  const fromDigest = (record) => ({
    id: `blog-digest-${record.week}`,
    sourceId: 'blog',
    sourceName: 'The Burgundy Wire',
    category: 'blog',
    url: `blog-${record.week}.html`,
    title: record.digest.headline,
    excerpt: firstSentences(stripInlineCites(record.digest.lede), 2),
    publishedAt: record.reviewedAt || record.generatedAt,
    internal: true,
  });
  const fromPreview = (record) => ({
    id: `blog-preview-${record.gameKey}`,
    sourceId: 'blog',
    sourceName: 'The Burgundy Wire',
    category: 'blog',
    url: `blog-preview-${record.gameKey}.html`,
    title: record.digest.headline,
    excerpt: firstSentences(stripInlineCites(record.digest.lede), 2),
    publishedAt: record.reviewedAt || record.generatedAt,
    internal: true,
  });
  // category: 'original' rather than 'blog' — same page placement (see
  // PAGES below), but its own badge text on the river card so a hand-written
  // post reads as distinct from an AI-generated recap at a glance.
  const fromOriginal = (record) => ({
    id: `blog-original-${record.slug}`,
    sourceId: 'blog',
    sourceName: 'The Burgundy Wire',
    category: 'original',
    url: `blog-original-${record.slug}.html`,
    title: record.title,
    excerpt: firstSentences(record.paragraphs[0], 2),
    publishedAt: record.publishedAt,
    internal: true,
  });
  return [...digests.map(fromDigest), ...previews.map(fromPreview), ...originals.map(fromOriginal)];
}

/**
 * Threads are an internal organizing tool for citations, not a reader-facing
 * feature — see prompt.js's STRUCTURE rule. No heading, no wrapping box; the
 * bodies are meant to read as one continuous column when concatenated.
 */
function digestThread(thread, rosterIndex) {
  return `      <p class="digest-para">${linkPlayers(stripInlineCites(thread.body), rosterIndex)}</p>`;
}

/**
 * Every citation used anywhere in the post, deduplicated and in first-cited
 * order, so a source backing three different threads appears once — not
 * scattered across three separate boxes. Read like an article's own reference
 * list rather than a per-paragraph appendix, which is the whole point: a
 * professional recap attributes reporting once, not after every sentence.
 */
function collectCites(digest) {
  const seen = new Set();
  const order = [];
  const add = (cites) => {
    for (const n of cites || []) {
      if (seen.has(n)) continue;
      seen.add(n);
      order.push(n);
    }
  };
  digest.threads.forEach((t) => add(t.cites));
  return order;
}

/**
 * Collapsed by default behind one toggle — a flat visible list of 30-40
 * sources dominated the bottom of the page more than the article itself.
 * Native <details>, so it works with no JavaScript.
 */
function digestSourceFooter(cites, byIndex) {
  const items = cites
    .map((n) => byIndex.get(n))
    .filter(Boolean)
    .map((e) => {
      const label = e.kind === 'post' ? `@${e.handle}` : e.sourceName;
      const what = e.kind === 'post' ? e.text : e.title;
      return `<li><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a> — ${escapeHtml(what)}</li>`;
    })
    .join('');
  if (!items) return '';
  return `
      <section class="digest-source-footer">
        <details class="digest-source-toggle">
          <summary>Sources (${cites.length})</summary>
          <p class="digest-source-note">This recap was written from the reporting below. Follow any link for the original story.</p>
          <ol class="digest-source-list">${items}</ol>
        </details>
      </section>`;
}

/** Shared by the single-post page and the index — the index now shows full
 * recaps rather than link-out previews, so both need the same article body. */
function digestArticleBody(record, rosterIndex, headingTag = 'h2') {
  const byIndex = new Map(record.corpus.map((e) => [e.n, e]));
  const { digest } = record;
  const threads = digest.threads.map((t) => digestThread(t, rosterIndex)).join('\n');
  const sourceFooter = digestSourceFooter(collectCites(digest), byIndex);
  return `
    <article class="digest-post">
      <${headingTag}>${escapeHtml(digest.headline)}</${headingTag}>
      <p class="digest-week">Week of ${escapeHtml(weekLabel(record))} · generated ${escapeHtml(formatDateTime(record.generatedAt))}</p>
      <p class="digest-lede">${linkPlayers(stripInlineCites(digest.lede), rosterIndex)}</p>
${threads}
${sourceFooter}
    </article>`;
}

/**
 * Same shape as digestArticleBody, and reuses digestThread/digestSourceFooter
 * unchanged — the one thing a preview record doesn't carry that a weekly
 * digest does is windowStart/windowEnd (there's no "week of" for a preview,
 * just a specific game), so this writes its own subtitle line instead of
 * calling weekLabel().
 */
function previewArticleBody(record, rosterIndex, headingTag = 'h2') {
  const byIndex = new Map(record.corpus.map((e) => [e.n, e]));
  const { digest } = record;
  const threads = digest.threads.map((t) => digestThread(t, rosterIndex)).join('\n');
  const sourceFooter = digestSourceFooter(collectCites(digest), byIndex);
  const matchup = `Preview: ${record.homeAway === 'AT' ? 'at' : 'vs.'} ${record.opponent}`;
  return `
    <article class="digest-post preview-post">
      <${headingTag}>${escapeHtml(digest.headline)}</${headingTag}>
      <p class="digest-week">${escapeHtml(matchup)} · generated ${escapeHtml(formatDateTime(record.generatedAt))}</p>
      <p class="digest-lede">${linkPlayers(stripInlineCites(digest.lede), rosterIndex)}</p>
${threads}
${sourceFooter}
    </article>`;
}

/**
 * Hand-written posts (src/digest/originals.js) — no threads, no citations,
 * no corpus; just paragraphs someone actually typed. The "Original" badge is
 * the one visible signal that separates this from the AI-generated recap
 * and preview posts sharing the same Blog archive.
 */
function originalArticleBody(record, rosterIndex, headingTag = 'h2') {
  const paragraphs = record.paragraphs.map((p) => `<p class="digest-para">${linkPlayers(p, rosterIndex)}</p>`).join('\n');
  return `
    <article class="digest-post original-post">
      <p class="original-badge-row"><span class="badge badge-blog">Original</span></p>
      <${headingTag}>${escapeHtml(record.title)}</${headingTag}>
      <p class="digest-week">${escapeHtml(formatDate(record.publishedAt))}</p>
${paragraphs}
    </article>`;
}

/**
 * The live game-day post — separate from digestArticleBody because its data
 * shape is fundamentally different (an accumulating list of quarter
 * entries from data/live-game.json, not a single one-shot digest record).
 * Entries render newest-first, matching live-blog convention, and no
 * source-footer link list — the "sources" here are ESPN's own play text and
 * a handful of social posts (see src/digest/live-generate.js), not linkable
 * articles the way the weekly digest's citations are.
 */
/**
 * The model may write one paragraph or several (separated by a blank line,
 * see live-prompt.js) depending on how much real detail was available —
 * each becomes its own <p> rather than one block with a raw line break
 * sitting in the middle of it. Citation brackets ([3, 5]) are for grounding
 * only, never reader-facing, same as the weekly digest's stripInlineCites.
 */
function liveParagraphs(text, rosterIndex) {
  return String(text || '')
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((para) => `<p class="digest-para">${linkPlayers(stripInlineCites(para.trim()), rosterIndex)}</p>`)
    .join('\n        ');
}

/**
 * Generated once, at game end (see generateFinalThoughts in
 * live-generate.js) — a step back from the quarter-by-quarter play-by-play
 * to an actual postgame take, plus this site's own running bit instead of
 * a generic "game ball".
 */
const LIVE_AWARD_ICON = '<svg class="live-award-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66l.07-.11L13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15L11 21z"/></svg>';

function liveAwardCard(kind, recipient, reason, rosterIndex) {
  return `
        <div class="live-award live-award--${kind}">
          <p class="live-award-name">${LIVE_AWARD_ICON} The Live Wire Award &middot; ${kind === 'hero' ? 'Hero' : 'Goat'}</p>
          <p class="live-award-recipient">${linkPlayers(stripInlineCites(recipient || ''), rosterIndex)}</p>
          <p class="live-award-reason">${linkPlayers(stripInlineCites(reason || ''), rosterIndex)}</p>
        </div>`;
}

/**
 * Real photos from posts already cited in the body text (see
 * photosFromCites() in live-generate.js) — never a photo the model picked on
 * its own, so every image here is one a reader could also find by following
 * the same post's own link. Wrapped in a link back to that post rather than
 * shown bare, same "always attribute" rule as everything else on this page.
 */
function finalThoughtsPhotos(images) {
  if (!images?.length) return '';
  return `
        <div class="live-photo-row">
          ${images
            .map(
              (img) => `<a class="live-photo" href="${escapeHtml(img.postUrl)}" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(img.url)}" alt="" loading="lazy" />
            <span class="live-photo-credit">via @${escapeHtml(img.author)}</span>
          </a>`,
            )
            .join('\n          ')}
        </div>`;
}

function finalThoughtsBlock(finalThoughts, rosterIndex) {
  if (!finalThoughts) return '';
  // Written after the last entry rather than alongside it, so it gets its own
  // posting time for the same reason the entries do — see the note in
  // liveGamePost().
  const posted = finalThoughts.generatedAt
    ? `<time class="live-entry-time" datetime="${escapeHtml(finalThoughts.generatedAt)}">${escapeHtml(formatDateTime(finalThoughts.generatedAt))}</time>`
    : '';
  return `
      <div class="live-final-thoughts">
        <h3>Final Thoughts${posted ? ` <span class="live-final-thoughts-time">${posted}</span>` : ''}</h3>
        ${finalThoughtsPhotos(finalThoughts.images)}
        ${liveParagraphs(finalThoughts.body, rosterIndex)}
        <p class="live-award-tagline">Two Live Wire Awards a game: Hero for the single biggest positive impact, Goat for the single biggest negative one.</p>
        <div class="live-award-row">
${liveAwardCard('hero', finalThoughts.heroRecipient, finalThoughts.heroReason, rosterIndex)}
${liveAwardCard('goat', finalThoughts.goatRecipient, finalThoughts.goatReason, rosterIndex)}
        </div>
      </div>`;
}

/**
 * When the live post last said something new — its newest entry, or the
 * final-thoughts wrap-up written after the last one. This is the post's
 * release time, so the Blog index can sort it into the stream by date like
 * every other post instead of pinning it on top: while a game is in progress
 * it's minutes old and lands first on its own, and once the game is over a
 * post published later correctly moves above it.
 */
function liveReleasedAt(state) {
  return (
    [state?.finalThoughts?.generatedAt, ...(state?.entries || []).map((e) => e.generatedAt)]
      .filter(Boolean)
      .sort()
      .pop() || ''
  );
}

/**
 * The live game-day post — separate from digestArticleBody because its data
 * shape is fundamentally different (an accumulating list of quarter
 * entries from data/live-game.json, not a single one-shot digest record).
 * Entries render newest-first, matching live-blog convention, with the
 * once-per-game final-thoughts wrap-up (if any) leading the whole post.
 * No source-footer link list — the "sources" here are ESPN's own play text
 * and a handful of social posts (see src/digest/live-generate.js), not
 * linkable articles the way the weekly digest's citations are.
 */
function liveGamePost(state, rosterIndex) {
  if (!state?.entries?.length) return '';
  const badge = state.gameOver ? '' : ' <span class="live-badge" aria-label="Game in progress">Live</span>';
  const finalScore = state.entries[state.entries.length - 1]?.score;
  const scoreLine = state.gameOver && finalScore
    ? `Final: Commanders ${finalScore.commanders}, ${escapeHtml(state.opponent)} ${finalScore.opponent}`
    : `Live: Commanders vs ${escapeHtml(state.opponent)}${badge}`;
  // Once final-thoughts exists, its (deliberately sassy, see live-prompt.js
  // rule 8) headline becomes the real title, with the plain score line
  // demoted to a subtitle underneath rather than doubling up on the score.
  const sassyHeadline = state.finalThoughts?.headline ? linkPlayers(stripInlineCites(state.finalThoughts.headline), rosterIndex) : null;
  const titleBlock = sassyHeadline
    ? `<h2>${sassyHeadline}</h2>\n      <p class="live-score-subtitle">${scoreLine}</p>`
    : `<h2>${scoreLine}</h2>`;
  const entries = [...state.entries]
    .reverse()
    .map((e) => {
      // Each entry goes up mid-game, minutes after the period it covers, so it
      // carries its own posting time. "End of Q3" alone doesn't tell a reader
      // arriving later whether they're looking at something from ten minutes
      // ago or from last Saturday — and since entries accumulate into one post
      // over several hours, the post's own date can't answer that either.
      // <time datetime> so the machine-readable instant rides along with the
      // formatted one, same as the river's cards.
      const posted = e.generatedAt
        ? ` &middot; <time class="live-entry-time" datetime="${escapeHtml(e.generatedAt)}">${escapeHtml(formatDateTime(e.generatedAt))}</time>`
        : '';
      return `
      <div class="live-entry">
        <p class="live-entry-meta">${escapeHtml(e.label)} &middot; Commanders ${e.score.commanders}, ${escapeHtml(state.opponent)} ${e.score.opponent}${posted}</p>
        ${liveParagraphs(e.body, rosterIndex)}
      </div>`;
    })
    .join('\n');
  return `
    <article class="digest-post live-game-post">
      ${titleBlock}
${finalThoughtsBlock(state.finalThoughts, rosterIndex)}
${entries}
    </article>`;
}

export function renderWeeklyPost(record, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  const { digest } = record;
  const rail = sidebar(videos, games, betting, teamStats);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(digest.headline)} — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(digest.lede)}">
${socialMetaTags({ title: `${digest.headline} — ${siteName}`, description: digest.lede, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('blog.html', true, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div>
${digestArticleBody(record, rosterIndex, 'h1')}
    ${digestDisclosure(record.model)}
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/** Same shape as renderWeeklyPost, using previewArticleBody() instead of digestArticleBody() — see that function's own comment for why. */
export function renderPreviewPost(record, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  const { digest } = record;
  const rail = sidebar(videos, games, betting, teamStats);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(digest.headline)} — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(digest.lede)}">
${socialMetaTags({ title: `${digest.headline} — ${siteName}`, description: digest.lede, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('blog.html', true, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div>
${previewArticleBody(record, rosterIndex, 'h1')}
    ${digestDisclosure(record.model)}
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderOriginalPost(record, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  // The opening paragraph alone is only 2 sentences — pull the third from the
  // paragraph after it rather than stopping short of the requested length.
  const excerpt = firstSentences(record.paragraphs.slice(0, 2).join(' '), 3);
  const rail = sidebar(videos, games, betting, teamStats);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(record.title)} — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(excerpt)}">
${socialMetaTags({ title: `${record.title} — ${siteName}`, description: excerpt, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('blog.html', true, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div>
${originalArticleBody(record, rosterIndex, 'h1')}
    ${originalDisclosure()}
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderWeeklyIndex(records, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, teamStats = null, isGameLive = false, liveGame = null, previewRecords = [], originalRecords = [] }) {
  const rail = sidebar(videos, games, betting, teamStats);
  const livePost = liveGamePost(liveGame, rosterIndex);
  // Weekly digests, previews, originals, and the live game post are four
  // different record shapes sharing one reverse-chronological stream, keyed on
  // when each was *released* rather than on what it covers.
  //
  // Three of the four used to sort on the wrong field. A digest sorted by
  // `week` (the range it recaps) and a preview by `gameKey` (the game it looks
  // ahead to), so a preview written today for a game three weeks out jumped
  // above everything already published, and a digest reviewed two days after
  // its window closed sorted as if it had gone up on day one. The live post
  // wasn't sorted at all — it was pinned to the head of the list, ahead of
  // posts written days later. Release timestamps fix all four, and they're
  // also exactly what the river already sorts these by (see blogRiverItems),
  // so the Blog and the river can no longer disagree about which post is
  // newest.
  const dated = [
    ...records.map((r) => ({ sortKey: r.reviewedAt || r.generatedAt, html: `${digestArticleBody(r, rosterIndex, 'h2')}\n    ${digestDisclosure(r.model)}` })),
    ...previewRecords.map((r) => ({ sortKey: r.reviewedAt || r.generatedAt, html: `${previewArticleBody(r, rosterIndex, 'h2')}\n    ${digestDisclosure(r.model)}` })),
    ...originalRecords.map((r) => ({ sortKey: r.publishedAt, html: `${originalArticleBody(r, rosterIndex, 'h2')}\n    ${originalDisclosure()}` })),
    ...(livePost ? [{ sortKey: liveReleasedAt(liveGame), html: livePost }] : []),
  ].sort((a, b) => String(b.sortKey || '').localeCompare(String(a.sortKey || '')));
  const posts = dated.map((d) => d.html);
  // Same progressive-reveal convention as the river/roster, at the whole-post
  // level — a single full post can already be taller than the video widget
  // beside it, so as the Blog fills up with more of them this keeps the
  // archive from just being one long uninterrupted scroll. Every post is in
  // the HTML either way — this only controls how many are expanded on load,
  // so a collapsed post is still reachable and still indexable.
  const blogCollapsed = posts.length > BLOG_INITIAL;
  const postBlocks = posts.map((html, i) => {
    const divider = i > 0 ? '<hr class="digest-divider">\n    ' : '';
    return `<div class="blog-post${i >= BLOG_INITIAL ? ' blog-post-extra' : ''}">${divider}${html}</div>`;
  });
  const articles = postBlocks.join('\n    ');
  const nextBlogBatch = Math.min(BLOG_BATCH, posts.length - BLOG_INITIAL);
  const blogMoreButton = blogCollapsed
    ? `
    <button class="blog-more" type="button" data-batch="${BLOG_BATCH}">
      <span class="blog-more-label">Show ${nextBlogBatch} more</span>
      <svg class="river-more-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
    </button>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blog — ${escapeHtml(siteName)}</title>
<meta name="description" content="AI-written recaps and posts about Washington Commanders news, generated locally and reviewed before publishing.">
${socialMetaTags({ title: `Blog — ${siteName}`, description: 'AI-written recaps and posts about Washington Commanders news, generated locally and reviewed before publishing.', siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
<noscript><style>
  /* Same reasoning as the river's own noscript override — every post is
     already in the HTML, so with no JS to expand it the list must not stay
     collapsed. */
  .blog-list.is-collapsed .blog-post-extra{ display: block; }
  .blog-list.is-collapsed + .blog-more{ display: none; }
</style></noscript>
</head>
<body>

<div class="hero">
${header('blog.html', true, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div>
    ${
      articles
        ? `<div class="blog-list${blogCollapsed ? ' is-collapsed' : ''}">${articles}</div>
    ${blogMoreButton}`
        : '<p class="river-empty">No posts published yet.</p>'
    }
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderHowItWorksPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  const rail = sidebar(videos, games, betting, teamStats);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How It Works — ${escapeHtml(siteName)}</title>
<meta name="description" content="A mostly-honest, occasionally unhinged explanation of the robots that run this site.">
${socialMetaTags({ title: `How It Works — ${siteName}`, description: 'A mostly-honest, occasionally unhinged explanation of the robots that run this site.', siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('how-it-works.html', hasWeekly, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div class="how-it-works">
    <h1 class="podcasts-heading">How This Whole Thing Works</h1>
    <p class="page-intro page-intro-wide">A layman's explanation. Mostly accurate. No robots were harmed, though several were mildly scolded.</p>

    <section class="how-section">
      <h2>The headline river</h2>
      <p class="digest-para">Every few hours, a script opens up eight or so Commanders websites and asks one question of every headline: "does this mention the Commanders." If it's actually about the Lions and the Commanders got mentioned in passing, it's out. It is not a journalist. It just really, really likes making lists.</p>
    </section>

    <section class="how-section">
      <h2>The ticker</h2>
      <p class="digest-para">That scrolling strip near the top is this site eavesdropping on beat reporters' social media, through a side door, because the front door started charging rent. It refreshes every couple hours, and every 15 minutes during a game.</p>
    </section>

    <section class="how-section">
      <h2>The Blog (weekly editions)</h2>
      <p class="digest-para">Once a week, an AI model that lives on this computer reads everything that happened and writes a proper column, quotes and all. It doesn't get to publish itself — a human reads the draft and has to click "approve" first, after an early test model once confidently invented a player who never put on a Commanders helmet.</p>
    </section>

    <section class="how-section">
      <h2>The Blog (game previews)</h2>
      <p class="digest-para">The day before a game, the same local AI writes a preview from the matchup itself, the current betting line, and whatever's been reported that week, no result implied since there isn't one yet. Same rule as the weekly edition: a human has to approve it before it publishes.</p>
    </section>

    <section class="how-section">
      <h2>The Blog (game days, new and slightly reckless)</h2>
      <p class="digest-para">During an actual game there's no time for a human between quarters, so this part runs unsupervised. Every 15 minutes a faster, cloud-based AI checks the score and, if a quarter just ended, writes a recap from the real play-by-play plus what fans and reporters are posting live. Its one leash: it can only call a play "amazing" if a real person already said so first, with their name attached.</p>
    </section>

    <section class="how-section">
      <h2>The betting line</h2>
      <p class="digest-para">The spread and over/under next to the schedule come from a real sportsbook, by way of ESPN's own public data. Not a tip, a lock, or financial advice.</p>
    </section>

    <section class="how-section">
      <h2>Podcasts and the schedule</h2>
      <p class="digest-para">The schedule is scraped from the team's own site. The podcasts are just real Spotify players, doing what Spotify players do.</p>
    </section>

    <section class="how-section">
      <h2>The Roster page</h2>
      <p class="digest-para">Every player, photo included, sorted by something commanders.com's own roster page won't tell you: who this site's own coverage is actually talking about this week, backed by real ESPN season stats next to each name. The other 70-ish quiet players are still in there, just filed under a button. A "Depth Chart" tab up top pulls the team's own official depth chart straight from their site, position by position.</p>
    </section>

    <section class="how-section">
      <h2>The Videos page (phones only)</h2>
      <p class="digest-para">On a phone, the video rail moves off the main page and gets its own "Videos" tab, since scrolling past six press conferences to reach the schedule wasn't the point. On a bigger screen the rail just sits beside everything else, and the tab doesn't bother existing.</p>
    </section>

    <section class="how-section">
      <h2>The plumbing nobody asked about</h2>
      <p class="digest-para">None of this lives on a server anyone has to babysit. A robot on GitHub's own computers wakes up every few hours, does the collecting and writing, and hands the result to Netlify to serve. If it oversleeps, the site just keeps showing whatever it built last time.</p>
    </section>

    <section class="how-section">
      <h2>Why "The Burgundy Wire"?</h2>
      <p class="digest-para">Burgundy, because that's aggressively the team's color. Wire, because a "news wire" is the old-timey term for exactly what this is. "The Burgundy RSS Feed" tested poorly with a focus group of one person.</p>
    </section>

    <section class="how-section">
      <h2>The fine print, but funnier</h2>
      <p class="digest-para">This is a hobby project built by one person and several well-behaved scripts, not a newsroom. If something here is wrong, it's almost certainly the robots' fault, and they have already been informed of this in writing.</p>
    </section>
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * A player's own commanders.com profile is a click away for anyone who wants
 * height/weight/college, so this row doesn't repeat that page. Its reason to
 * exist is the season stat line (from ESPN, refreshed nightly alongside the
 * roster itself — see roster-stats.js) and the mention count: how much of
 * this site's own aggregated coverage is actually about that player right
 * now, with the actual headlines to back the number up.
 */
function rosterCard(player, mentionInfo, { showMentionBadge = true, extra = false } = {}) {
  const count = mentionInfo ? mentionInfo.count : 0;
  const recent = mentionInfo ? mentionInfo.recentItems : [];
  const mentionLabel = count === 1 ? '1 mention' : `${count} mentions`;
  const profileUrl = `https://www.commanders.com/team/players-roster/${escapeHtml(player.slug)}/`;
  const photo = player.photo
    ? `<img class="roster-photo" src="${escapeHtml(player.photo)}" alt="" loading="lazy" width="96" height="96">`
    : `<span class="roster-photo roster-photo-placeholder" aria-hidden="true">#${escapeHtml(player.jersey)}</span>`;
  const statsLine = player.stats
    ? `<div class="roster-stats">
        <span class="roster-stats-season">${escapeHtml(String(player.stats.season))} season</span>
        ${player.stats.fields.map((f) => `<span class="roster-stat"><strong>${escapeHtml(f.value)}</strong> ${escapeHtml(f.label)}</span>`).join('\n        ')}
      </div>`
    : '';
  return `
    <article class="roster-row${extra ? ' roster-row-extra' : ''}">
      <a class="roster-photo-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer" tabindex="-1">${photo}</a>
      <div class="roster-info">
        <div class="roster-info-top">
          <h3 class="roster-name"><a href="${profileUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(player.name)}</a></h3>
          <span class="roster-jersey">#${escapeHtml(player.jersey)}</span>
          <span class="roster-position">${escapeHtml(player.position)}</span>
          ${showMentionBadge ? `<span class="roster-mention-count">${mentionLabel}</span>` : ''}
        </div>
        ${statsLine}
        ${
          recent.length
            ? `<ul class="roster-recent">
          ${recent
            .map((item) => {
              const when = item.publishedAt ? relativeLabel(item.publishedAt) : '';
              return `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>${when ? ` <span class="roster-recent-time">${escapeHtml(when)}</span>` : ''}</li>`;
            })
            .join('\n          ')}
        </ul>`
            : ''
        }
      </div>
    </article>`;
}

/** Shared by the Roster, Depth Chart, and Injury Report pages — one subject, three views, not three unrelated nav items. */
function rosterSubTabs(active) {
  return `<div class="roster-subtabs">
    <a href="roster.html"${active === 'roster' ? ' aria-current="page"' : ''}>Roster</a>
    <a href="depth-chart.html"${active === 'depth-chart' ? ' aria-current="page"' : ''}>Depth Chart</a>
    <a href="injury-report.html"${active === 'injury-report' ? ' aria-current="page"' : ''}>Injury Tracker</a>
  </div>`;
}

export function renderRosterPage({
  siteName,
  siteUrl,
  sources,
  generatedAt,
  hasWeekly = false,
  videos = [],
  games = [],
  betting = null,
  teamStats = null,
  isGameLive = false,
  rosterPlayers = [],
  mentionCounts = new Map(),
}) {
  const rail = sidebar(videos, games, betting, teamStats);
  // Most-talked-about first — the entire point of this page over just
  // linking to commanders.com's own roster. Ties (usually both at zero)
  // fall back to alphabetical so the order is at least stable build to build.
  const sorted = [...rosterPlayers].sort((a, b) => {
    const countA = mentionCounts.get(a.slug)?.count || 0;
    const countB = mentionCounts.get(b.slug)?.count || 0;
    return countB - countA || a.name.localeCompare(b.name);
  });
  // Split rather than one long list — most of a 92-man roster has no recent
  // coverage at all, and burying the players this page is actually about
  // under 70 quiet rows defeats the point. The quiet rest of the roster is
  // still here, just tucked behind a native <details> disclosure so it costs
  // nothing (no JS) to expand and nothing to skip past when collapsed.
  const mentioned = sorted.filter((p) => mentionCounts.get(p.slug)?.count);
  const unmentioned = sorted.filter((p) => !mentionCounts.get(p.slug)?.count);
  // Same progressive-reveal convention as the river (see RIVER_INITIAL) —
  // rows past the initial batch are marked, not omitted, so the noscript
  // fallback and a JS-driven "show more" both work off the same markup.
  const mentionedCollapsed = mentioned.length > ROSTER_INITIAL;
  const mentionedCards = mentioned
    .map((p, i) => rosterCard(p, mentionCounts.get(p.slug), { extra: i >= ROSTER_INITIAL }))
    .join('\n');
  const unmentionedCards = unmentioned.map((p) => rosterCard(p, null, { showMentionBadge: false })).join('\n');
  const nextRosterBatch = Math.min(ROSTER_BATCH, mentioned.length - ROSTER_INITIAL);
  const rosterMoreButton = mentionedCollapsed
    ? `
    <button class="roster-more" type="button" data-batch="${ROSTER_BATCH}">
      <span class="roster-more-label">Show ${nextRosterBatch} more</span>
      <svg class="river-more-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
    </button>`
    : '';
  const description = "The full Commanders roster, ranked by who this site's own coverage is actually talking about right now.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roster — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Roster — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
<noscript><style>
  /* Same reasoning as the river's own noscript override — every row is
     already in the HTML, so with no JS to expand it the list must not stay
     collapsed. */
  .roster-list.is-collapsed .roster-row-extra{ display: flex; }
  .roster-list.is-collapsed + .roster-more{ display: none; }
</style></noscript>
</head>
<body>

<div class="hero">
${header('roster.html', hasWeekly, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div class="roster-page">
    <h1 class="podcasts-heading">Roster</h1>
    ${rosterSubTabs('roster')}
    <p class="page-intro page-intro-wide">Every player on the roster, ranked by who's actually showing up in this site's own Commanders coverage — not just an alphabetical list you could get anywhere.</p>
    ${
      rosterPlayers.length
        ? `<div class="roster-list${mentionedCollapsed ? ' is-collapsed' : ''}">${mentionedCards}
    </div>
    ${rosterMoreButton}
    ${
      unmentioned.length
        ? `<details class="roster-quiet-section">
      <summary>Rest of the roster — no recent mentions (${unmentioned.length})</summary>
      <div class="roster-list">${unmentionedCards}
      </div>
    </details>`
        : ''
    }`
        : `<p class="page-intro">Roster data hasn't loaded yet — check back after the next build.</p>`
    }
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

const DEPTH_CHART_SECTIONS = ['Offense', 'Defense', 'Special Teams'];
const DEPTH_CHART_TIER_LABELS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];

/**
 * A section commanders.com hasn't populated yet (their whole Defense table
 * was empty when this shipped, mid-preseason) renders as "not yet released"
 * rather than an empty table — the cache only ever stores sections that had
 * at least one real name in them (see depthchart.js), so an absent section
 * here means the source itself has nothing yet, not a scrape failure.
 */
function depthChartTable(section) {
  if (!section?.rows?.length) {
    return '<p class="page-intro">Not yet released.</p>';
  }
  const maxTiers = Math.min(6, Math.max(...section.rows.map((r) => r.tiers.length)));
  const headerCells = DEPTH_CHART_TIER_LABELS.slice(0, maxTiers)
    .map((l) => `<th>${l}</th>`)
    .join('');
  const rows = section.rows
    .map((r) => {
      const cells = Array.from({ length: maxTiers }, (_, i) => r.tiers[i] || null);
      const tds = cells
        .map(
          (t) =>
            `<td>${
              t
                ? `<a href="https://www.commanders.com/team/players-roster/${escapeHtml(t.slug)}/" target="_blank" rel="noopener noreferrer">${escapeHtml(t.name)}</a>`
                : ''
            }</td>`,
        )
        .join('');
      return `<tr><td class="depth-chart-position">${escapeHtml(r.position)}</td>${tds}</tr>`;
    })
    .join('\n');
  return `<div class="depth-chart-scroll">
      <table class="depth-chart-table">
        <thead><tr><th>Position</th>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderDepthChartPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false, depthChart = [] }) {
  const byName = new Map(depthChart.map((s) => [s.section, s]));
  const description = "The Commanders' current depth chart by position, straight from the team's own site.";
  const sections = DEPTH_CHART_SECTIONS.map(
    (name) => `
    <section class="how-section">
      <h2>${escapeHtml(name)}</h2>
      ${depthChartTable(byName.get(name))}
    </section>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Depth Chart — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Depth Chart — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('depth-chart.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="roster-page">
    <h1 class="podcasts-heading">Depth Chart</h1>
    ${rosterSubTabs('depth-chart')}
    <p class="page-intro page-intro-wide">${escapeHtml(description)}</p>
    ${sections}
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * Out/IR share the same "not playing" severity, Doubtful sits alone in the
 * middle, and Questionable/PUP/NFI are all "could go either way" — three
 * visual tiers, not five, since a reader scanning this wants "how worried
 * should I be", not to memorize which of five words means what.
 */
const INJURY_STATUS_CLASS = {
  Out: 'injury-status-out',
  IR: 'injury-status-out',
  Doubtful: 'injury-status-doubtful',
  Questionable: 'injury-status-questionable',
  PUP: 'injury-status-questionable',
  NFI: 'injury-status-questionable',
};

function injuryReportTable(entries) {
  if (!entries.length) {
    return '<p class="page-intro">No players currently listed with an injury.</p>';
  }
  const rows = entries
    .map((e) => {
      const statusClass = INJURY_STATUS_CLASS[e.status] || 'injury-status-questionable';
      // Each piece escaped individually, then joined with a raw entity —
      // escaping the already-joined string would turn "&middot;" itself
      // into literal "&amp;middot;" text instead of a rendered dot.
      const detail = [e.bodyPart, e.notes].filter(Boolean).map(escapeHtml).join(' &middot; ');
      return `<tr>
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.position || '')}</td>
        <td><span class="injury-status ${statusClass}">${escapeHtml(e.status)}</span></td>
        <td>${detail || '&mdash;'}</td>
      </tr>`;
    })
    .join('\n');
  return `<div class="depth-chart-scroll">
      <table class="depth-chart-table injury-table">
        <thead><tr><th>Player</th><th>Pos</th><th>Status</th><th>Injury</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderInjuryReportPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false, injuries = [] }) {
  const description = "Who's currently hurt on the Commanders, and how serious it looks.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Injury Tracker — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Injury Tracker — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('injury-report.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="roster-page">
    <h1 class="podcasts-heading">Injury Tracker</h1>
    ${rosterSubTabs('injury-report')}
    <p class="page-intro page-intro-wide">${escapeHtml(description)} Pulled from a third-party read on the same injury designations teams report, not commanders.com's own report directly.</p>
    ${injuryReportTable(injuries)}
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderPodcastsPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  const rail = sidebar(videos, games, betting, teamStats);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Podcasts — ${escapeHtml(siteName)}</title>
<meta name="description" content="Commanders podcasts worth your time, embedded to stream right from ${escapeHtml(siteName)}.">
${socialMetaTags({ title: `Podcasts — ${siteName}`, description: `Commanders podcasts worth your time, embedded to stream right from ${siteName}.`, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('podcasts.html', hasWeekly, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div>
    <h1 class="podcasts-heading">Podcasts</h1>
    <p class="page-intro">A few Commanders shows worth following, streaming right here.</p>
    <div class="podcast-page-list">${podcastEmbeds()}
    </div>
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * Phone-only landing spot for the video rail — see the "Videos" nav link in
 * header() and .page-river .widget-videos in site.css. On a wider screen the
 * rail is already visible beside the river/blog/podcasts/roster content, so
 * this page is never linked to there; it still renders and works if visited
 * directly, same as any other page.
 */
export function renderVideosPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, teamStats = null, isGameLive = false }) {
  const widget = videoWidget(videos);
  const description = `Recent Washington Commanders videos, played right from ${siteName} through YouTube's own embedded player.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Videos — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Videos — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('videos.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="videos-page">
    <h1 class="podcasts-heading">Videos</h1>
    <p class="page-intro">The same clips from the video rail, on their own page.</p>
    ${widget || '<p class="river-empty">No videos yet — check back after the next build.</p>'}
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * Five AI-generated hype songs, two fake artists, one shared cover. Each
 * track gets its own plain <audio> element rather than one custom player
 * with JS-driven track switching, same zero-JS reasoning as the rest of
 * the site, and it means a reader can genuinely play more than one at once
 * if they're unwell enough to want that.
 */
const HYPE_TRACKS = [
  { title: 'Burgundy & Gold', artist: 'Turn Up Syndicate', file: 'music/hype-01-burgundy-gold.mp3' },
  { title: 'Beltway Anthem', artist: 'MACH-6', file: 'music/hype-02-beltway-anthem.mp3' },
  { title: 'Tunnel Walk', artist: 'Turn Up Syndicate', file: 'music/hype-03-tunnel-walk.mp3' },
  { title: 'Warpath Cadence', artist: 'MACH-6', file: 'music/hype-04-warpath-cadence.mp3' },
  { title: 'One City', artist: 'Turn Up Syndicate x MACH-6', file: 'music/hype-05-one-city.mp3' },
];

function musicTrack(track, index) {
  const number = String(index + 1).padStart(2, '0');
  return `<div class="music-track">
      <div class="music-track-info">
        <span class="music-track-number">${number}</span>
        <div>
          <p class="music-track-title">${escapeHtml(track.title)}</p>
          <p class="music-track-artist">${escapeHtml(track.artist)}</p>
        </div>
      </div>
      <audio class="music-track-player" controls preload="none" src="${escapeHtml(track.file)}"></audio>
    </div>`;
}

export function renderMusicPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false }) {
  const description = `Five AI-generated Commanders hype songs. Corny or not, you be the judge.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Music — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('music.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="music-page">
    <h1 class="podcasts-heading">Music</h1>
    <p class="page-intro">A depth chart and a paywall pill weren't enough robot content for one week, so an AI music generator also got a crack at five different Commanders hype songs, credited to two artists that do not exist. Nobody asked for this. Corny or not, you be the judge.</p>
    <div class="music-hero">
      <img class="music-album-art" src="music/hype-album-art.png" alt="Commanders Hype Songs cover art" loading="lazy" />
    </div>
    <div class="music-tracklist">
      ${HYPE_TRACKS.map(musicTrack).join('\n')}
    </div>
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * Netlify Forms, not a custom backend — `data-netlify="true"` on a plain
 * HTML form is enough for Netlify's own build step to wire up submission
 * handling and spam filtering (the honeypot field below) with zero server
 * code here. Where a submission actually lands (which inbox, forwarded to
 * where) is configured once in the Netlify dashboard, not in this markup —
 * this page never mentions or exposes the address it actually reaches.
 */
export function renderContactPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false }) {
  const description = `Get in touch with ${siteName}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Contact — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('contact.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="contact-page">
    <h1 class="podcasts-heading">Contact</h1>
    <p class="page-intro">Found a bug, have a tip, or just want to yell about the offensive line? Send it here.</p>

    <form name="contact" method="POST" action="/contact.html" data-netlify="true" netlify-honeypot="bot-field" class="contact-form">
      <input type="hidden" name="form-name" value="contact" />
      <p class="contact-honeypot">
        <label>Leave this field blank<input name="bot-field" /></label>
      </p>
      <label class="contact-field">
        <span>Name</span>
        <input class="contact-input" type="text" name="name" autocomplete="name" />
      </label>
      <label class="contact-field">
        <span>Email</span>
        <input class="contact-input" type="email" name="email" autocomplete="email" />
      </label>
      <label class="contact-field">
        <span>Message</span>
        <textarea class="contact-input contact-textarea" name="message" rows="6" required></textarea>
      </label>
      <button class="contact-submit" type="submit">Send</button>
    </form>
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderDonatePage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false }) {
  const description = `${siteName} is a free, ad-free fan project. Chip in toward hosting if you'd like.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Donate — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Donate — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('donate.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="contact-page">
    <h1 class="podcasts-heading">Keep It Ad-Free</h1>
    <p class="page-intro">This is a one-fan passion project, not a startup. There's no ad network, no investors, no growth targets, and no plans to ever change that. A banner ad for car insurance has no business interrupting a story about the offensive line.</p>
    <p class="page-intro">That said, hosting, domains, and API bills don't run on vibes, and "exposure" isn't a currency any hosting provider accepts. If this site has saved you from opening eleven tabs every morning, chipping in a few bucks toward the monthly bill would mean a lot. Genuinely, hail yes, thank you. No subscriptions, no tiers, no secret Discord. Just a fellow Commanders fan trying to keep the lights on without ever making you sit through a pop-up.</p>
    <div class="donate-venmo">
      <a class="donate-venmo-button" href="https://venmo.com/u/TheBurgundyWire" target="_blank" rel="noopener noreferrer">Venmo: @TheBurgundyWire</a>
    </div>
    <p class="page-intro donate-footnote">Every dollar goes straight to hosting. None of it goes toward therapy for whatever the offensive line does to me personally each Sunday. That one's on me.</p>
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

/**
 * The only page on the site with real client-side logic — everything else
 * works with JavaScript off. That's a deliberate exception here, not a
 * drift from the rest of the site: this page is a thin client over the
 * password-gated Functions in netlify/functions/ (admin-login, admin-stats,
 * admin-drafts), which are where the actual access control lives. The HTML
 * shipped here is public and harmless on its own — a login form and some
 * empty containers — since nothing behind the password is readable without
 * a valid session cookie the login Function issues. Kept out of site.js
 * entirely so that file stays true to its own "only JS on the site" claim
 * for every reader-facing page.
 */
export function renderAdminPage({ siteName, siteUrl, sources, generatedAt }) {
  const description = `${siteName} admin.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — ${escapeHtml(siteName)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Admin — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
</head>
<body>

<div class="hero">
${header('admin.html', false, false)}
</div>

<main class="layout layout-wide">
  <div class="admin-page">
    <h1 class="podcasts-heading">Admin</h1>

    <form id="admin-login-form" class="contact-form">
      <label class="contact-field">
        <span>Password</span>
        <input class="contact-input" type="password" name="password" autocomplete="current-password" required />
      </label>
      <button class="contact-submit" type="submit">Log in</button>
      <p id="admin-login-error" class="admin-error" hidden>Wrong password.</p>
    </form>

    <div id="admin-dashboard" hidden>
      <section class="admin-section">
        <div class="admin-section-head">
          <h2>Traffic</h2>
          <button id="admin-logout" class="roster-more" type="button">Log out</button>
        </div>
        <div id="admin-stats"><p class="page-intro">Loading…</p></div>
        <div id="admin-referrers"></div>
        <div id="admin-outbound"></div>
      </section>

      <section class="admin-section">
        <h2>Blog drafts</h2>
        <div id="admin-drafts"><p class="page-intro">Loading…</p></div>
      </section>
    </div>
  </div>
</main>

${footer(sources, generatedAt)}

<script>
(function () {
  'use strict';
  var form = document.getElementById('admin-login-form');
  var error = document.getElementById('admin-login-error');
  var dashboard = document.getElementById('admin-dashboard');
  var statsEl = document.getElementById('admin-stats');
  var referrersEl = document.getElementById('admin-referrers');
  var outboundEl = document.getElementById('admin-outbound');
  var draftsEl = document.getElementById('admin-drafts');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showDashboard() {
    form.hidden = true;
    dashboard.hidden = false;
    loadStats();
    loadDrafts();
  }

  // Shared by the three "top N" lists below — same <li>label <strong>count</strong>
  // markup as the original path list, just parameterized on which field holds
  // the label.
  function rankedList(rows, labelKey) {
    if (!rows.length) return '<li>No data yet.</li>';
    return rows.map(function (r) {
      return '<li>' + esc(r[labelKey]) + ' <strong>' + r.count + '</strong></li>';
    }).join('');
  }

  function loadStats() {
    fetch('/.netlify/functions/admin-stats', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        var maxDay = Math.max(1, data.days.reduce(function (m, d) { return Math.max(m, d.count); }, 0));
        var bars = data.days.map(function (d) {
          var pct = Math.round((d.count / maxDay) * 100);
          // Uniques ride along in the tooltip rather than as a second bar —
          // a two-series chart needs a legend and twice the width to stay
          // readable, and "how many of today's views were the same handful
          // of readers reloading" is a hover-away detail, not a headline one.
          var title = esc(d.date) + ': ' + d.count + ' view' + (d.count === 1 ? '' : 's') +
            ', ' + d.uniques + ' unique';
          return '<div class="admin-bar" title="' + title + '"><div class="admin-bar-fill" style="height:' + pct + '%"></div></div>';
        }).join('');
        statsEl.innerHTML =
          '<p class="admin-total"><strong>' + data.total + '</strong> total pageviews</p>' +
          '<div class="admin-bars">' + bars + '</div>' +
          '<h3>Most viewed pages</h3>' +
          '<ul class="admin-path-list">' + rankedList(data.topPaths, 'path') + '</ul>';

        referrersEl.innerHTML =
          '<h3>Traffic sources</h3>' +
          '<ul class="admin-path-list">' + rankedList(data.topReferrers, 'referrer') + '</ul>';

        outboundEl.innerHTML =
          '<h3>Outbound clicks</h3>' +
          '<p class="admin-total"><strong>' + data.outboundTotal + '</strong> clicks through to a source</p>' +
          '<ul class="admin-path-list">' + rankedList(data.topOutbound, 'sourceName') + '</ul>';
      })
      .catch(function () {
        statsEl.innerHTML = '<p class="page-intro">Could not load traffic stats.</p>';
      });
  }

  function loadDrafts() {
    fetch('/.netlify/functions/admin-drafts', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        if (!data.records.length) {
          draftsEl.innerHTML = '<p class="page-intro">No drafts yet.</p>';
          return;
        }
        draftsEl.innerHTML = data.records.map(function (r) {
          var typeLabel = r.type === 'preview' ? 'Preview' : 'Weekly';
          return (
            '<div class="admin-draft">' +
              '<div class="admin-draft-head">' +
                '<strong>' + esc(typeLabel) + ' &middot; ' + esc(r.key) + '</strong>' +
                '<span class="admin-draft-status admin-draft-status--' + esc(r.status) + '">' + esc(r.status) + '</span>' +
              '</div>' +
              '<p class="admin-draft-headline">' + esc(r.headline || '(no headline)') + '</p>' +
              (r.status === 'draft'
                ? '<button class="roster-more admin-approve" type="button" data-key="' + esc(r.key) + '" data-type="' + esc(r.type) + '">Approve &amp; publish</button>'
                : '') +
            '</div>'
          );
        }).join('');
      })
      .catch(function () { draftsEl.innerHTML = '<p class="page-intro">Could not load drafts.</p>'; });
  }

  draftsEl && draftsEl.addEventListener('click', function (event) {
    var btn = event.target.closest('.admin-approve');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    fetch('/.netlify/functions/admin-approve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: btn.getAttribute('data-key'), type: btn.getAttribute('data-type') }),
    })
      .then(function (r) { if (!r.ok) throw new Error(); loadDrafts(); })
      .catch(function () { btn.disabled = false; btn.textContent = 'Not available yet'; });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    error.hidden = true;
    fetch('/.netlify/functions/admin-login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: form.password.value }),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok && data.ok }; }); })
      .then(function (result) { if (result.ok) { showDashboard(); } else { error.hidden = false; } })
      .catch(function () { error.hidden = false; });
  });

  document.getElementById('admin-logout').addEventListener('click', function () {
    fetch('/.netlify/functions/admin-logout', { method: 'POST', credentials: 'same-origin' }).then(function () {
      dashboard.hidden = true;
      form.hidden = false;
      form.reset();
    });
  });
})();
</script>
</body>
</html>`;
}

/**
 * The main ticker mixes every watched account into one scrolling strip,
 * which was the most-requested gap in the first round of real feedback: a
 * reader who wants to catch up on one specific beat reporter has to wait
 * for their posts to scroll past, mixed in with everyone else's. This page
 * is the fix — one column per beat reporter (not the national insiders,
 * who only show up when a post is actually about the Commanders, and not
 * the team's own account, which is already covered everywhere else on the
 * site), each showing that reporter's own posts on their own.
 */
function beatPost(post, extra) {
  const when = post.publishedAt ? relativeLabel(post.publishedAt) : '';
  return `
      <li class="beat-post${extra ? ' beat-post-extra' : ''}">
        <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
          <span class="beat-post-text">${escapeHtml(post.text)}</span>
          ${when ? `<span class="beat-post-time">${escapeHtml(when)}</span>` : ''}
        </a>
      </li>`;
}

function beatColumn(account, posts) {
  const collapsed = posts.length > BEAT_INITIAL;
  const items = posts.map((p, i) => beatPost(p, i >= BEAT_INITIAL)).join('');
  const nextBatch = Math.min(BEAT_BATCH, posts.length - BEAT_INITIAL);
  const moreButton = collapsed
    ? `
      <button class="beat-more" type="button" data-batch="${BEAT_BATCH}">
        <span class="beat-more-label">Show ${nextBatch} more</span>
        <svg class="river-more-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
      </button>`
    : '';

  const avatar = account.avatar
    ? `<img class="beat-avatar" src="${escapeHtml(account.avatar)}" alt="" width="56" height="56" loading="lazy" />`
    : `<span class="beat-avatar beat-avatar-placeholder" aria-hidden="true">${escapeHtml(account.name.charAt(0))}</span>`;

  return `
    <section class="beat-column">
      <div class="beat-column-head">
        ${avatar}
        <div>
          <h2 class="beat-column-heading">${escapeHtml(account.name)} <span class="beat-column-source">${escapeHtml(account.label)}</span></h2>
          ${account.bio ? `<p class="beat-bio">${escapeHtml(account.bio)}</p>` : ''}
        </div>
      </div>
      ${
        posts.length
          ? `<ul class="beat-list${collapsed ? ' is-collapsed' : ''}">${items}
      </ul>
      ${moreButton}`
          : '<p class="page-intro">No recent posts.</p>'
      }
    </section>`;
}

export function renderBeatWritersPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false, socialPosts = [] }) {
  const accounts = SOCIAL_ACCOUNTS.filter((a) => a.alwaysRelevant && a.handle !== 'Commanders');
  const columns = accounts
    .map((account) => beatColumn(account, socialPosts.filter((p) => p.handle === account.handle)))
    .join('\n');
  const description = 'Every Commanders beat reporter\'s own posts, one column each, without wading through everyone else\'s to find them.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beat Writers — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Beat Writers — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
<noscript><style>
  /* Same reasoning as the river's own noscript override — every post is
     already in the HTML, so with no JS to expand it the list must not stay
     collapsed. */
  .beat-list.is-collapsed .beat-post-extra{ display: list-item; }
  .beat-list.is-collapsed + .beat-more{ display: none; }
</style></noscript>
</head>
<body>

<div class="hero">
${header('beat-writers.html', hasWeekly, isGameLive)}
</div>

<main class="layout layout-wide">
  <div class="beat-writers-page">
    <h1 class="podcasts-heading">Beat Writers</h1>
    <p class="page-intro page-intro-wide">Every Commanders beat reporter's own feed, one column each — the same reporters in the ticker up top, without waiting for their posts to scroll past. Updates on the same schedule as the ticker, every two hours.</p>
    <div class="beat-grid">${columns}
    </div>
  </div>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

const SOCIAL_ACCOUNTS_BY_HANDLE = new Map(SOCIAL_ACCOUNTS.map((a) => [a.handle, a]));

/**
 * Requested directly by a reader on social media: one page with nothing
 * but the ticker's own posts, chronological, no headlines mixed in. Reuses
 * the ticker's own post data and the Beat Writers page's avatar lookup, but
 * as one merged list instead of per-reporter columns or a scrolling strip.
 */
function socialFeedPost(post, extra) {
  const account = SOCIAL_ACCOUNTS_BY_HANDLE.get(post.handle);
  const when = post.publishedAt ? relativeLabel(post.publishedAt) : '';
  const avatar = account?.avatar
    ? `<img class="social-feed-avatar" src="${escapeHtml(account.avatar)}" alt="" width="44" height="44" loading="lazy" />`
    : `<span class="social-feed-avatar social-feed-avatar-placeholder" aria-hidden="true">${escapeHtml(post.handle.charAt(0))}</span>`;
  return `
      <li class="social-feed-post${extra ? ' social-feed-post-extra' : ''}">
        ${avatar}
        <a class="social-feed-body" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
          <span class="social-feed-head">
            <span class="social-feed-handle">@${escapeHtml(post.handle)}</span>
            ${when ? `<span class="social-feed-time">${escapeHtml(when)}</span>` : ''}
          </span>
          <span class="social-feed-text">${escapeHtml(post.text)}</span>
        </a>
      </li>`;
}

export function renderSocialFeedPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, isGameLive = false, socialPosts = [], videos = [], games = [], betting = null, teamStats = null }) {
  const rail = sidebar(videos, games, betting, teamStats);
  const collapsed = socialPosts.length > SOCIAL_FEED_INITIAL;
  const items = socialPosts.map((p, i) => socialFeedPost(p, i >= SOCIAL_FEED_INITIAL)).join('');
  const nextBatch = Math.min(SOCIAL_FEED_BATCH, socialPosts.length - SOCIAL_FEED_INITIAL);
  const moreButton = collapsed
    ? `
      <button class="social-feed-more" type="button" data-batch="${SOCIAL_FEED_BATCH}">
        <span>Show ${nextBatch} more</span>
        <svg class="river-more-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
      </button>`
    : '';
  const description = 'Every post from the ticker, one merged chronological feed instead of a scrolling strip.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Social Feed — ${escapeHtml(siteName)}</title>
<meta name="description" content="${escapeHtml(description)}">
${socialMetaTags({ title: `Social Feed — ${siteName}`, description, siteUrl })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
<noscript><style>
  .social-feed-list.is-collapsed .social-feed-post-extra{ display: flex; }
  .social-feed-list.is-collapsed + .social-feed-more{ display: none; }
</style></noscript>
</head>
<body>

<div class="hero">
${header('social-feed.html', hasWeekly, isGameLive)}
</div>

<main class="layout${rail ? '' : ' layout-wide'}">
  <div class="social-feed-page">
    <div class="river-heading-group">
      <h1 class="podcasts-heading">Social Feed</h1>
      <span class="river-heading-sep" aria-hidden="true">|</span>
      <a class="river-heading-link" href="index.html">Latest Headlines</a>
    </div>
    <p class="page-intro page-intro-wide">Every post from the ticker up top, merged into one list, newest first. No headlines, just the reporters. Updates on the same schedule as the ticker, every two hours.</p>
    <ul class="social-feed-list${collapsed ? ' is-collapsed' : ''}">${items || ''}
    </ul>
    ${!socialPosts.length ? '<p class="river-empty">No posts yet.</p>' : ''}
    ${moreButton}
  </div>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderPage(
  items,
  {
    siteName,
    siteUrl,
    sources,
    generatedAt,
    activeFile = 'index.html',
    heading = 'Latest headlines',
    socialPosts = [],
    videos = [],
    games = [],
    betting = null,
    teamStats = null,
    hasWeekly = false,
    isGameLive = false,
    rosterIndex = null,
  },
) {
  // Not items.map(itemCard) — Array.map's third argument is the array
  // itself, and itemCard's third parameter is rosterIndex, not that array.
  const cards = items.map((item, i) => itemCard(item, i, rosterIndex)).join('\n');
  const rail = sidebar(videos, games, betting, teamStats);

  // Only collapse when there is actually something to hide — the National
  // Coverage page can be shorter than the initial batch on a quiet week.
  const collapsed = items.length > RIVER_INITIAL;
  const nextBatch = Math.min(RIVER_BATCH, items.length - RIVER_INITIAL);
  const moreButton = collapsed
    ? `
    <button class="river-more" type="button" data-batch="${RIVER_BATCH}">
      <span class="river-more-label">Show ${nextBatch} more</span>
      <svg class="river-more-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
    </button>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(siteName)} — Washington Commanders News</title>
<meta name="description" content="The Burgundy Wire aggregates every Washington Commanders headline in one place, updated around the clock. Built by one fan who's been unreasonably invested since a wood-paneled basement in 1991.">
${socialMetaTags({ title: `${siteName} — Washington Commanders News`, description: "The Burgundy Wire aggregates every Washington Commanders headline in one place, updated around the clock. Built by one fan who's been unreasonably invested since a wood-paneled basement in 1991.", siteUrl })}
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteName)}" href="feed.xml" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#5A1414">
<noscript><style>
  /* Every headline is already in the HTML, so with no JavaScript to expand it
     the river must not stay collapsed — show all of it and drop the button that
     would otherwise do nothing. Must come after site.css to win the cascade. */
  .river.is-collapsed .card-extra{ display: flex; }
  .river.is-collapsed .river-more{ display: none; }
</style></noscript>
</head>
<body>

<div class="hero">
${header(activeFile, hasWeekly, isGameLive)}

${ticker(socialPosts)}
</div>

<main class="layout page-river${rail ? '' : ' layout-wide'}">
  <section class="river${collapsed ? ' is-collapsed' : ''}" aria-label="Commanders news headlines">
    <div class="river-heading-row">
      <div class="river-heading-group">
        <h2 class="river-heading">${escapeHtml(heading)}</h2>
        <span class="river-heading-sep" aria-hidden="true">|</span>
        <a class="river-heading-link" href="social-feed.html">Social Feed</a>
      </div>
      <div class="river-updated"><span class="dot" aria-hidden="true"></span><strong>Last updated:</strong> ${escapeHtml(formatDateTime(generatedAt))}</div>
    </div>
${cards || '<p class="river-empty">No items yet — run `npm run collect` first.</p>'}${moreButton}
  </section>

  ${rail}
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderRss(items, { siteName, siteUrl, generatedAt }) {
  const entries = items
    .map(
      (item) => `
  <item>
    <title>${escapeHtml(item.title)}</title>
    <link>${escapeHtml(item.url)}</link>
    <guid isPermaLink="false">${escapeHtml(item.id)}</guid>
    <pubDate>${rfc822(item.publishedAt || item.collectedAt)}</pubDate>
    <source>${escapeHtml(item.sourceName)}</source>
    ${item.excerpt ? `<description>${escapeHtml(item.excerpt)}</description>` : ''}
  </item>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(siteName)}</title>
  <link>${escapeHtml(siteUrl)}</link>
  <description>Every Washington Commanders headline, one feed.</description>
  <lastBuildDate>${rfc822(generatedAt)}</lastBuildDate>
  ${entries}
</channel>
</rss>`;
}

/**
 * `entries` is every real page build.js just wrote to dist/, static pages
 * and per-post pages alike — not the same list as PAGES, which is only the
 * three river filters. `lastmod` is optional per entry (a genuinely static
 * page like Contact has no meaningful "last modified") — Google treats a
 * missing lastmod as "unknown", never as an error.
 */
export function renderSitemap(entries, { siteUrl }) {
  const urls = entries
    .map(
      (e) => `
  <url>
    <loc>${escapeHtml(`${siteUrl}/${e.path}`)}</loc>
    ${e.lastmod ? `<lastmod>${escapeHtml(e.lastmod.slice(0, 10))}</lastmod>` : ''}
  </url>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

export { PAGES };
