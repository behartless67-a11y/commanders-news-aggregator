import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * commanders.com's own depth chart page — plain server-rendered HTML, same
 * domain and same player-roster slug format (/team/players-roster/<slug>/)
 * already used by roster.js and roster-links.js, so a depth chart entry
 * cross-references a roster player without any extra matching logic.
 *
 * Three tables (Offense, Defense, Special Teams), each row a position, each
 * of up to six columns a depth tier — most positions only fill 2-4 tiers,
 * the rest render as an empty cell on the real page and are simply omitted
 * here rather than stored as empty strings.
 */

const DEPTH_CHART_URL = 'https://www.commanders.com/team/depth-chart/';
const CACHE_PATH = path.join(DATA_DIR, 'depth-chart.json');

const TABLE_RE = /<table summary="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g;
const ROW_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const PLAYER_RE = /<a href="\/team\/players-roster\/([a-z0-9-]+)\/">([^<]+)<\/a>/;

function parseTable(section, tableHtml) {
  const rows = [];
  // First row is the header (Position/First/Second/...) — real data rows
  // all start with a plain position abbreviation, not another <th>.
  const bodyHtml = tableHtml.slice(tableHtml.indexOf('</thead>') + '</thead>'.length);
  for (const rowMatch of bodyHtml.matchAll(ROW_RE)) {
    const cells = [...rowMatch[1].matchAll(CELL_RE)].map((m) => m[1]);
    if (!cells.length) continue;
    const position = cells[0].replace(/<[^>]+>/g, '').trim();
    if (!position) continue;
    const tiers = cells
      .slice(1)
      .map((cell) => {
        const m = PLAYER_RE.exec(cell);
        return m ? { slug: m[1], name: m[2] } : null;
      })
      .filter(Boolean);
    if (tiers.length) rows.push({ position, tiers });
  }
  return { section, rows };
}

export async function fetchDepthChart() {
  const html = await fetchText(DEPTH_CHART_URL, { cache: false });
  if (!html) {
    log.warn('depth-chart: could not fetch commanders.com depth chart page');
    return [];
  }

  const sections = [];
  for (const m of html.matchAll(TABLE_RE)) {
    const section = parseTable(m[1], m[2]);
    if (section.rows.length) sections.push(section);
  }

  if (!sections.length) {
    log.warn('depth-chart: page fetched but no tables matched — commanders.com may have changed its markup');
  }
  return sections;
}

/** Wholesale cache, same convention as roster.js/schedule.js — a fresh fetch is always a complete, authoritative snapshot. */
export async function saveDepthChartCache(sections) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(sections, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadDepthChartCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`depth-chart: could not read cache: ${err.message}`);
    return [];
  }
}
