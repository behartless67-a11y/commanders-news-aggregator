import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/store.js';
import { log } from '../lib/log.js';
import { renderCorpus } from './select.js';
import { buildPreviewCorpus } from './preview-select.js';
import { PREVIEW_SYSTEM_PROMPT, PREVIEW_SCHEMA, buildPreviewUserPrompt } from './preview-prompt.js';
import { generate as callModel } from './cloud-provider.js';
import { validate } from './validate.js';
import { sanitizeDigest } from './sanitize.js';
import { loadScheduleCache } from '../lib/schedule.js';
import { loadBettingCache } from '../lib/betting.js';
import { gameToday } from '../lib/gamewindow.js';
import { parseGameTime } from '../lib/dates.js';

/**
 * Cloud (Bedrock/Claude), not local Ollama — deliberately different from the
 * weekly digest. Two reasons this is safe where the digest's own "local
 * only" policy (provider.js) still stands:
 *   1. A daily preview costs a fraction of a cent on Bedrock — nothing like
 *      the per-message cost that made a third-party API a bad fit before.
 *   2. Found 2026-08-27: the local pipeline's corpus can run 100k+
 *      characters, well past provider.js's 16k-token context cap, and
 *      Ollama truncates overflow from the front — exactly where the pinned
 *      "you're playing X" fact and instruction sentence live. All three
 *      test generations (two models) wrote about the wrong, already-played
 *      opponent as a result. Claude's context window is nowhere near that
 *      limit, so this class of bug can't recur here.
 * EXCLUDED_SOURCE_IDS still applies, same as ever: Hogs Haven and
 * ClutchPoints disallow AI crawlers by name in robots.txt (see README), and
 * that's a hard boundary regardless of which cloud model reads the corpus.
 */
const MODEL = process.env.PREVIEW_MODEL || 'anthropic.claude-sonnet-5';
const EXCLUDED_SOURCE_IDS = ['hogs-haven', 'clutchpoints'];
const MAX_ATTEMPTS = Number(process.env.PREVIEW_MAX_ATTEMPTS || 3);

export const PREVIEWS_DIR = path.join(DATA_DIR, 'previews');

const keyFor = (iso) => iso.slice(0, 10);
const fileFor = (key) => path.join(PREVIEWS_DIR, `${key}.json`);

async function writeRecord(file, record) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Generates a preview for whichever game is on the calendar today (see
 * gameToday() in gamewindow.js) — the caller doesn't pick a game, the
 * schedule does, so this can be run on a blind daily schedule and just no-op
 * on the ~360 days a year that isn't true. Keyed and written once per game
 * date, same never-silently-regenerate rule as the weekly digest.
 *
 * Runs the morning of the game, not the evening before — moved 2026-08-24 to
 * catch overnight/gameday-morning news (inactives buzz, beat-writer "what to
 * watch" pieces) that a day-before generation would always miss. Every game
 * this covers kicks off at noon ET or later except one 9:30 AM London game,
 * which gets a shorter-but-still-real review window rather than none.
 */
export async function generatePreview({ force = false, now = new Date() } = {}) {
  const games = await loadScheduleCache();
  const game = gameToday(games, now);
  if (!game) {
    log.info('preview: no game today — nothing to preview');
    return null;
  }

  const key = keyFor(parseGameTime(game.gametime) || now.toISOString());
  const file = fileFor(key);

  if (!force) {
    const existing = await loadPreview(key);
    if (existing) {
      log.info(`preview: ${key} already exists (status: ${existing.status}) — pass --force to regenerate`);
      return existing;
    }
  }

  const betting = await loadBettingCache();
  const bettingForThisGame = betting && betting.opponentAbbr === game.opponentAbbr ? betting : null;

  const corpus = await buildPreviewCorpus({
    game,
    betting: bettingForThisGame,
    now: now.getTime(),
    excludeSourceIds: EXCLUDED_SOURCE_IDS,
  });
  const corpusText = renderCorpus(corpus);
  let problems = [];
  let result;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildPreviewUserPrompt(corpusText, game.opponent, problems);
    let outcome;
    try {
      result = await callModel({ model: MODEL, system: PREVIEW_SYSTEM_PROMPT, prompt, schema: PREVIEW_SCHEMA });
      result.json = sanitizeDigest(result.json);
      outcome = validate(corpus, result.json);
    } catch (err) {
      // A malformed response (e.g. Bedrock's tool call not actually
      // matching PREVIEW_SCHEMA's shape — seen once in testing: threads
      // came back as something other than an array) is exactly the kind of
      // thing a retry with a more pointed instruction can fix, same as a
      // validation failure. Letting it escape here would abort the whole
      // run on attempt 1 with MAX_ATTEMPTS-1 retries never even tried.
      log.warn(`preview: attempt ${attempt} threw (${err.message}) — retrying`);
      problems = [`Your last response could not be parsed (${err.message}). Return valid JSON exactly matching the schema, with "threads" as an array.`];
      continue;
    }
    problems = outcome.problems;

    if (problems.length === 0) {
      const record = {
        gameKey: key,
        opponent: game.opponent,
        homeAway: game.homeAway,
        status: 'draft',
        model: MODEL,
        generatedAt: new Date().toISOString(),
        attempts: attempt,
        digest: result.json,
        corpus: corpus.entries,
        warnings: outcome.warnings,
      };
      await writeRecord(file, record);
      log.ok(`preview: wrote draft for ${key} vs ${game.opponent} (${attempt} attempt(s), ${outcome.warnings.length} warning(s))`);
      return record;
    }
    log.warn(`preview: attempt ${attempt} failed validation (${problems.length} problem(s)) — retrying`);
  }

  throw new Error(`preview: could not produce a validated draft for ${key} after ${MAX_ATTEMPTS} attempts:\n  ${problems.join('\n  ')}`);
}

export async function loadPreview(key) {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function listPreviews() {
  await fs.mkdir(PREVIEWS_DIR, { recursive: true });
  const files = (await fs.readdir(PREVIEWS_DIR)).filter((f) => f.endsWith('.json'));
  const records = await Promise.all(files.map((f) => fs.readFile(path.join(PREVIEWS_DIR, f), 'utf8').then(JSON.parse)));
  return records.sort((a, b) => b.gameKey.localeCompare(a.gameKey));
}

export async function setPreviewStatus(key, status) {
  const record = await loadPreview(key);
  if (!record) throw new Error(`no preview found for ${key}`);
  record.status = status;
  record.reviewedAt = new Date().toISOString();
  await writeRecord(fileFor(key), record);
  return record;
}
