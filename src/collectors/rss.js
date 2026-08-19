import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../lib/http.js';
import { log } from '../lib/log.js';
import { cleanTitle, excerpt, itemId, canonicalizeUrl } from '../lib/text.js';
import { toIso } from '../lib/dates.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Feed values arrive as strings, objects with #text, or CDATA wrappers. */
function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if ('#text' in value) return String(value['#text']);
    if ('@_href' in value) return String(value['@_href']);
  }
  return '';
}

function linkOf(entry) {
  const direct = textOf(entry.link);
  if (direct) return direct;
  // Atom puts the URL in an attribute, sometimes across several <link> elements.
  for (const link of asArray(entry.link)) {
    if (typeof link === 'object') {
      const rel = link['@_rel'];
      if (!rel || rel === 'alternate') return String(link['@_href'] || '');
    }
  }
  return textOf(entry.guid) || textOf(entry.id) || '';
}

export async function collect(source) {
  const xml = await fetchText(source.url);
  if (!xml) {
    log.warn(`${source.id}: no response`);
    return [];
  }

  let doc;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    log.warn(`${source.id}: unparseable feed (${err.message})`);
    return [];
  }

  const channel = doc?.rss?.channel ?? doc?.feed ?? doc?.['rdf:RDF'];
  if (!channel) {
    log.warn(`${source.id}: no channel element — is this really a feed?`);
    return [];
  }

  const entries = [...asArray(channel.item), ...asArray(channel.entry)];
  const now = new Date().toISOString();
  const items = [];

  for (const entry of entries) {
    const title = cleanTitle(textOf(entry.title));
    const url = canonicalizeUrl(linkOf(entry));
    if (!title || !url) continue;

    const rawBody =
      textOf(entry['content:encoded']) ||
      textOf(entry.content) ||
      textOf(entry.description) ||
      textOf(entry.summary);

    const published =
      toIso(textOf(entry.pubDate)) ||
      toIso(textOf(entry.published)) ||
      toIso(textOf(entry.updated)) ||
      toIso(textOf(entry['dc:date']));

    items.push({
      id: itemId(source.id, url, title),
      sourceId: source.id,
      sourceName: source.name,
      sourceHomepage: source.homepage,
      category: source.category,
      url,
      title,
      excerpt: excerpt(rawBody),
      publishedAt: published,
      collectedAt: now,
    });
  }

  return items;
}
