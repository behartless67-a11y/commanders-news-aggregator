import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/store.js';
import { log } from '../lib/log.js';
import { buildCorpus, renderCorpus } from './select.js';
import { MONDAY_SYSTEM_PROMPT, MONDAY_SCHEMA, buildMondayUserPrompt } from './monday-prompt.js';
import { generate as callModel } from './cloud-provider.js';
import { sanitizeParagraphs } from './sanitize.js';
import { loadCollegeFootballCache } from '../lib/collegefootball.js';
import { loadRedditCache } from '../lib/reddit.js';

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
 * r/Commanders, as fan reaction only. See src/lib/reddit.js for why the sub
 * is fed to this post rather than rendered anywhere on the site.
 *
 * Budgeted in characters rather than entries, so one talkative week can't
 * run away with the prompt. The budget used to be much tighter: this fed a
 * Bedrock tool_use call that got unreliable past ~8k tokens, and the corpus
 * alone was already ~6.4k of that. That call is gone (the post is written by
 * hand now, from exportMondayPrompt's briefing), and a person reading a
 * briefing wants the fanbase's actual week, so the ceiling here is now about
 * readability rather than a model's failure mode.
 *
 * Usernames are omitted on purpose. Quoting a stranger's handle in a
 * published post is a different thing from quoting the sub, and the column
 * only ever needs the latter, so the model is never given the option.
 */
const REDDIT_CHAR_BUDGET = Number(process.env.MONDAY_REDDIT_BUDGET || 6000);
const REDDIT_MAX_POSTS = 16;
/** Under this is "lol"/"this"; over it is a wall of text that eats the budget. */
const REDDIT_MIN_COMMENT_CHARS = 40;
const REDDIT_COMMENT_TRIM = 320;
const REDDIT_THREAD_TRIM = 70;
/**
 * Two people going back and forth is one thread's worth of opinion, not six.
 * The first run of this returned five of seventeen comments from a single
 * running-back-rotation argument, which is the fanbase's mood the way one
 * loud table is a restaurant's.
 */
const REDDIT_MAX_PER_THREAD = 3;

function clip(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

/** HARD RULE 4 forbids URLs in the output, so none go in as input either. */
const stripUrls = (s) => String(s || '').replace(/\bhttps?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();

export function renderRedditSection(reddit, cutoffMs) {
  if (!reddit) return '';
  const fresh = (list) => (list || []).filter((e) => Date.parse(e.at || '') >= cutoffMs);

  const posts = fresh(reddit.posts).slice(0, REDDIT_MAX_POSTS).map((p) => `- ${clip(p.title, 90)}`);

  // Newest-first (mergeEntries already sorted), filling until the budget runs
  // out rather than taking a fixed count, so one long week can't blow past it.
  const comments = [];
  const perThread = new Map();
  let spent = 0;
  for (const c of fresh(reddit.comments)) {
    const thread = c.onPost || '';
    const seen = perThread.get(thread) || 0;
    if (seen >= REDDIT_MAX_PER_THREAD) continue;
    // Inner double quotes would make the line's own quoting ambiguous.
    const body = stripUrls(c.body).replace(/"/g, "'");
    if (body.length < REDDIT_MIN_COMMENT_CHARS) continue;
    const line = `- on "${clip(thread, REDDIT_THREAD_TRIM)}": "${clip(body, REDDIT_COMMENT_TRIM)}"`;
    if (spent + line.length > REDDIT_CHAR_BUDGET) break;
    comments.push(line);
    perThread.set(thread, seen + 1);
    spent += line.length;
  }

  if (!posts.length && !comments.length) return '';

  const lines = [
    '## FAN REACTION, from the r/Commanders subreddit',
    '(Opinion and mood only. NOT a source for any factual claim, and never quote or name a specific user. See HARD RULE 8.)',
  ];
  if (posts.length) lines.push('', 'What the sub was posting about:', ...posts);
  if (comments.length) lines.push('', 'What the sub was actually saying:', ...comments);
  return `\n\n${lines.join('\n')}`;
}

/**
 * Everything the writer sees: the numbered sources, the college football
 * results, and the subreddit. Shared by generateMonday() and
 * exportMondayPrompt() so the hand-written post is built from exactly the
 * same material a generated one would be, with no second copy to drift.
 */
export async function buildMondayCorpusText(now = new Date()) {
  const corpus = await buildCorpus(now.getTime(), {
    excludeSourceIds: EXCLUDED_SOURCE_IDS,
    windowDays: WINDOW_DAYS,
  });
  const cfb = await loadCollegeFootballCache();
  const reddit = await loadRedditCache();
  const corpusText =
    renderCorpus(corpus) +
    renderCollegeFootballSection(cfb) +
    renderRedditSection(reddit, now.getTime() - WINDOW_DAYS * 86400000);
  return { corpus, corpusText };
}

/**
 * Writes this week's full prompt to data/mondays/<key>.prompt.md, for writing
 * the post by hand instead of calling a model (there is no Bedrock account
 * behind this project any more; see docs/how-everything-works.md).
 *
 * The file is the briefing, not the post: paste it somewhere with a model in
 * it, or just read it and write the thing yourself. Either way the sources,
 * the rules and the fan reaction are already gathered and scoped to the
 * weekend, which is the part that is tedious to do by hand.
 */
export async function exportMondayPrompt({ now = new Date() } = {}) {
  const key = keyFor(now);
  const { corpus, corpusText } = await buildMondayCorpusText(now);
  const file = path.join(MONDAYS_DIR, `${key}.prompt.md`);

  const doc = [
    `<!-- A Case of the Mondays, ${key}. Generated by \`npm run monday:corpus\`. -->`,
    `<!-- Save the finished post to data/mondays/${key}.json as {"key","status":"draft","title","paragraphs":[...]} -->`,
    '',
    '# SYSTEM PROMPT',
    '',
    MONDAY_SYSTEM_PROMPT,
    '',
    '# THE ASK',
    '',
    buildMondayUserPrompt(corpusText),
    '',
  ].join('\n');

  await fs.mkdir(MONDAYS_DIR, { recursive: true });
  await fs.writeFile(file, doc, 'utf8');
  log.ok(`monday: wrote ${file} (${corpus.entries.length} sources, ~${Math.round(doc.length / 4)} tokens)`);
  return file;
}

/**
 * Generates this week's recap, keyed by Monday's own date.
 *
 * Nothing calls this on a schedule any more: monday.yml exports the prompt
 * instead (see exportMondayPrompt), because the AWS/Bedrock account this
 * depended on is gone and the post is written by hand now. Kept working, and
 * kept pointed at the same corpus, so restoring automation later is a
 * credentials change rather than a rewrite. `force` skips both the
 * day-of-week gate and the already-exists gate, for testing.
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

  const { corpus, corpusText } = await buildMondayCorpusText(now);
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
