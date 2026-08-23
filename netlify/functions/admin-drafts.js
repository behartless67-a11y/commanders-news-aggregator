import fs from 'node:fs/promises';
import path from 'node:path';
import { isAuthorized } from './_auth.js';

/**
 * Reads whatever data/digests/*.json was bundled into this function at the
 * last deploy (see included_files in netlify.toml) — a real-time read of
 * the repo isn't possible from here, so a draft generated after the last
 * deploy won't show up until the next one runs. Every automated pipeline
 * that generates a draft also rebuilds and redeploys at the end of the same
 * run (see nightly.yml et al.), so in practice this is never more than one
 * cycle stale.
 */
export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const dir = path.resolve('data/digests');
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }

  const records = await Promise.all(
    files.map(async (f) => {
      const raw = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      return {
        week: raw.week,
        status: raw.status,
        headline: raw.digest?.headline,
        lede: raw.digest?.lede,
        generatedAt: raw.generatedAt,
        warnings: raw.warnings?.length || 0,
      };
    }),
  );
  records.sort((a, b) => b.week.localeCompare(a.week));

  return new Response(JSON.stringify({ records }), { headers: { 'Content-Type': 'application/json' } });
};
