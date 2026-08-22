import { findLiveEventId, fetchLiveGame, loadLiveGameState, saveLiveGameState } from '../lib/livegame.js';
import { loadSocial, sortedSocial } from '../lib/store.js';
import { LIVE_SYSTEM_PROMPT, LIVE_SCHEMA, buildLiveUserPrompt, FINAL_SYSTEM_PROMPT, FINAL_SCHEMA, buildFinalUserPrompt } from './live-prompt.js';
import { generate as callModel } from './cloud-provider.js';
import { log } from '../lib/log.js';

/**
 * How many of the most-recently-collected social posts ride along as
 * potential color commentary for a quarter recap. Not filtered to an exact
 * time window — the store itself is already narrow (MAX_SOCIAL_AGE_DAYS),
 * and during a live game the 15-minute ticker cadence (see gamewindow.js)
 * keeps it fresh, so "most recent N" is close enough to "posted this
 * quarter" without needing to reason about drive/quarter wall-clock time.
 */
const MAX_SOCIAL_FOR_RECAP = Number(process.env.LIVE_SOCIAL_COUNT || 15);

/** Wider pool for the once-per-game final-thoughts wrap-up, which draws on the whole game rather than one quarter. */
const MAX_SOCIAL_FOR_FINAL = Number(process.env.LIVE_FINAL_SOCIAL_COUNT || 40);

function labelFor(period, isFinal) {
  if (isFinal) return 'Final';
  if (period === 2) return 'Halftime';
  return `End of Q${period}`;
}

/**
 * The one entry point the CLI/workflow calls. Returns null (never throws
 * for "nothing to do") whenever there's no live game, or the current
 * quarter hasn't actually ended yet since the last check — both are the
 * normal, expected result most times this runs.
 */
export async function updateLiveGame() {
  const eventId = await findLiveEventId();
  if (!eventId) {
    log.info('live: no Commanders game currently in progress');
    return null;
  }

  const game = await fetchLiveGame(eventId);
  if (!game) return null;

  let state = await loadLiveGameState();
  // A different event than whatever was last tracked (a new game entirely,
  // not a continuation) starts a fresh entry list rather than appending to
  // last week's.
  if (!state || state.eventId !== eventId) {
    state = { eventId, opponent: game.opponent, lastRecappedPeriod: 0, entries: [], gameOver: false };
  }

  const currentPeriod = game.period ?? 0;
  const isFinal = game.state === 'post';
  // While `state === 'in'`, the current period is still being played, so the
  // last *complete* quarter is the one before it — only once the game itself
  // ends does the current period's own number become the thing to recap.
  const targetPeriod = isFinal ? currentPeriod : currentPeriod - 1;

  if (!targetPeriod || targetPeriod <= state.lastRecappedPeriod) {
    log.info(`live: nothing new (current period ${currentPeriod}, last recapped ${state.lastRecappedPeriod})`);
    return null;
  }

  const plays = game.plays.filter((p) => p.period === targetPeriod);
  const socialPosts = sortedSocial(await loadSocial()).slice(0, MAX_SOCIAL_FOR_RECAP);

  const prompt = buildLiveUserPrompt({
    period: targetPeriod,
    score: { commanders: game.commandersScore, opponent: game.opponentScore },
    opponent: game.opponent,
    plays,
    socialPosts,
  });

  const result = await callModel({ system: LIVE_SYSTEM_PROMPT, prompt, schema: LIVE_SCHEMA });

  // Cheap grounding check in place of the weekly digest's full validate.js —
  // proportionate to how much smaller this prompt's source surface is (a
  // numbered play/social list, not a whole week of headlines). A cite
  // outside the numbered lists is dropped rather than trusted.
  const maxCite = plays.length + socialPosts.length;
  const cites = Array.isArray(result.json.cites) ? result.json.cites.filter((n) => Number.isInteger(n) && n >= 1 && n <= maxCite) : [];

  state.entries.push({
    period: targetPeriod,
    label: labelFor(targetPeriod, isFinal),
    headline: result.json.headline,
    body: result.json.body,
    cites,
    score: { commanders: game.commandersScore, opponent: game.opponentScore },
    generatedAt: new Date().toISOString(),
    model: result.model,
  });
  state.lastRecappedPeriod = targetPeriod;
  state.gameOver = isFinal;

  // Piggybacks on the same tick that writes the last quarter's recap, since
  // that's exactly when `isFinal` first flips true — no separate check
  // needed on a later run, and every later run's targetPeriod will already
  // be <= lastRecappedPeriod and short-circuit above before reaching here.
  if (isFinal && !state.finalThoughts) {
    state.finalThoughts = await generateFinalThoughts(game);
  }

  await saveLiveGameState(state);
  log.ok(`live: wrote "${labelFor(targetPeriod, isFinal)}" recap (${game.commandersScore}-${game.opponentScore})`);
  return state;
}

/**
 * Whole-game wrap-up plus the Live Wire Award pick, generated once at
 * `gameOver`, working from every play in the game (not just one quarter)
 * and a wider social pool. Failure here degrades to no final-thoughts
 * section rather than blocking the last quarter's recap from saving — a
 * partial live blog is better than losing a good quarter recap over a
 * flaky second model call.
 */
async function generateFinalThoughts(game) {
  try {
    const socialPosts = sortedSocial(await loadSocial()).slice(0, MAX_SOCIAL_FOR_FINAL);
    const prompt = buildFinalUserPrompt({
      finalScore: { commanders: game.commandersScore, opponent: game.opponentScore },
      opponent: game.opponent,
      plays: game.plays,
      socialPosts,
    });
    const result = await callModel({ system: FINAL_SYSTEM_PROMPT, prompt, schema: FINAL_SCHEMA });

    const maxCite = game.plays.length + socialPosts.length;
    const cites = Array.isArray(result.json.cites) ? result.json.cites.filter((n) => Number.isInteger(n) && n >= 1 && n <= maxCite) : [];

    return {
      headline: result.json.headline,
      body: result.json.body,
      awardRecipient: result.json.awardRecipient,
      awardReason: result.json.awardReason,
      cites,
      generatedAt: new Date().toISOString(),
      model: result.model,
    };
  } catch (err) {
    log.warn(`live: final-thoughts generation failed, leaving it off this post: ${err.message}`);
    return null;
  }
}
