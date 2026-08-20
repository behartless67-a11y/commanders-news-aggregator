import { log } from '../lib/log.js';
import { listDigests, loadDigest, setDigestStatus } from './generate.js';

const stripCites = (s) => String(s).replace(/\[[\d,\s]+\]/g, ' ');

function wrap(text, width = 84, indent = '') {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width - indent.length) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

const rule = (ch = '─', width = 84) => ch.repeat(width);

function printSources(cites, byIndex) {
  for (const n of cites) {
    const e = byIndex.get(n);
    if (!e) {
      console.log(`    [${n}] ?? missing from stored corpus`);
      continue;
    }
    const label = e.kind === 'post' ? `@${e.handle}` : e.sourceName;
    const what = e.kind === 'post' ? e.text : e.title;
    console.log(wrap(`[${n}] ${label} — ${what}`, 84, '    '));
  }
}

/**
 * The review screen. Every citation is resolved to its actual source right
 * here so a claim can be fact-checked without leaving the terminal — this is
 * the step that exists because validation can't catch a relationship
 * hallucination (see validate.js) where every name and number is real.
 */
export function printDigest(record) {
  const byIndex = new Map(record.corpus.map((e) => [e.n, e]));
  const { digest } = record;

  console.log(rule('═'));
  console.log(`  THE BURGUNDY WIRE — WEEKLY RECAP — ${record.week}`);
  console.log(`  status: ${record.status} · model: ${record.model} · ${record.attempts} attempt(s) · ${record.warnings.length} warning(s)`);
  console.log(rule('═'));
  console.log();
  console.log(wrap(digest.headline.toUpperCase()));
  console.log();
  console.log(wrap(digest.lede));
  console.log();

  const cited = new Set();
  for (const t of digest.threads) {
    console.log(rule());
    console.log(wrap(t.title));
    console.log();
    console.log(wrap(stripCites(t.body)));
    console.log();
    console.log('  Sources:');
    t.cites.forEach((n) => cited.add(n));
    printSources(t.cites, byIndex);
    console.log();
  }

  if (digest.alsoNoted?.length) {
    console.log(rule());
    console.log('ALSO NOTED');
    console.log();
    for (const a of digest.alsoNoted) {
      console.log(wrap(`• ${stripCites(a.text)}`));
      a.cites.forEach((n) => cited.add(n));
      printSources(a.cites, byIndex);
      console.log();
    }
  }

  console.log(rule('═'));
  console.log(`  ${cited.size} of ${record.corpus.length} corpus entries cited.`);
  if (record.warnings.length) {
    console.log(`  Warnings (real but undercited numbers/names — read before approving):`);
    for (const w of record.warnings) console.log(`    ~ ${w}`);
  }
  console.log(rule('═'));
}

export async function digestList() {
  const records = await listDigests();
  if (!records.length) {
    log.info('no digests yet — run `npm run digest`');
    return;
  }
  console.table(
    records.map((r) => ({
      week: r.week,
      status: r.status,
      model: r.model,
      threads: r.digest?.threads?.length ?? 0,
      warnings: r.warnings?.length ?? 0,
    })),
  );
}

export async function digestReview(key) {
  if (!key) {
    log.error('usage: npm run digest:review -- <week>   (e.g. 2026-08-20)');
    return;
  }
  const record = await loadDigest(key);
  if (!record) {
    log.error(`no digest found for ${key} — run \`npm run digest:list\``);
    return;
  }
  printDigest(record);
}

export async function digestSetStatus(key, status) {
  if (!key) {
    log.error(`usage: npm run digest:${status === 'published' ? 'approve' : 'reject'} -- <week>`);
    return;
  }
  try {
    await setDigestStatus(key, status);
    log.ok(`digest: ${key} marked ${status}`);
  } catch (err) {
    log.error(err.message);
  }
}
