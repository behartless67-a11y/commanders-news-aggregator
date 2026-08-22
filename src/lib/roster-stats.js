import { fetchText } from './http.js';

/**
 * ESPN's per-athlete career stats endpoint returns every category it has a
 * template for (a wide receiver gets back "kicking" too, all zeroes) rather
 * than just the categories that actually apply to that player — so which
 * category to read is decided here, by position, not by whatever categories
 * happen to be present in the response.
 *
 * Offensive line and long snapper are deliberately absent: blocking isn't a
 * tracked individual stat, and the one category ESPN does return for them
 * ("defensive", from an occasional special-teams tackle) is noise, not a
 * season line worth showing.
 */
const POSITION_CATEGORY = {
  QB: 'passing',
  RB: 'rushing',
  FB: 'rushing',
  WR: 'receiving',
  TE: 'receiving',
  CB: 'defensive',
  DB: 'defensive',
  S: 'defensive',
  SS: 'defensive',
  FS: 'defensive',
  DE: 'defensive',
  DT: 'defensive',
  NT: 'defensive',
  LB: 'defensive',
  ILB: 'defensive',
  OLB: 'defensive',
  EDGE: 'defensive',
  PK: 'kicking',
  K: 'kicking',
  P: 'punting',
};

/**
 * Short display fields per category, keyed by ESPN's stable `names[]`
 * entries (not the `labels[]` strings, which repeat — "defensive" has two
 * columns both literally labeled "YDS") and not raw array position, which
 * shifts if ESPN reorders a category's columns.
 */
const CATEGORY_FIELDS = {
  passing: [
    { combine: ['completions', 'passingAttempts'], join: '/', label: 'CMP/ATT' },
    { name: 'passingYards', label: 'YDS' },
    { name: 'passingTouchdowns', label: 'TD' },
    { name: 'interceptions', label: 'INT' },
  ],
  rushing: [
    { name: 'rushingAttempts', label: 'CAR' },
    { name: 'rushingYards', label: 'YDS' },
    { name: 'rushingTouchdowns', label: 'TD' },
  ],
  receiving: [
    { name: 'receptions', label: 'REC' },
    { name: 'receivingYards', label: 'YDS' },
    { name: 'receivingTouchdowns', label: 'TD' },
  ],
  defensive: [
    { name: 'totalTackles', label: 'TCKL' },
    { name: 'sacks', label: 'SACK' },
    { name: 'interceptions', label: 'INT' },
  ],
  kicking: [
    { name: 'fieldGoalsMade-fieldGoalAttempts', label: 'FG' },
    { combine: ['extraPointsMade', 'extraPointAttempts'], join: '/', label: 'XP' },
  ],
  punting: [
    { name: 'punts', label: 'PUNTS' },
    { name: 'grossAvgPuntYards', label: 'AVG' },
    { name: 'puntsInside20', label: 'IN20' },
  ],
};

const STATS_URL = (espnId) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/stats`;

function extractFields(category, latest) {
  return CATEGORY_FIELDS[category.name]
    .map((f) => {
      if (f.combine) {
        const values = f.combine.map((n) => latest.stats[category.names.indexOf(n)]);
        return values.every((v) => v != null) ? { label: f.label, value: values.join(f.join) } : null;
      }
      const idx = category.names.indexOf(f.name);
      const value = idx >= 0 ? latest.stats[idx] : null;
      return value != null ? { label: f.label, value } : null;
    })
    .filter(Boolean);
}

/**
 * One ESPN request per player. Called only from the weekly stats refresh
 * (`npm run roster-stats`, Tuesday mornings — see roster-stats.yml), never
 * from the build itself or the more frequent plain roster refresh, since a
 * season stat line has nothing new to say between Tuesdays anyway.
 *
 * Returns null for a position with no meaningful individual stat (o-line,
 * long snapper), a true rookie with no NFL season on record yet, or any
 * fetch/shape failure — the roster page just omits the stats line for that
 * player rather than showing a zeroed-out or malformed one.
 */
export async function fetchPlayerStats(espnId, positionAbbr) {
  const categoryName = POSITION_CATEGORY[positionAbbr];
  if (!categoryName || !espnId) return null;

  const text = await fetchText(STATS_URL(espnId), { cache: false });
  if (!text) return null;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  const category = (data.categories || []).find((c) => c.name === categoryName);
  const latest = category?.statistics?.[category.statistics.length - 1];
  if (!category || !latest) return null;

  const fields = extractFields(category, latest);
  if (!fields.length) return null;

  return { season: latest.season?.year ?? null, fields };
}
