import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/store.js';

/**
 * Hand-written posts (personal essays, site announcements) — no model, no
 * corpus, no draft/review/approve gate, because there's no generation step
 * to gate. A record only needs status: 'published' to reach the site, same
 * final rule as the AI digest/preview records, just without everything that
 * gets it there.
 */
export const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');

export async function listOriginals() {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  const files = (await fs.readdir(ORIGINALS_DIR)).filter((f) => f.endsWith('.json'));
  const records = await Promise.all(files.map((f) => fs.readFile(path.join(ORIGINALS_DIR, f), 'utf8').then(JSON.parse)));
  return records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Flips `status: 'scheduled'` posts to 'published' once their own
 * `publishedAt` has passed, so a finished post can be written days early and
 * go live on its own at a chosen hour (see .github/workflows/scheduled.yml).
 *
 * Deliberately only for originals. Digests, previews and Mondays each have a
 * human approval gate in front of them, and a post that publishes itself on
 * a timer is exactly what that gate exists to prevent. Originals have no such
 * gate by design (see above), because a hand-written post was already
 * reviewed by the person who wrote it.
 *
 * Nothing renders a non-'published' record (see build.js), so a scheduled
 * post is invisible until this runs. The pin window keys off `publishedAt`
 * too, which means a post scheduled for 7am pins itself for 24 hours from
 * 7am rather than from whenever the workflow happened to fire.
 */
export async function publishDueOriginals({ now = new Date() } = {}) {
  const published = [];
  for (const record of await listOriginals()) {
    if (record.status !== 'scheduled') continue;
    if (!(Date.parse(record.publishedAt) <= now.getTime())) continue;
    const file = path.join(ORIGINALS_DIR, `${record.slug}.json`);
    await fs.writeFile(file, `${JSON.stringify({ ...record, status: 'published' }, null, 2)}\n`, 'utf8');
    published.push(record.slug);
  }
  return published;
}
