import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/store.js';
import { log } from '../lib/log.js';
import { buildCorpus, renderCorpus } from './select.js';
import { MONDAY_SYSTEM_PROMPT, MONDAY_SCHEMA, buildMondayUserPrompt } from './monday-prompt.js';
import { generate as callModel } from './cloud-provider.js';
import { sanitizeParagraphs } from './sanitize.js';
import { loadCollegeFootballCache } from '../lib/collegefootball.js';

/**
 * "A Case of the Mondays" — a weekly, deliberately funny weekend recap.
 * Bedrock/Claude (see preview-generate.js for the fuller reasoning: cheap
 * per run, and a big enough context window that the corpus-truncation bug
 * that hit the local preview pipeline can't happen here either).
 *
 * Deliberately NOT using validate.js's citation checking — this format has
 * no per-sentence cites (see monday-prompt.js), so there's nothing for that
 * checker to resolve. checkDraft() below is the much lighter shape check
 * this format actually needs.
 */
const MODEL = process.env.MONDAY_MODEL || 'anthropic.claude-sonnet-5';
const EXCLUDED_SOURCE_IDS = ['hogs-haven', 'clutchpoints'];
// The weekend, not the digest's full rolling week — Friday through Monday
// morning comfortably covers that with room to spare.
const WINDOW_DAYS = Number(process.env.MONDAY_WINDOW_DAYS || 4);
const MAX_ATTEMPTS = Number(process.env.MONDAY_MAX_ATTEMPTS || 3);

export const MONDAYS_DIR = path.join(DATA_DIR, 'mondays');

const fileFor = (key) => path.join(MONDAYS_DIR, `${key}.json`);

async function writeRecord(file, record) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

/** Shape-only — there's no citation graph to check against, just "did the model return something postable." */
function checkDraft(draft) {
  const problems = [];
  if (!draft?.title || typeof draft.title !== 'string') problems.push('"title" is missing or not a string.');
  else if (!draft.title.startsWith('A Case of the Mondays: ')) {
    problems.push('"title" must start with "A Case of the Mondays: " followed by this week\'s tagline.');
  }
  if (!Array.isArray(draft?.paragraphs)) problems.push('"paragraphs" must be an array of strings.');
  else {
    if (draft.paragraphs.length < 6) problems.push('"paragraphs" needs at least 6 entries.');
    if (draft.paragraphs.some((p) => typeof p !== 'string' || !p.trim())) {
      problems.push('every entry in "paragraphs" must be a non-empty string.');
    }
  }
  return problems;
}

const keyFor = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * Plain prose, not numbered citation entries like renderCorpus()'s sections —
 * this cache is small and there's no per-sentence citation check for this
 * post anyway (see checkDraft() below), so a numbered list would imply a
 * rigor this format doesn't actually enforce. Absence (no cache yet, or the
 * fetch failed) degrades to an empty section, not a placeholder claiming
 * there's no college football news at all.
 */
function renderCollegeFootballSection(cfb) {
  if (!cfb) return '';
  const lines = ['## COLLEGE FOOTBALL (real, current results — use these facts as-is; do not add scores or plays not listed here)'];

  const { lastGame, nextGame } = cfb.uva || {};
  if (lastGame) {
    lines.push(
      `UVA (Virginia Cavaliers) ${lastGame.won ? 'beat' : 'lost to'} ${lastGame.opponent} ` +
        `${lastGame.uvaScore}-${lastGame.opponentScore} (${lastGame.isHome ? 'home' : 'away'}${lastGame.venue ? `, ${lastGame.venue}` : ''}).`,
    );
  }
  if (nextGame) {
    lines.push(`UVA's next game: ${nextGame.isHome ? 'vs.' : 'at'} ${nextGame.opponent}.`);
  }

  for (const game of cfb.notable || []) {
    const line = game.teams.map((t) => `${t.rank ? `#${t.rank} ` : ''}${t.name} ${t.score}${t.winner ? ' (W)' : ''}`).join(' vs. ');
    lines.push(`Notable: ${line}.`);
  }

  return lines.length > 1 ? `\n\n${lines.join('\n')}` : '';
}

/**
 * Generates this week's recap, keyed by Monday's own date. Runs on a blind
 * weekly schedule (see .github/workflows/monday.yml) — `force` skips both
 * the day-of-week gate and the already-exists gate, for testing.
 */
export async function generateMonday({ force = false, now = new Date() } = {}) {
  if (!force && now.getDay() !== 1) {
    log.info('monday: not Monday, nothing to do');
    return null;
  }

  const key = keyFor(now);
  const file = fileFor(key);

  if (!force) {
    const existing = await loadMonday(key);
    if (existing) {
      log.info(`monday: ${key} already exists (status: ${existing.status}) — pass --force to regenerate`);
      return existing;
    }
  }

  const corpus = await buildCorpus(now.getTime(), { excludeSourceIds: EXCLUDED_SOURCE_IDS, windowDays: WINDOW_DAYS });
  const cfb = await loadCollegeFootballCache();
  const corpusText = renderCorpus(corpus) + renderCollegeFootballSection(cfb);
  let problems = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildMondayUserPrompt(corpusText, problems);
    let draft;
    try {
      const result = await callModel({ model: MODEL, system: MONDAY_SYSTEM_PROMPT, prompt, schema: MONDAY_SCHEMA });
      draft = sanitizeParagraphs(result.json);
    } catch (err) {
      log.warn(`monday: attempt ${attempt} threw (${err.message}) — retrying`);
      problems = [`Your last response could not be parsed (${err.message}). Return valid JSON exactly matching the schema.`];
      continue;
    }
    problems = checkDraft(draft);

    if (problems.length === 0) {
      const record = {
        key,
        status: 'draft',
        model: MODEL,
        generatedAt: new Date().toISOString(),
        attempts: attempt,
        title: draft.title,
        paragraphs: draft.paragraphs,
        corpus: corpus.entries,
      };
      await writeRecord(file, record);
      log.ok(`monday: wrote draft for ${key} (${attempt} attempt(s))`);
      return record;
    }
    log.warn(`monday: attempt ${attempt} failed the shape check (${problems.length} problem(s)) — retrying`);
  }

  throw new Error(`monday: could not produce a usable draft for ${key} after ${MAX_ATTEMPTS} attempts:\n  ${problems.join('\n  ')}`);
}

export async function loadMonday(key) {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function listMondays() {
  await fs.mkdir(MONDAYS_DIR, { recursive: true });
  const files = (await fs.readdir(MONDAYS_DIR)).filter((f) => f.endsWith('.json'));
  const records = await Promise.all(files.map((f) => fs.readFile(path.join(MONDAYS_DIR, f), 'utf8').then(JSON.parse)));
  return records.sort((a, b) => b.key.localeCompare(a.key));
}

export async function setMondayStatus(key, status) {
  const record = await loadMonday(key);
  if (!record) throw new Error(`no Monday recap found for ${key}`);
  record.status = status;
  record.reviewedAt = new Date().toISOString();
  await writeRecord(fileFor(key), record);
  return record;
}
