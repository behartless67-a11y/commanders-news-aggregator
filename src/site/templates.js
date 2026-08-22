import { escapeHtml } from '../lib/text.js';
import { relativeLabel, formatDateTime, formatDate, parseGameTime, formatGameDateTime, rfc822 } from '../lib/dates.js';
import { linkPlayers } from '../lib/roster-links.js';

const CATEGORY_LABEL = { team: 'Team Source', league: 'National Coverage' };
const CATEGORY_BADGE_CLASS = { team: 'badge-team', league: 'badge-national' };

/**
 * Open Graph / Twitter Card tags — without these, a pasted link (Slack,
 * Teams, iMessage, etc.) shows an empty placeholder image, since those
 * clients never fall back to just grabbing any image on the page. `image`
 * needs an absolute URL, not "logo.png", since the client fetching the
 * preview has no page context to resolve a relative one against.
 */
function socialMetaTags({ title, description, siteUrl }) {
  const image = `${siteUrl}/logo.png`;
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

/**
 * `index` here is the card's position in the river (for the RIVER_INITIAL
 * cutoff) — unrelated to `rosterIndex`, the player name → profile-link
 * lookup, named differently on purpose so the two are never confused at a
 * glance. The excerpt is the only part of a card eligible for player links —
 * the headline is already one whole `<a>` to the original article, and HTML
 * can't nest a second `<a>` inside it.
 */
function itemCard(item, index, rosterIndex) {
  const badgeClass = CATEGORY_BADGE_CLASS[item.category] || 'badge-national';
  const badgeLabel = CATEGORY_LABEL[item.category] || item.category;
  const when = item.publishedAt ? relativeLabel(item.publishedAt) : '';
  const extra = index >= RIVER_INITIAL ? ' card-extra' : '';
  return `
    <article class="card${extra}">
      <div class="card-top">
        <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
        <span class="card-source">${escapeHtml(item.sourceName)}</span>
        ${when ? `<span class="card-time"><time datetime="${escapeHtml(item.publishedAt || '')}">${escapeHtml(when)}</time></span>` : ''}
      </div>
      <h3 class="card-headline"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
      ${item.excerpt ? `<p class="card-excerpt">${linkPlayers(item.excerpt, rosterIndex)}</p>` : ''}
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
  const rosterLink = `\n      <a href="roster.html" class="nav-jump"${activeFile === 'roster.html' ? ' aria-current="page"' : ''}>Roster</a>`;
  const howItWorksLink = `\n      <a href="how-it-works.html" class="nav-jump"${activeFile === 'how-it-works.html' ? ' aria-current="page"' : ''}>How It Works</a>`;
  // Phone-only: on the main river pages the video rail is dropped from the
  // sidebar at this width (see .page-river .widget-videos in site.css) so the
  // page is articles and schedule only — this is the only way to reach the
  // videos there. Wider screens still see the rail in place, so the link
  // would just be a redundant second path to the same widget.
  const videosLink = `\n      <a href="videos.html" class="nav-jump nav-mobile-only"${activeFile === 'videos.html' ? ' aria-current="page"' : ''}>Videos</a>`;

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
      <nav class="filter-tabs" aria-label="Filter headlines by source type">
        ${tabs}${weeklyTab}${scheduleLink}${videosLink}${podcastsLink}${rosterLink}${howItWorksLink}
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
  // matters looking forward, the result only matters looking back.
  const dateOrResult = game.result ? `${game.result} ${game.points || ''}`.trim() : iso ? formatGameDateTime(iso) : 'TBD';
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
            <span class="schedule-date${resultClass}">${escapeHtml(weekLabelOf(game) || '')} · ${escapeHtml(dateOrResult)}</span>
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
];

function podcastEmbeds() {
  return PODCASTS.map(
    (p) => `
      <div class="podcast-embed-block">
        <div class="podcast-embed">
          <iframe src="https://open.spotify.com/embed/show/${p.id}?utm_source=generator" title="${escapeHtml(p.name)}" width="100%" height="352" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
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

/** Returns empty string with nothing to show in either widget, and renderPage then widens the river to the full page rather than leaving a dead column. */
function sidebar(videos, games, betting = null) {
  const video = videoWidget(videos);
  const schedule = scheduleWidget(games, betting);
  if (!video && !schedule) return '';
  return `<aside class="sidebar" aria-labelledby="video-rail-heading">
${video}
${schedule}
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
  const teamNames = sources.filter((s) => s.category === 'team').map((s) => s.name).join(', ');
  const leagueNames = sources.filter((s) => s.category === 'league').map((s) => s.name).join(', ');

  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-col footer-about">
        <h3>About this page</h3>
        <p class="footer-about-full">The Burgundy Wire pulls headlines from the Commanders' official site and national outlets into one running feed. Every link goes straight to the original publisher — we host no articles ourselves.</p>
        <p class="footer-about-full">Rebuilt automatically every few hours.</p>
        <p class="footer-about-short">Commanders headlines from official and national sources, rebuilt every few hours.</p>
      </div>
      <div class="footer-col">
        <h3>Reading the badges</h3>
        <div class="legend-row">
          <span class="badge badge-team">Team Source</span>
          <span class="desc">${escapeHtml(teamNames)}</span>
        </div>
        <div class="legend-row">
          <span class="badge badge-national">National Coverage</span>
          <span class="desc">${escapeHtml(leagueNames)}</span>
        </div>
      </div>
      <div class="footer-col">
        <h3>Team Sources</h3>
        <ul class="source-list">${teamLinks}</ul>
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
      <span>Headlines link to their original publishers. The Burgundy Wire is an independent fan project, not affiliated with the Washington Commanders or the NFL.</span>
      <span>&copy; ${new Date(generatedAt).getFullYear()} The Burgundy Wire</span>
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

/** Model citation markers ("[3, 11]") are for validation, not the reading view — the consolidated source list at the end of the post carries that job instead. */
const stripInlineCites = (text) => String(text || '').replace(/\s*\[[\d,\s]+\]/g, '');

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

function finalThoughtsBlock(finalThoughts, rosterIndex) {
  if (!finalThoughts) return '';
  return `
      <div class="live-final-thoughts">
        <h3>Final Thoughts</h3>
        ${liveParagraphs(finalThoughts.body, rosterIndex)}
        <p class="live-award-tagline">Two Live Wire Awards a game: Hero for the single biggest positive impact, Goat for the single biggest negative one.</p>
        <div class="live-award-row">
${liveAwardCard('hero', finalThoughts.heroRecipient, finalThoughts.heroReason, rosterIndex)}
${liveAwardCard('goat', finalThoughts.goatRecipient, finalThoughts.goatReason, rosterIndex)}
        </div>
      </div>`;
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
    .map(
      (e) => `
      <div class="live-entry">
        <p class="live-entry-meta">${escapeHtml(e.label)} &middot; Commanders ${e.score.commanders}, ${escapeHtml(state.opponent)} ${e.score.opponent}</p>
        ${liveParagraphs(e.body, rosterIndex)}
      </div>`,
    )
    .join('\n');
  return `
    <article class="digest-post live-game-post">
      ${titleBlock}
${finalThoughtsBlock(state.finalThoughts, rosterIndex)}
${entries}
    </article>`;
}

export function renderWeeklyPost(record, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, isGameLive = false }) {
  const { digest } = record;
  const rail = sidebar(videos, games, betting);

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

export function renderWeeklyIndex(records, { siteName, siteUrl, sources, generatedAt, rosterIndex = null, videos = [], games = [], betting = null, isGameLive = false, liveGame = null }) {
  const rail = sidebar(videos, games, betting);
  const livePost = liveGamePost(liveGame, rosterIndex);
  const weeklyPosts = records.map((r) => `${digestArticleBody(r, rosterIndex, 'h2')}\n    ${digestDisclosure(r.model)}`);
  const posts = [livePost, ...weeklyPosts].filter(Boolean);
  // Same progressive-reveal convention as the river/roster, at the whole-post
  // level — a single full post can already be taller than the video widget
  // beside it, so as the Blog fills up with more of them this keeps the
  // archive from just being one long uninterrupted scroll.
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

export function renderHowItWorksPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, isGameLive = false }) {
  const rail = sidebar(videos, games, betting);
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
      <p class="digest-para">Every player, photo included, sorted by something commanders.com's own roster page won't tell you: who this site's own coverage is actually talking about this week, backed by real ESPN season stats next to each name. The other 70-ish quiet players are still in there, just filed under a button.</p>
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

export function renderRosterPage({
  siteName,
  siteUrl,
  sources,
  generatedAt,
  hasWeekly = false,
  videos = [],
  games = [],
  betting = null,
  isGameLive = false,
  rosterPlayers = [],
  mentionCounts = new Map(),
}) {
  const rail = sidebar(videos, games, betting);
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

export function renderPodcastsPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, isGameLive = false }) {
  const rail = sidebar(videos, games, betting);
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
export function renderVideosPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, isGameLive = false }) {
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
    hasWeekly = false,
    isGameLive = false,
    rosterIndex = null,
  },
) {
  // Not items.map(itemCard) — Array.map's third argument is the array
  // itself, and itemCard's third parameter is rosterIndex, not that array.
  const cards = items.map((item, i) => itemCard(item, i, rosterIndex)).join('\n');
  const rail = sidebar(videos, games, betting);

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
<meta name="description" content="Every Commanders headline, one page, updated nightly. Aggregated from team and national sources.">
${socialMetaTags({ title: `${siteName} — Washington Commanders News`, description: 'Every Commanders headline, one page, updated nightly. Aggregated from team and national sources.', siteUrl })}
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
      <h2 class="river-heading">${escapeHtml(heading)}</h2>
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

export { PAGES };
