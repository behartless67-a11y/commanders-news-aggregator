import { buildCorpus } from './select.js';

/**
 * Reuses buildCorpus() wholesale for the "what's been said about the team
 * lately" half of a preview, then prepends the schedule/betting facts as two
 * more numbered corpus entries in the exact same {n, kind, ...} shape —
 * rather than a separate side-channel the model has to be told to trust
 * differently. That means validate.js's citation/number/name checks apply to
 * a preview completely unchanged: a spread number or kickoff time is only
 * "real" here because it's sitting in a cited corpus entry, same as any
 * other fact.
 */
export async function buildPreviewCorpus({ game, betting, now = Date.now(), excludeSourceIds = [] }) {
  const base = await buildCorpus(now, { excludeSourceIds });

  const pinned = [];
  pinned.push({
    kind: 'article',
    sourceName: 'Commanders.com schedule',
    publishedAt: new Date(now).toISOString(),
    title: `Matchup: Commanders ${game.homeAway === 'AT' ? 'at' : 'vs.'} ${game.opponent}`,
    excerpt: `${game.homeAway === 'AT' ? 'Away' : 'Home'} game at ${game.venue || 'TBD'}.`,
  });

  if (betting) {
    pinned.push({
      kind: 'article',
      sourceName: `${betting.provider || 'Sportsbook'} odds (via ESPN)`,
      publishedAt: new Date(now).toISOString(),
      title: `Betting line: Commanders ${betting.isFavorite ? 'favored' : 'underdogs'}`,
      excerpt: [
        betting.spreadDetails,
        betting.overUnder != null ? `Over/under ${betting.overUnder}.` : null,
        betting.moneyline ? `Moneyline ${betting.moneyline}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // Renumbered together so the pinned facts and the news corpus share one
  // citation space — entry 1 is always the matchup fact, not whatever
  // buildCorpus() happened to sort first.
  const entries = [...pinned, ...base.entries.map((e) => ({ ...e, n: undefined }))].map((e, i) => ({ ...e, n: i + 1 }));
  const byIndex = new Map(entries.map((e) => [e.n, e]));

  return { ...base, entries, byIndex };
}
