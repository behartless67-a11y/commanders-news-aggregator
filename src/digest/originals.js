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
