import fs from 'node:fs/promises';
import path from 'node:path';
import { isAuthorized } from './_auth.js';

/**
 * Surfaces the collector run history that data/state.json has been recording
 * all along but nothing ever displayed. The failure this exists to catch is
 * silent: when a collector stops working the site doesn't break, it just
 * quietly stops getting new items, and the only signal is noticing the river
 * looks old days later.
 *
 * Like admin-drafts.js, this reads the copy of state.json bundled at the last
 * deploy (see included_files in netlify.toml), not the live repo. That sounds
 * like a weakness and is actually the point: every pipeline run ends by
 * rebuilding and redeploying, so if the pipeline is healthy this file is
 * minutes old, and if the pipeline has stopped, no new deploy happens and the
 * timestamps here keep aging. A stale panel IS the alarm, not a caveat on it.
 */

/**
 * Staleness is measured against each stage's own observed cadence rather than
 * a hardcoded number per stage. Hardcoding meant picking constants that were
 * wrong the moment a schedule changed: the collectors here actually run every
 * 1-2 hours, so a "6 hours" guess sat right on top of normal behaviour and
 * would have cried wolf, while "24 hours" for another stage would have stayed
 * silent through most of a dead day.
 *
 * The multiplier is deliberately generous. A couple of skipped cycles (an
 * Actions queue backup, a rate limit, a flaky feed) is normal and shouldn't
 * light the panel up; a stage that has gone four times its usual gap without
 * reporting has stopped.
 *
 * Note this can only under-report, never over-report: a stage that dies stops
 * writing runs, so its historical gaps (and therefore its threshold) stay
 * frozen at whatever healthy looked like.
 */
const GAP_MULTIPLIER = 4;
const MIN_STALE_HOURS = 3;
const MAX_STALE_HOURS = 24;

/** Median gap between consecutive runs of one stage, in hours; null if <2 runs. */
function medianGapHours(times) {
  if (times.length < 2) return null;
  const sorted = [...times].sort((a, b) => b - a);
  const gaps = sorted.slice(0, -1).map((t, i) => (t - sorted[i + 1]) / 3600000).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function staleThreshold(times) {
  const median = medianGapHours(times);
  if (median == null) return MAX_STALE_HOURS;
  return Math.min(MAX_STALE_HOURS, Math.max(MIN_STALE_HOURS, median * GAP_MULTIPLIER));
}

export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  let runs = [];
  try {
    const raw = JSON.parse(await fs.readFile(path.resolve('data/state.json'), 'utf8'));
    runs = Array.isArray(raw.runs) ? raw.runs : [];
  } catch {
    // No state file bundled (a very early deploy, or the file moved) is
    // reported as "no history" rather than a 500 — the rest of the admin
    // page shouldn't lose a panel over it.
    return new Response(JSON.stringify({ stages: [], runs: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();

  // runs is newest-first, so the first entry seen for a stage is its latest.
  const latest = new Map();
  for (const run of runs) {
    if (!run?.stage || latest.has(run.stage)) continue;
    latest.set(run.stage, run);
  }

  const stages = [...latest.entries()]
    .map(([stage, run]) => {
      const at = Date.parse(run.at);
      const ageHours = Number.isNaN(at) ? null : (now - at) / 3600000;
      const times = runs
        .filter((r) => r.stage === stage)
        .map((r) => Date.parse(r.at))
        .filter((t) => !Number.isNaN(t));
      const limit = staleThreshold(times);
      return {
        stage,
        at: run.at,
        ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
        staleAfterHours: Math.round(limit * 10) / 10,
        cadenceHours: medianGapHours(times) == null ? null : Math.round(medianGapHours(times) * 10) / 10,
        stale: ageHours === null ? true : ageHours > limit,
        added: run.added ?? null,
        pruned: run.pruned ?? null,
        sources: run.sources ?? null,
        sessionExpired: run.sessionExpired === true,
        emptyPage: run.emptyPage === true,
      };
    })
    .sort((a, b) => a.stage.localeCompare(b.stage));

  // A stage that added nothing every single time it ran for a while is the
  // other silent failure mode: the job is alive, the feed behind it is not.
  // Cheap to compute here, and it's the difference between "cron is fine" and
  // "cron is fine and it's actually finding things."
  const RECENT = 10;
  for (const s of stages) {
    const recent = runs.filter((r) => r.stage === s.stage).slice(0, RECENT);
    s.recentRuns = recent.length;
    s.recentAdded = recent.reduce((n, r) => n + (Number(r.added) || 0), 0);
  }

  return new Response(
    JSON.stringify({
      stages,
      anyStale: stages.some((s) => s.stale),
      // Bundled-at-deploy age, so the panel can say how old this whole
      // picture is rather than implying it's live.
      newestRunAt: stages.reduce((newest, s) => (!newest || (s.at && s.at > newest) ? s.at : newest), null),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
