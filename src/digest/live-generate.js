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

/**
 * Bedrock's Messages endpoint rejects `strict: true` on tool definitions
 * (see cloud-provider.js), so a "required" field in the schema isn't
 * actually enforced server-side - the model can just skip one. Cheap
 * insurance: retry once, plain, before accepting a result that's missing
 * something the render path depends on (an empty headline just falls back
 * to the plain score line, but an empty body would render a blank entry).
 */
async function generateWithRetry({ system, prompt, schema, requiredFields, label }) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callModel({ system, prompt, schema });
    const missing = requiredFields.filter((f) => !result.json[f]);
    if (!missing.length) return result;
    log.warn(`live: ${label} attempt ${attempt} missing ${missing.join(', ')}${attempt < 2 ? ', retrying' : ', keeping it anyway'}`);
    if (attempt === 2) return result;
  }
}

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

  const result = await generateWithRetry({
    system: LIVE_SYSTEM_PROMPT,
    prompt,
    schema: LIVE_SCHEMA,
    requiredFields: ['body'],
    label: 'quarter recap',
  });

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
 * Real photos, but only from posts the model already cited as a source for
 * something it wrote — never picked independently by the model itself. That
 * keeps the same grounding guarantee everything else here has: every photo
 * shown is tied to an attributed post a reader can click through to, not a
 * free-standing pick that could be off-topic or, worse, from the wrong game.
 * Capped at 3 to match the "spanning the game recap" spot this fills, not a
 * full gallery.
 */
function photosFromCites(cites, playCount, socialPosts) {
  const images = [];
  for (const n of cites) {
    if (n <= playCount) continue;
    const post = socialPosts[n - playCount - 1];
    if (!post?.images?.length) continue;
    for (const url of post.images) {
      if (images.some((img) => img.url === url)) continue;
      images.push({ url, postUrl: post.url, author: post.author || post.handle });
      if (images.length >= 3) return images;
    }
  }
  return images;
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
    const result = await generateWithRetry({
      system: FINAL_SYSTEM_PROMPT,
      prompt,
      schema: FINAL_SCHEMA,
      requiredFields: ['headline', 'body', 'heroRecipient', 'goatRecipient'],
      label: 'final thoughts',
    });

    const maxCite = game.plays.length + socialPosts.length;
    const cites = Array.isArray(result.json.cites) ? result.json.cites.filter((n) => Number.isInteger(n) && n >= 1 && n <= maxCite) : [];

    return {
      headline: result.json.headline,
      body: result.json.body,
      heroRecipient: result.json.heroRecipient,
      heroReason: result.json.heroReason,
      goatRecipient: result.json.goatRecipient,
      goatReason: result.json.goatReason,
      cites,
      images: photosFromCites(cites, game.plays.length, socialPosts),
      generatedAt: new Date().toISOString(),
      model: result.model,
    };
  } catch (err) {
    log.warn(`live: final-thoughts generation failed, leaving it off this post: ${err.message}`);
    return null;
  }
}
