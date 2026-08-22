import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from './http.js';
import { log } from './log.js';
import { DATA_DIR } from './store.js';

/**
 * ESPN's own scoreboard API — the same undocumented, public, key-free
 * endpoint that powers espn.com's own scoreboard widget — carries a real
 * betting line (spread, total, moneyline) per game, sourced from DraftKings.
 * No dedicated odds API (e.g. The Odds API) is used because those require a
 * registered key; this endpoint needs none, verified 2026-08-21.
 *
 * Deliberately just the next game's line, not a full-season odds table —
 * lines move constantly and a stale spread from three weeks ago is worse
 * than no spread, the same reasoning MAX_SOCIAL_AGE_DAYS applies to the
 * ticker.
 */

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const CACHE_PATH = path.join(DATA_DIR, 'betting.json');
const COMMANDERS_ABBR = 'WSH';

function extractOdds(event) {
  const comp = event.competitions?.[0];
  const odds = comp?.odds?.[0];
  if (!comp || !odds) return null;

  const commanders = comp.competitors?.find((c) => c.team?.abbreviation === COMMANDERS_ABBR);
  const opponent = comp.competitors?.find((c) => c.team?.abbreviation !== COMMANDERS_ABBR);
  if (!commanders || !opponent) return null;

  const isHome = commanders.homeAway === 'home';
  const commandersOdds = isHome ? odds.homeTeamOdds : odds.awayTeamOdds;
  const moneylineSide = isHome ? odds.moneyline?.home : odds.moneyline?.away;

  return {
    opponent: opponent.team?.displayName || null,
    opponentAbbr: opponent.team?.abbreviation || null,
    isHome,
    gameDate: event.date || null,
    gameDetail: comp.status?.type?.shortDetail || null,
    provider: odds.provider?.name || null,
    spreadDetails: odds.details || null,
    isFavorite: !!commandersOdds?.favorite,
    overUnder: typeof odds.overUnder === 'number' ? odds.overUnder : null,
    moneyline: moneylineSide?.close?.odds || moneylineSide?.open?.odds || null,
    // Pulled straight from ESPN's own payload rather than hand-written, so
    // it stays accurate to whichever sportsbook is actually the provider.
    disclaimer: odds.footer?.disclaimer || null,
  };
}

/**
 * The default (undated) scoreboard call returns "the current week" per
 * ESPN's own definition of that, which in practice is whatever game hasn't
 * been played yet — exactly the "next game" this widget wants, with no date
 * math of our own to get wrong. Returns null (never throws) on a bye week,
 * offseason, or a fetch/parse failure — the widget just doesn't render.
 */
export async function fetchBettingLine() {
  const text = await fetchText(SCOREBOARD_URL, { cache: false });
  if (!text) {
    log.warn('betting: could not fetch ESPN scoreboard');
    return null;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    log.warn('betting: ESPN scoreboard response was not valid JSON — API may have changed shape');
    return null;
  }

  const event = (data.events || []).find(
    (e) =>
      e.competitions?.[0]?.status?.type?.state === 'pre' &&
      e.competitions[0].competitors?.some((c) => c.team?.abbreviation === COMMANDERS_ABBR),
  );
  if (!event) {
    log.warn('betting: no upcoming Commanders game in the current scoreboard window');
    return null;
  }

  const line = extractOdds(event);
  if (!line) log.warn('betting: found the Commanders game but no odds were attached to it yet');
  return line;
}

/** Wholesale cache, same convention as roster.js/schedule.js — always a complete, authoritative snapshot, never merged. */
export async function saveBettingCache(line) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(line, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, CACHE_PATH);
}

/** Null (never an error) if `npm run betting` hasn't been run yet, or the last run found nothing — the widget just doesn't render, same as a missing schedule/roster cache degrades elsewhere. */
export async function loadBettingCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`betting: could not read cache: ${err.message}`);
    return null;
  }
}
