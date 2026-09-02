import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/store.js';
import { log } from '../lib/log.js';
import { buildCorpus, renderCorpus } from './select.js';
import { SYSTEM_PROMPT, SCHEMA, buildUserPrompt } from './prompt.js';
import { generateText as callModel } from './cloud-provider.js';
import { validate } from './validate.js';
import { sanitizeDigest } from './sanitize.js';

const MODEL = process.env.DIGEST_MODEL || 'anthropic.claude-sonnet-5';
const NOTIFY_EMAIL = process.env.DIGEST_NOTIFY_EMAIL || 'bh4hb@virginia.edu';
const SITE_URL = process.env.SITE_URL || 'https://theburgundywire.com';

async function notifyDraftReady(key, headline) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'The Burgundy Wire <newsletter@theburgundywire.com>',
      to: NOTIFY_EMAIL,
      subject: `Digest draft ready to approve: ${key}`,
      html: `<p style="font-family:sans-serif;font-size:15px;color:#333">
        Your weekly digest draft is ready to review and approve.<br><br>
        <strong>Week:</strong> ${key}<br>
        <strong>Headline:</strong> ${headline || '(no headline)'}<br><br>
        <a href="${SITE_URL}/admin.html" style="background:#5A1414;color:#FFB612;font-weight:700;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
          Review and approve
        </a><br><br>
        <small style="color:#999">Once approved it goes live on the site and you can send Hail Mail from the admin panel.</small>
      </p>`,
    }),
  });
}

// A February week can produce a handful of items. Declining to write about
// almost nothing is the honest choice, not a padded post.
const MIN_ITEMS = Number(process.env.DIGEST_MIN_ITEMS || 10);

const MAX_ATTEMPTS = Number(process.env.DIGEST_MAX_ATTEMPTS || 3);

export const DIGESTS_DIR = path.join(DATA_DIR, 'digests');

const keyFor = (date) => date.toISOString().slice(0, 10);
const fileFor = (key) => path.join(DIGESTS_DIR, `${key}.json`);

async function writeRecord(file, record) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Generate this week's draft. Written once and never silently regenerated —
 * same rule `data/items.json` follows, and for the same reason: otherwise a
 * scheduled run could rewrite last week's post out from under a reader who
 * already saw it. Pass `force` to intentionally regenerate.
 */
export async function generateDigest({ force = false, now = new Date() } = {}) {
  const key = keyFor(now);
  const file = fileFor(key);

  if (!force) {
    const existing = await loadDigest(key);
    if (existing) {
      log.info(`digest: ${key} already exists (status: ${existing.status}) — pass --force to regenerate`);
      return existing;
    }
  }

  const corpus = await buildCorpus(now.getTime());
  if (corpus.entries.length < MIN_ITEMS) {
    log.warn(`digest: only ${corpus.entries.length} item(s) this week (need ${MIN_ITEMS}) — skipping`);
    return null;
  }
  log.info(
    `digest: ${corpus.entries.length} corpus entries ` +
      `(${corpus.counts.articles} articles, ${corpus.counts.videos} videos, ${corpus.counts.posts} posts), ` +
      `${corpus.dropped.length} dropped`,
  );

  const corpusText = renderCorpus(corpus);
  let problems = [];
  let result;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildUserPrompt(corpusText, problems);
    result = await callModel({ model: MODEL, system: SYSTEM_PROMPT, prompt });
    result.json = sanitizeDigest(result.json);
    const outcome = validate(corpus, result.json);
    problems = outcome.problems;

    if (problems.length === 0) {
      const record = {
        week: key,
        status: 'draft',
        model: MODEL,
        generatedAt: new Date().toISOString(),
        attempts: attempt,
        windowStart: new Date(corpus.cutoff).toISOString(),
        windowEnd: now.toISOString(),
        digest: result.json,
        corpus: corpus.entries,
        warnings: outcome.warnings,
      };
      await writeRecord(file, record);
      log.ok(
        `digest: wrote draft ${key} (${attempt} attempt(s), ${outcome.warnings.length} warning(s)) — ` +
          `review with \`npm run digest:review -- ${key}\``,
      );
      // Notify the site owner so they can approve remotely.
      await notifyDraftReady(key, result.json.headline).catch(() => {});
      return record;
    }
    log.warn(`digest: attempt ${attempt} failed validation (${problems.length} problem(s)) — retrying`);
  }

  throw new Error(
    `digest: could not produce a validated draft for ${key} after ${MAX_ATTEMPTS} attempts:\n  ${problems.join('\n  ')}`,
  );
}

export async function loadDigest(key) {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function listDigests() {
  await fs.mkdir(DIGESTS_DIR, { recursive: true });
  const files = (await fs.readdir(DIGESTS_DIR)).filter((f) => f.endsWith('.json'));
  const records = await Promise.all(files.map((f) => fs.readFile(path.join(DIGESTS_DIR, f), 'utf8').then(JSON.parse)));
  return records.sort((a, b) => b.week.localeCompare(a.week));
}

export async function setDigestStatus(key, status) {
  const record = await loadDigest(key);
  if (!record) throw new Error(`no digest found for ${key}`);
  record.status = status;
  record.reviewedAt = new Date().toISOString();
  await writeRecord(fileFor(key), record);
  return record;
}
