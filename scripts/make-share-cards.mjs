#!/usr/bin/env node
/**
 * Link-preview cards for Ben's own posts: one 1200x630 JPEG per published
 * original and Monday post, the post's photo darkened toward the bottom with
 * the logo up top and the headline across the bottom.
 *
 *   node scripts/make-share-cards.mjs              every published post
 *   node scripts/make-share-cards.mjs <slug|key>   just that one (or a PAGE_CARDS ref, e.g. hail-mail)
 *
 * Run it when a post is published or its title changes, then commit what it
 * writes. Like process-photos.sh it is deliberately not part of `npm run
 * build`: it needs ffmpeg, which the GitHub Actions builds don't have, and the
 * cards only change when a post does. A post with no card still shares fine,
 * it just falls back to the site's logo card (see socialMetaTags).
 *
 * Why this exists: before it, every post shared the same logo image, and on X
 * (which shows the image and nothing else) every link looked identical.
 *
 * Background, in order:
 *   1. `share.background` on the record: a key in its `photos` map, or one of
 *      the stock stadium shots below by name.
 *   2. The post's first photo (first `!photo` marker, then the slideshow).
 *   3. A stock stadium shot, picked by the post's id so it doesn't change
 *      between runs.
 * `share.focusY` (0 top, 1 bottom, default 0.35) picks which band of a taller
 * photo survives the crop to 1200x630; faces want to sit above the headline.
 *
 * The stock shots in src/site/assets/share/bg/ were cut once, by hand, from
 * Ben's Seahawks game photos (Desktop/gameday): bowl from IMG_8914.JPG, huddle
 * from IMG_8959.JPG, pregame from IMG_8933.JPG, each a 1536x806 band scaled to
 * 1200x630 with the same color pass as process-photos.sh.
 *
 * Covers published and scheduled posts (not drafts), plus the pages in
 * PAGE_CARDS.
 *
 * Writes src/site/assets/share/<id>.jpg and src/site/assets/share/cards.json,
 * which build.js reads to point each post's og:image at its card.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ASSETS = path.join(ROOT, 'src/site/assets');
const SHARE_DIR = path.join(ASSETS, 'share');
const MANIFEST = path.join(SHARE_DIR, 'cards.json');
const STOCK = ['bowl', 'huddle', 'pregame'];
// Segoe UI Black: heavy enough to read at thumbnail size, and on every Windows
// machine. FONT overrides it anywhere else.
const FONT = process.env.FONT || 'C:/Windows/Fonts/seguibl.ttf';

const W = 1200;
const H = 630;
const MARGIN = 60;
const TEXT = '0xEFE9E4'; // --text
const GOLD = '0xFFB612'; // --gold

function loadPosts() {
  const read = (dir, kind, idOf) =>
    fs
      .readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith('.json') && !f.endsWith('.prompt.json'))
      .map((f) => {
        const file = path.join(ROOT, dir, f);
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { kind, id: `${kind}-${idOf(record)}`, ref: idOf(record), record };
      })
      // Scheduled too, so a post set to publish itself later already has its
      // card waiting when scheduled.yml flips it live.
      .filter((p) => ['published', 'scheduled'].includes(p.record.status) && p.record.title);
  return [
    ...read('data/originals', 'original', (r) => r.slug),
    ...read('data/mondays', 'monday', (r) => r.key),
    ...PAGE_CARDS,
  ];
}

/**
 * Site pages that get shared on their own, so they get a card like a post.
 * Same shape as a post entry; `ref` is what you pass to make just that one.
 */
const PAGE_CARDS = [
  {
    kind: 'page',
    id: 'page-hail-mail',
    ref: 'hail-mail',
    record: { title: 'Hail Mail: The Commanders Email for Fans Who Feel Too Much', share: { background: 'bowl' } },
  },
];

/** Stable small hash, so a post's stock background doesn't move between runs. */
function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function backgroundFor({ id, record }) {
  const photos = record.photos || {};
  const photoFile = (key) => (photos[key] ? path.join(ASSETS, 'photos', photos[key].file) : null);
  const stockFile = (name) => (STOCK.includes(name) ? path.join(SHARE_DIR, 'bg', `${name}.jpg`) : null);

  const chosen = record.share?.background;
  if (chosen) {
    const file = photoFile(chosen) || stockFile(chosen);
    if (!file) throw new Error(`${id}: share.background "${chosen}" is neither a photo key nor a stock shot`);
    return file;
  }
  const firstMarker = (record.paragraphs || []).find((p) => p.startsWith('!photo '))?.slice(7).trim();
  const first = firstMarker || record.slideshow?.keys?.[0] || Object.keys(photos)[0];
  if (first && photoFile(first)) return photoFile(first);
  return stockFile(STOCK[hash(id) % STOCK.length]);
}

