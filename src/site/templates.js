import { escapeHtml } from '../lib/text.js';
import { relativeLabel, formatDateTime, rfc822 } from '../lib/dates.js';

const CATEGORY_LABEL = { team: 'Team Source', league: 'National Coverage' };

/**
 * Placeholder markup. Swap this for the real template once the Claude
 * Design pass comes back — item shape below (title/url/sourceName/
 * sourceHomepage/category/excerpt/publishedAt) is the contract to match;
 * the render function's signature can stay the same.
 */
function itemCard(item) {
  const badge = CATEGORY_LABEL[item.category] || item.category;
  const when = item.publishedAt ? relativeLabel(item.publishedAt) : '';
  return `
    <article class="card card--${item.category}">
      <span class="badge badge--${item.category}">${escapeHtml(badge)}</span>
      <h2 class="card__title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h2>
      ${item.excerpt ? `<p class="card__excerpt">${escapeHtml(item.excerpt)}</p>` : ''}
      <div class="card__meta">
        <span class="card__source">${escapeHtml(item.sourceName)}</span>
        ${when ? `<time class="card__time" datetime="${escapeHtml(item.publishedAt || '')}">${escapeHtml(when)}</time>` : ''}
      </div>
    </article>`;
}

export function renderPage(items, { siteName, siteUrl, sources, generatedAt }) {
  const cards = items.map(itemCard).join('\n');
  const sourceList = sources
    .map((s) => `<li><a href="${escapeHtml(s.homepage)}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(siteName)} — Washington Commanders news, all in one place</title>
<meta name="description" content="Every Washington Commanders headline in one river, pulled nightly from the team's own site plus national and blog coverage." />
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteName)}" href="rss.xml" />
<link rel="stylesheet" href="site.css" />
</head>
<body>
<header class="masthead">
  <h1>${escapeHtml(siteName)}</h1>
  <p class="masthead__tagline">Every Commanders headline, one page, updated nightly.</p>
  <p class="masthead__updated">Updated ${escapeHtml(formatDateTime(generatedAt))} · <a href="rss.xml">RSS</a></p>
</header>
<main class="river">
${cards || '<p class="river__empty">No items yet — run `npm run collect` first.</p>'}
</main>
<footer class="footer">
  <h2>Sources</h2>
  <ul class="footer__sources">${sourceList}</ul>
  <p class="footer__note">Headlines and excerpts link back to the original publisher. This page reproduces no full articles.</p>
</footer>
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
