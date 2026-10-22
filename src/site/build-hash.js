import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A fingerprint of what a deploy would actually publish, written to
 * dist/build-hash.txt by every build. scripts/needs-deploy.mjs compares it
 * with the copy on the live site, and the workflows skip
 * `netlify deploy --prod` when they match.
 *
 * Why (Oct 22): on Netlify's credit plan every production deploy costs 15
 * credits, and the site was deploying about 620 times a month, roughly
 * three times the included allowance, paid for in automatic $10 top-ups.
 * Most of those deploys published nothing new. The workflows' own gate
 * ("did anything in data/ change?") was always true, because state.json, the
 * stats caches and the ref-crew cache are rewritten with fresh timestamps
 * on every run.
 *
 * So this hashes the output, not the inputs, with the few parts that change
 * on every build without meaning anything taken out first:
 *   - the "Last updated" time on the river pages,
 *   - <lastBuildDate> and <updated> in the feeds,
 *   - the "Xh ago" text in <time> elements and the ticker, Live Feed and
 *     Social Feed time labels, which site.js recomputes in the browser from
 *     each one's timestamp anyway.
 * Everything else counts, including the daily header photo, so the site
 * still deploys at least once a day.
 *
 * The function code and config ride along too (netlify/, netlify.toml,
 * src/, config/, package-lock.json): functions ship in the same deploy and
 * import from src/, so a change that only touches a function still has to
 * deploy. Data-only bot runs never touch those, so for them the fingerprint
 * moves only when the pages do.
 */
const VOLATILE = [
  // "Last updated:</strong> Oct 22, 7:34 AM EDT"
  [/(Last updated:<\/strong>)[^<]*/g, '$1'],
  [/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate></lastBuildDate>'],
  [/<updated>[^<]*<\/updated>/g, '<updated></updated>'],
  // Relative labels: the browser rewrites these from the timestamp beside them.
  [/(<time\b[^>]*>)[^<]*(<\/time>)/g, '$1$2'],
  [/(<span class="(?:ticker-time|live-feed-time|social-feed-time)">)[^<]*(<\/span>)/g, '$1$2'],
];

const TEXT = /\.(html|xml|txt|json|css|js|webmanifest|svg)$/i;
const SELF = 'build-hash.txt';

async function listFiles(dir, base = dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...(await listFiles(full, base)));
    } else {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

export function normalize(file, buffer) {
  if (!TEXT.test(file)) return buffer;
  // Line endings differ between Windows checkouts and the Linux runner; the
  // fingerprint should not.
  let text = buffer.toString('utf8').replace(/\r\n/g, '\n');
  if (/\.(html|xml)$/i.test(file)) {
    for (const [pattern, replacement] of VOLATILE) text = text.replace(pattern, replacement);
  }
  return Buffer.from(text, 'utf8');
}

/** Hex fingerprint of `distDir` plus the deploy-relevant source around it. */
export async function computeBuildHash(distDir, repoDir) {
  const hash = crypto.createHash('sha256');
  const add = async (label, dir) => {
    const files = (await listFiles(dir)).filter((f) => !(label === 'dist' && f === SELF)).sort();
    for (const file of files) {
      const content = normalize(file, await fs.readFile(path.join(dir, file)));
      hash.update(`${label}/${file}\0`).update(content).update('\0');
    }
  };
  await add('dist', distDir);
  for (const dir of ['netlify', 'src', 'config']) await add(dir, path.join(repoDir, dir));
  for (const file of ['netlify.toml', 'package-lock.json']) {
    const content = await fs.readFile(path.join(repoDir, file)).catch(() => null);
    if (content) hash.update(`${file}\0`).update(normalize(file, content)).update('\0');
  }
  return hash.digest('hex');
}

export async function writeBuildHash(distDir, repoDir) {
  const digest = await computeBuildHash(distDir, repoDir);
  await fs.writeFile(path.join(distDir, SELF), `${digest}\n`, 'utf8');
  return digest;
}