/** Greedy word wrap at a character budget per line. */
function greedy(title, perLine) {
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Word wrap against an estimated width, then balanced: the narrowest budget
 * that still needs no more lines than the full width does. Plain greedy
 * wrapping left orphans like "A Case of the Mondays: I" / "Told You So".
 *
 * Segoe UI Black measures about 0.52em a character in title case; 0.55 leaves
 * a little slack so a line of capitals or wide letters still clears the right
 * margin.
 */
function wrap(title, size, maxWidth) {
  const perLine = Math.floor(maxWidth / (size * 0.55));
  const count = greedy(title, perLine).length;
  let budget = perLine;
  while (budget > 1 && greedy(title, budget - 1).length === count) budget -= 1;
  return greedy(title, budget);
}

/** Biggest size that fits the headline in three lines, or four at the smallest. */
function layout(title) {
  const maxWidth = W - MARGIN * 2;
  for (const size of [76, 68, 60, 54, 48]) {
    const lines = wrap(title, size, maxWidth);
    if (lines.length <= 3) return { size, lines };
  }
  return { size: 44, lines: wrap(title, 44, maxWidth) };
}

function makeCard(post, tmp) {
  const { record, id } = post;
  const bg = backgroundFor(post);
  const focusY = Math.min(1, Math.max(0, Number(record.share?.focusY ?? 0.35)));
  const { size, lines } = layout(record.title);
  const lineH = Math.round(size * 1.14);
  const blockTop = H - MARGIN - lines.length * lineH;

  // drawtext reads each line from a file in the working directory, so no
  // title ever has to survive ffmpeg's filter-string escaping (colons and
  // apostrophes are in half of them).
  lines.forEach((l, i) => fs.writeFileSync(path.join(tmp, `l${i}.txt`), l));
  fs.copyFileSync(FONT, path.join(tmp, 'font.ttf'));

  const text = lines
    .map(
      (_, i) =>
        `drawtext=fontfile=font.ttf:textfile=l${i}.txt:fontsize=${size}:fontcolor=${TEXT}:x=${MARGIN}:y=${blockTop + i * lineH}:shadowcolor=0x000000@0.55:shadowx=0:shadowy=2`,
    )
    .join(',');

  const filter = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})/2:(ih-${H})*${focusY}[photo]`,
    // Near-black (--bg), heaviest behind the headline and again across the top
    // edge, where the burgundy logo otherwise vanishes into a burgundy crowd.
    // The middle stays light so the photo reads.
    `color=c=0x14100f:s=${W}x${H},format=rgba,geq=r=20:g=16:b=15:a='255*max(0.86*pow(max(0,1-Y/(0.48*${H})),1.2),0.15+0.81*pow(Y/${H},1.2))'[shade]`,
    `[photo][shade]overlay[base]`,
    `[1:v]scale=270:-1[logo]`,
    `[base][logo]overlay=${MARGIN - 8}:${MARGIN - 18}[branded]`,
    `[branded]drawbox=x=${MARGIN}:y=${blockTop - 26}:w=84:h=7:color=${GOLD}:t=fill,${text}`,
  ].join(';');

  const out = path.join(SHARE_DIR, `${id}.jpg`);
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', bg, '-i', path.join(ASSETS, 'logo.png'), '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', out],
    { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  return {
    file: `share/${id}.jpg`,
    w: W,
    h: H,
    alt: `The headline "${record.title}" over a photo, with The Burgundy Wire logo.`,
  };
}

const only = process.argv[2];
const posts = loadPosts().filter((p) => !only || p.ref === only);
if (only && !posts.length) {
  console.error(`No published or scheduled post with slug or key "${only}"`);
  process.exit(1);
}
fs.mkdirSync(SHARE_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'share-cards-'));
try {
  for (const post of posts) {
    manifest[post.id] = makeCard(post, tmp);
    console.log(`share card: ${manifest[post.id].file}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
fs.writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
