import { escapeHtml } from '../lib/text.js';
import { relativeLabel, formatDateTime, formatDate, rfc822 } from '../lib/dates.js';

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

function itemCard(item, index) {
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
      ${item.excerpt ? `<p class="card-excerpt">${escapeHtml(item.excerpt)}</p>` : ''}
    </article>`;
}

/**
 * `hasWeekly` gates the tab entirely rather than always showing it — until a
 * digest is approved, dist/weekly.html doesn't exist, and a link to a 404 is
 * worse than no link. Weekly pages pass activeFile: 'weekly.html' whether
 * they're the archive or a single post, so the tab stays highlighted for both.
 */
function header(activeFile, generatedAt, hasWeekly = false) {
  const tabs = PAGES.map(
    (p) =>
      `<a href="${p.file}"${p.file === activeFile ? ' aria-current="page"' : ''}>${escapeHtml(p.label)}</a>`,
  ).join('\n      ');
  const weeklyTab = hasWeekly
    ? `\n      <a href="weekly.html"${activeFile === 'weekly.html' ? ' aria-current="page"' : ''}>Weekly Recap</a>`
    : '';

  return `<header class="site-header" id="top">
  <div class="wrap">
    <div class="header-inner">
      <div class="brand">
        <img class="brand-logo" src="logo.png" alt="The Burgundy Wire" />
        <div class="brand-text">
          <p>Every Commanders headline, one page, updated nightly.</p>
        </div>
      </div>
      <div class="updated-line">
        <div><span class="dot" aria-hidden="true"></span><strong>Last updated:</strong> ${escapeHtml(formatDateTime(generatedAt))}</div>
      </div>
    </div>
    <nav class="filter-tabs" aria-label="Filter headlines by source type">
      ${tabs}${weeklyTab}
    </nav>
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
 * Right-hand video rail. Each card ships from the build as an ordinary link to
 * YouTube, so it works with no JavaScript at all; site.js upgrades it to an
 * inline player on click — see that file for why the players aren't embedded
 * up front. Returns empty string with no videos, and renderPage then widens the
 * river to the full page rather than leaving a dead column.
 */
function videoRail(videos) {
  const cards = videos.map(videoCard).filter(Boolean).join('\n');
  if (!cards) return '';

  return `<aside class="sidebar" aria-labelledby="video-rail-heading">
    <div class="widget widget-videos">
      <h2 id="video-rail-heading">Latest video</h2>
      <ul class="video-column">
${cards}
      </ul>
      <p class="videos-note">Uploaded by the Washington Commanders and played here through YouTube's own embedded player. <a href="https://www.youtube.com/@Commanders" target="_blank" rel="noopener noreferrer">View the channel</a></p>
    </div>
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
        <p>The Burgundy Wire pulls headlines from the Commanders' official site and national outlets into one running feed. Every link goes straight to the original publisher — we host no articles ourselves.</p>
        <p>Rebuilt automatically every night.</p>
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
  return `<p class="digest-disclosure">Written by a local AI model (${escapeHtml(model)}) from that week's headlines and reporter posts — not by a person. Every claim below links to the source it came from; nothing here is original reporting. <a href="weekly.html">All weekly recaps</a></p>`;
}

function weekLabel(record) {
  return `${formatDate(record.windowStart)} – ${formatDate(record.windowEnd)}`;
}

/** Model citation markers ("[3, 11]") are for validation, not the reading view — the consolidated source list at the end of the post carries that job instead. */
const stripInlineCites = (text) => String(text || '').replace(/\s*\[[\d,\s]+\]/g, '');

function digestThread(thread) {
  return `
      <section class="digest-thread">
        <h3>${escapeHtml(thread.title)}</h3>
        <p>${escapeHtml(stripInlineCites(thread.body))}</p>
      </section>`;
}

function digestAlsoNoted(alsoNoted) {
  if (!alsoNoted?.length) return '';
  const items = alsoNoted.map((a) => `<li>${escapeHtml(stripInlineCites(a.text))}</li>`).join('');
  return `
      <section class="digest-thread digest-also">
        <h3>Also noted</h3>
        <ul>${items}</ul>
      </section>`;
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
  (digest.alsoNoted || []).forEach((a) => add(a.cites));
  return order;
}

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
        <h3 class="digest-source-heading">Sources</h3>
        <p class="digest-source-note">This recap was written from the reporting below. Follow any link for the original story.</p>
        <ol class="digest-source-list">${items}</ol>
      </section>`;
}

export function renderWeeklyPost(record, { siteName, siteUrl, sources, generatedAt }) {
  const byIndex = new Map(record.corpus.map((e) => [e.n, e]));
  const { digest } = record;
  const threads = digest.threads.map((t) => digestThread(t)).join('\n');
  const also = digestAlsoNoted(digest.alsoNoted);
  const sourceFooter = digestSourceFooter(collectCites(digest), byIndex);

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
</head>
<body>

${header('weekly.html', generatedAt, true)}

<main class="layout layout-wide">
  <article class="digest-post">
    ${digestDisclosure(record.model)}
    <h1>${escapeHtml(digest.headline)}</h1>
    <p class="digest-week">Week of ${escapeHtml(weekLabel(record))} · generated ${escapeHtml(formatDateTime(record.generatedAt))}</p>
    <p class="digest-lede">${escapeHtml(stripInlineCites(digest.lede))}</p>
${threads}
${also}
${sourceFooter}
  </article>
</main>

${footer(sources, generatedAt)}

<a class="to-top" href="#top" aria-label="Back to top">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 8l6 6H6z"/></svg>
</a>

<script src="site.js" defer></script>
</body>
</html>`;
}

export function renderWeeklyIndex(records, { siteName, siteUrl, sources, generatedAt }) {
  const cards = records
    .map(
      (r) => `
      <a class="digest-card" href="weekly-${escapeHtml(r.week)}.html">
        <span class="digest-card-week">${escapeHtml(weekLabel(r))}</span>
        <h2>${escapeHtml(r.digest.headline)}</h2>
        <p>${escapeHtml(stripInlineCites(r.digest.lede))}</p>
      </a>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Recap — ${escapeHtml(siteName)}</title>
<meta name="description" content="AI-written weekly recaps of Washington Commanders news, generated locally and reviewed before publishing.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css" />
</head>
<body>

${header('weekly.html', generatedAt, true)}

<main class="layout layout-wide">
  <h1 class="weekly-index-heading">Weekly Recap</h1>
  ${digestDisclosure(records[0]?.model || 'a local model')}
  <div class="digest-list">
    ${cards || '<p class="river-empty">No recaps published yet.</p>'}
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
    hasWeekly = false,
  },
) {
  const cards = items.map(itemCard).join('\n');
  const rail = videoRail(videos);

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
<noscript><style>
  /* Every headline is already in the HTML, so with no JavaScript to expand it
     the river must not stay collapsed — show all of it and drop the button that
     would otherwise do nothing. Must come after site.css to win the cascade. */
  .river.is-collapsed .card-extra{ display: flex; }
  .river.is-collapsed .river-more{ display: none; }
</style></noscript>
</head>
<body>

${header(activeFile, generatedAt, hasWeekly)}

${ticker(socialPosts)}

<main class="layout${rail ? '' : ' layout-wide'}">
  <section class="river${collapsed ? ' is-collapsed' : ''}" aria-label="Commanders news headlines">
    <h2 class="river-heading">${escapeHtml(heading)}</h2>
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
