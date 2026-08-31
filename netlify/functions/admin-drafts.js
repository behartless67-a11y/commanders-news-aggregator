import fs from 'node:fs/promises';
import path from 'node:path';
import { isAuthorized } from './_auth.js';

/**
 * Reads whatever data/digests/*.json, data/previews/*.json, and
 * data/mondays/*.json were bundled into this function at the last deploy
 * (see included_files in netlify.toml) — a real-time read of the repo isn't
 * possible from here, so a draft generated after the last deploy won't show
 * up until the next one runs. Every automated pipeline that generates a
 * draft also rebuilds and redeploys at the end of the same run, so in
 * practice this is never more than one cycle stale.
 *
 * Every record type is tagged with `type` so the admin page can render and
 * approve them distinctly (a preview's key is a game date, a digest's key
 * is a week, a Monday recap's key is that Monday's date) without needing a
 * separate endpoint per type. `shape` normalizes each type's very different
 * storage format (digest/preview nest under `digest.headline`/`.threads`;
 * a Monday recap is flat `title`/`paragraphs`, see monday-generate.js) into
 * the one {headline, lede, body} shape the admin page actually renders.
 */
async function readDir(dir, type, keyField, shape) {
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (f) => {
      const raw = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      return {
        type,
        key: raw[keyField],
        status: raw.status,
        generatedAt: raw.generatedAt,
        warnings: raw.warnings?.length || 0,
        ...shape(raw),
      };
    }),
  );
}

const digestShape = (raw) => ({
  headline: raw.digest?.headline,
  lede: raw.digest?.lede,
  // Plain thread bodies, no citation markers resolved — enough to read and
  // judge the draft without needing the full public render (which an
  // unpublished draft has no URL for anyway).
  body: (raw.digest?.threads || []).map((t) => t.body).filter(Boolean),
});

const mondayShape = (raw) => ({
  headline: raw.title,
  lede: null,
  body: raw.paragraphs || [],
});

export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const [digests, previews, mondays] = await Promise.all([
    readDir(path.resolve('data/digests'), 'weekly', 'week', digestShape),
    readDir(path.resolve('data/previews'), 'preview', 'gameKey', digestShape),
    readDir(path.resolve('data/mondays'), 'monday', 'key', mondayShape),
  ]);
  const records = [...digests, ...previews, ...mondays]
    .filter((r) => r.status !== 'rejected')
    .sort((a, b) => b.key.localeCompare(a.key));

  return new Response(JSON.stringify({ records }), { headers: { 'Content-Type': 'application/json' } });
};
