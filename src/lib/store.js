import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from './log.js';
import { normalizeTitle } from './text.js';

/**
 * Flat-file store. JSON on disk keyed by item ID — enough for a headline
 * river at this scale, and it diffs cleanly in git so `collect` stays
 * idempotent across machines and across CI runs.
 */

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const ITEMS_PATH = path.join(DATA_DIR, 'items.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const SOCIAL_PATH = path.join(DATA_DIR, 'social.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`could not read ${file}: ${err.message}`);
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

export async function loadItems() {
  return readJson(ITEMS_PATH, {});
}

export async function saveItems(items) {
  await writeJson(ITEMS_PATH, items);
}

export async function loadState() {
  return readJson(STATE_PATH, { runs: [] });
}

export async function saveState(state) {
  await writeJson(STATE_PATH, state);
}

export async function recordRun(entry) {
  const state = await loadState();
  state.runs = [{ at: new Date().toISOString(), ...entry }, ...(state.runs || [])].slice(0, 60);
  await saveState(state);
}

/** Days apart two postings of the same story may be and still count as one. */
const DUPLICATE_WINDOW_DAYS = 4;

/**
 * The same story picked up by two different outlets (wire pickups are
 * common in NFL coverage). Deliberately narrow: it must be a *different*
 * source and published within a few days — a headline reused months later
 * is a different story, not a duplicate.
 */
function findCrossSourceDuplicate(store, item) {
  const key = normalizeTitle(item.title);
  if (key.length < 20) return null;

  for (const candidate of Object.values(store)) {
    if (candidate.sourceId === item.sourceId) continue;
    if (normalizeTitle(candidate.title) !== key) continue;
    if (item.publishedAt && candidate.publishedAt) {
      const apart =
        Math.abs(new Date(item.publishedAt) - new Date(candidate.publishedAt)) / 86400000;
      if (apart > DUPLICATE_WINDOW_DAYS) continue;
    }
    return candidate;
  }
  return null;
}

/**
 * Merge freshly collected items into the store. Existing items are never
 * overwritten except to fill in a date we didn't have yet or lengthen a
 * thin excerpt.
 */
export function mergeItems(store, incoming) {
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = store[item.id];
    if (!existing) {
      const twin = findCrossSourceDuplicate(store, item);
      if (twin) {
        if ((twin.excerpt || '').length < (item.excerpt || '').length) {
          twin.excerpt = item.excerpt;
          updated += 1;
        }
        continue;
      }
      store[item.id] = item;
      added += 1;
      continue;
    }
    if (!existing.publishedAt && item.publishedAt) {
      existing.publishedAt = item.publishedAt;
      updated += 1;
    }
    if ((existing.excerpt || '').length < (item.excerpt || '').length) {
      existing.excerpt = item.excerpt;
      updated += 1;
    }
  }
  return { added, updated };
}

/**
 * Drop items past the age ceiling. The store is append-only during a merge, so
 * without this an item that was fresh when first collected would live on the
 * page forever. Undated items fall back to when we first saw them.
 * Returns the number removed.
 */
export function pruneItems(store, maxAgeDays) {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  let removed = 0;
  for (const [id, item] of Object.entries(store)) {
    const when = new Date(item.publishedAt || item.collectedAt).getTime();
    if (Number.isNaN(when) || when < cutoff) {
      delete store[id];
      removed += 1;
    }
  }
  return removed;
}

/** All stored items, newest first. */
export function sortedItems(items) {
  return Object.values(items).sort((a, b) =>
    (b.publishedAt || b.collectedAt).localeCompare(a.publishedAt || a.collectedAt),
  );
}

/* ------------------------------ social posts ------------------------------ */

/**
 * Social posts live in their own file rather than in items.json. They are a
 * different kind of thing: they render in the ticker instead of the river, they
 * never belong in the RSS feed, and the cross-source duplicate matching above
 * (which compares headlines) is meaningless for them. Post IDs are keyed on the
 * permalink, so the same tweet arriving from both an account timeline and a
 * hashtag timeline collapses to one entry on its own.
 */

/** A ticker of month-old tweets is worse than a short ticker, so the store is pruned. */
const SOCIAL_RETAIN_DAYS = Number(process.env.SOCIAL_RETAIN_DAYS || 10);

export async function loadSocial() {
  return readJson(SOCIAL_PATH, {});
}

export async function saveSocial(posts) {
  await writeJson(SOCIAL_PATH, posts);
}

export function mergeSocial(store, incoming) {
  let added = 0;
  let updated = 0;
  for (const post of incoming) {
    const existing = store[post.id];
    if (!existing) {
      store[post.id] = post;
      added += 1;
      continue;
    }
    // Re-apply the display text. Unlike articles, a post's text is derived from
    // the bridge's markup by cleanPostText(), so improving that cleaning should
    // fix posts already in the store rather than only future ones.
    if (existing.text !== post.text) {
      existing.text = post.text;
      updated += 1;
    }
  }
  return { added, updated };
}

/** Drop posts past the retention window. Returns the number removed. */
export function pruneSocial(store) {
  const cutoff = Date.now() - SOCIAL_RETAIN_DAYS * 86400000;
  let removed = 0;
  for (const [id, post] of Object.entries(store)) {
    const when = new Date(post.publishedAt || post.collectedAt).getTime();
    if (Number.isNaN(when) || when < cutoff) {
      delete store[id];
      removed += 1;
    }
  }
  return removed;
}

/** All stored social posts, newest first. */
export function sortedSocial(posts) {
  return Object.values(posts).sort((a, b) =>
    (b.publishedAt || b.collectedAt).localeCompare(a.publishedAt || a.collectedAt),
  );
}
