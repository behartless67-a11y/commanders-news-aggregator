import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * Commanders.com's schedule page — plain static HTML, same domain as the
 * roster page and news feed. Preseason and regular season share a "WEEK N"
 * numbering scheme (each restarts at 1), so which section a game falls under
 * is tracked separately by splitting on the page's own section headers
 * rather than trusting the week label alone to disambiguate.
 */

const SCHEDULE_URL = 'https://www.commanders.com/schedule/';
const CACHE_PATH = path.join(DATA_DIR, 'schedule.json');

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#xAE;/gi, '®')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/&quot;/g, '"');
}

function pick(re, text) {
  const m = re.exec(text);
  return m ? decodeEntities(m[1].trim()) : null;
}

const SEASON_HEADER_RE = /<h2 class="d3-o-section-title"><span>\s*(PRESEASON|REGULAR SEASON)\s*<\/span><\/h2>/g;

function splitBySeason(html) {
  const sections = [];
  let season = null;
  let start = 0;
  for (const m of html.matchAll(SEASON_HEADER_RE)) {
    if (season) sections.push({ season, html: html.slice(start, m.index) });
    season = m[1] === 'PRESEASON' ? 'preseason' : 'regular';
    start = m.index;
  }
  if (season) sections.push({ season, html: html.slice(start) });
  return sections;
}

function parseGame(chunk, season) {
  const isBye = /^nfl-o-matchup-cards--bye/.test(chunk);
  const week = pick(/<strong>\s*(WEEK\s*\d+)\s*<\/strong>/i, chunk);
  if (isBye) return { season, week, isBye: true };

  const rawGametime = pick(/data-gametime="([^"]+)"/, chunk);
  // The site emits "01/01/0001 00:00:00 +00:00" for a game not yet
  // officially scheduled (common late in the season) rather than omitting
  // the attribute — treat that placeholder as "no date yet", not a real one.
  const gametime = rawGametime && !rawGametime.startsWith('01/01/0001') ? rawGametime : null;

  const homeAway =
    pick(/team-(?:prefix|game-location)"[^>]*>\s*(AT|VS)\s*</i, chunk) || pick(/<span>(AT|VS)<\/span>/, chunk);
  const opponentAbbr = pick(/clubs\/logos\/([A-Za-z]{2,3})/, chunk);
  const opponent = pick(/team-full-name">([^<]+)</, chunk);
  const opponentShort = pick(/team-short-name">([^<]+)</, chunk);
  const venue = pick(/venue--location">\s*([^<]+?)\s*</, chunk);
  const result = pick(/score--result">([^<]+)</, chunk);
  const points = pick(/score--points">([^<]+)</, chunk);

  if (!opponent || !opponentAbbr) return null;
  return { season, week, gametime, homeAway, opponentAbbr, opponent, opponentShort, venue, result, points, isBye: false };
}

export async function fetchSchedule() {
  const html = await fetchText(SCHEDULE_URL, { cache: false });
  if (!html) {
    log.warn('schedule: could not fetch commanders.com schedule page');
    return [];
  }

  const games = [];
  for (const section of splitBySeason(html)) {
    const chunks = section.html.split('<div class="nfl-o-matchup-cards ').slice(1);
    for (const chunk of chunks) {
      const game = parseGame(chunk, section.season);
      if (game) games.push(game);
    }
  }

  if (!games.length) {
    log.warn('schedule: page fetched but no games matched — commanders.com may have changed its markup');
  }
  return games;
}

/** Wholesale cache, same convention as roster.js — a fresh fetch is always a complete, authoritative snapshot. */
export async function saveScheduleCache(games) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(games, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

export async function loadScheduleCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`schedule: could not read cache: ${err.message}`);
    return [];
  }
}
