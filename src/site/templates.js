import { escapeHtml } from '../lib/text.js';
import { relativeLabel, formatDateTime, formatDate, parseGameTime, formatGameDateTime, rfc822 } from '../lib/dates.js';
import { linkPlayers } from '../lib/roster-links.js';

const CATEGORY_LABEL = { team: 'Team Source', league: 'National Coverage' };
const CATEGORY_BADGE_CLASS = { team: 'badge-team', league: 'badge-national' };

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
  const howItWorksLink = `\n      <a href="how-it-works.html" class="nav-jump"${activeFile === 'how-it-works.html' ? ' aria-current="page"' : ''}>How It Works</a>`;

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
        ${tabs}${weeklyTab}${scheduleLink}${podcastsLink}${howItWorksLink}
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
  return game.season === 'preseason' ? `Pre ${num}` : `Week ${num}`;
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
function liveGamePost(state, rosterIndex) {
  if (!state?.entries?.length) return '';
  const badge = state.gameOver ? '' : ' <span class="live-badge" aria-label="Game in progress">Live</span>';
  const entries = [...state.entries]
    .reverse()
    .map(
      (e) => `
      <div class="live-entry">
        <p class="live-entry-meta">${escapeHtml(e.label)} &middot; Commanders ${e.score.commanders}, ${escapeHtml(state.opponent)} ${e.score.opponent}</p>
        <p class="digest-para">${linkPlayers(e.body, rosterIndex)}</p>
      </div>`,
    )
    .join('\n');
  return `
    <article class="digest-post live-game-post">
      <h2>Live: Commanders vs ${escapeHtml(state.opponent)}${badge}</h2>
${entries}
      <p class="digest-disclosure">Written by a cloud AI model (${escapeHtml(state.entries[0]?.model || '')}) from live play-by-play and social posts as the game happened, not by a person.</p>
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
  const weeklyArticles = records
    .map((r) => `${digestArticleBody(r, rosterIndex, 'h2')}\n    ${digestDisclosure(r.model)}`)
    .join('\n    <hr class="digest-divider">\n');
  const livePost = liveGamePost(liveGame, rosterIndex);
  const articles = [livePost, weeklyArticles].filter(Boolean).join('\n    <hr class="digest-divider">\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blog — ${escapeHtml(siteName)}</title>
<meta name="description" content="AI-written recaps and posts about Washington Commanders news, generated locally and reviewed before publishing.">
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
    <h1 class="weekly-index-heading">Blog</h1>
    ${articles || '<p class="river-empty">No posts published yet.</p>'}
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
    <p class="page-intro">A layman's explanation. Mostly accurate. No robots were harmed, though several were mildly scolded.</p>

    <section class="how-section">
      <h2>The headline river</h2>
      <p class="digest-para">Every few hours, a small script that has never once been outside opens up eight or so Commanders websites, reads every headline, and asks itself one question: "does this mention the Commanders." If yes, it keeps it. If it's actually about the Lions and the Commanders got mentioned in passing, it throws it out, because this script has standards. It is not a journalist. It has never broken a story in its life. It just really, really likes making lists.</p>
    </section>

    <section class="how-section">
      <h2>The ticker</h2>
      <p class="digest-para">That scrolling strip near the top is basically this site eavesdropping on beat reporters' social media, through a side door, because the front door started charging rent a while back. It refreshes every couple hours normally, and every 15 minutes during a game, so you can watch the press box lose its mind in close to real time without opening a single app.</p>
    </section>

    <section class="how-section">
      <h2>The Blog (weekly editions)</h2>
      <p class="digest-para">Once a week, an AI model that lives on this computer (not the cloud, not anyone else's business) reads everything that happened and writes a proper column about it, complete with quotes and, if it's feeling spicy, a pun. Here's the important part: it doesn't get to publish anything itself. A human reads the draft first and has to physically click "approve." This rule exists because an early test model once confidently reported that a player was on this team who has, in fact, never once put on a Commanders helmet. Robots lie sometimes. Not on purpose. They just really want the sentence to sound good.</p>
    </section>

    <section class="how-section">
      <h2>The Blog (game days, new and slightly reckless)</h2>
      <p class="digest-para">During an actual game, there's no time for a human to review anything between the 2nd and 3rd quarter, so this part runs completely unsupervised. Every 15 minutes, a different (faster, cloud-based) AI checks the score, and if a quarter just ended, it writes a quick recap using the real play-by-play plus whatever beat reporters and fans are posting live. It publishes itself. Nobody reads it first. The one leash it's on: it is not allowed to decide on its own that a catch was "amazing." It can only say that if an actual person online already said it first, with their name attached. Left to its own devices, it would apparently just say "outstanding" about everything, so this rule keeps it honest.</p>
    </section>

    <section class="how-section">
      <h2>The betting line</h2>
      <p class="digest-para">The point spread and over/under next to the schedule come straight from a real sportsbook, by way of ESPN's own public data, the same feed that powers the little widget on espn.com. Nothing here is a tip, a lock, or financial advice from a website that also aggregates blog posts about a rookie kicker.</p>
    </section>

    <section class="how-section">
      <h2>Podcasts, schedule, fantasy, etc.</h2>
      <p class="digest-para">The schedule is scraped from the team's own site. The podcasts are just real Spotify players, embedded, doing what Spotify players do. There is no fourth thing hiding here that secretly runs on a hamster wheel. Probably.</p>
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

export function renderPodcastsPage({ siteName, siteUrl, sources, generatedAt, hasWeekly = false, videos = [], games = [], betting = null, isGameLive = false }) {
  const rail = sidebar(videos, games, betting);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Podcasts — ${escapeHtml(siteName)}</title>
<meta name="description" content="Commanders podcasts worth your time, embedded to stream right from ${escapeHtml(siteName)}.">
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

<main class="layout${rail ? '' : ' layout-wide'}">
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
