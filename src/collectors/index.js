import { enabledSources, sourceById } from '../../config/sources.js';
import { SOCIAL_ACCOUNTS, SOCIAL_TAGS, SOCIAL_ENABLED, SOCIAL_BROWSER_ACCOUNTS } from '../../config/social.js';
import { ROSTER_ALIASES } from '../../config/roster-aliases.js';
import { log } from '../lib/log.js';
import { isRelevant, relevanceSignal, isSocialFiller } from '../lib/relevance.js';
import { daysAgo } from '../lib/dates.js';
import { loadRosterCache } from '../lib/roster.js';
import { buildRosterIndex } from '../lib/roster-links.js';
import {
  loadItems,
  saveItems,
  mergeItems,
  pruneItems,
  recordRun,
  loadSocial,
  saveSocial,
  mergeSocial,
  pruneSocial,
} from '../lib/store.js';
import { collect as collectRss } from './rss.js';
import { collectAccount, collectTag } from './mastodon.js';
import { collectXProfile } from './xbrowser.js';

const COLLECTORS = { rss: collectRss };

/**
 * Hard ceiling applied to every source, no exceptions. The team's own feed is a
 * slow editorial feed that mixes 2022 draft-pick recaps in with this month's
 * posts, and those genuinely old items were reaching the page.
 */
const MAX_ITEM_AGE_DAYS = Number(process.env.MAX_ITEM_AGE_DAYS || 45);

/**
 * Tighter window for league-wide wires (PFT/CBS/Yahoo). They publish
 * continuously, so anything more than a couple of weeks old there is stale in a
 * way a team-site feature isn't.
 */
const MAX_WIRE_AGE_DAYS = Number(process.env.MAX_WIRE_AGE_DAYS || 14);

const MAX_ITEMS_PER_SOURCE = Number(process.env.MAX_ITEMS_PER_SOURCE || 15);

/**
 * Social posts age out much faster than articles. A three-day-old headline is
 * still worth reading; a three-day-old "he's practicing today" tweet is not.
 */
const MAX_SOCIAL_AGE_DAYS = Number(process.env.MAX_SOCIAL_AGE_DAYS || 3);

/**
 * Posts shorter than this are almost always a caption on a photo or video
 * ("Early scene:"), which carries nothing once the media is stripped away.
 */
const MIN_SOCIAL_TEXT_CHARS = Number(process.env.MIN_SOCIAL_TEXT_CHARS || 25);

/** Shared by collectSocialAll() and collectSocialBrowser() — same freshness/length bar for every social source, whichever way it was fetched. */
function keepSocialPost(post, alwaysRelevant) {
  if (post.text.length < MIN_SOCIAL_TEXT_CHARS) return false;
  if (post.publishedAt && daysAgo(post.publishedAt) > MAX_SOCIAL_AGE_DAYS) return false;
  if (alwaysRelevant) return true;
  return relevanceSignal(`${post.text} ${post.handle}`) !== null;
}

/**
 * Re-check stored items against the current relevance rules and drop the ones
 * that no longer pass. Without this, tightening the filter only affects future
 * collections while old false positives sit on the page indefinitely — the
 * store is append-only during a merge.
 *
 * Items from a source that is no longer in the registry are left alone: they
 * can't be re-evaluated, and silently deleting them on an unrelated config edit
 * would be surprising.
 */
function pruneIrrelevant(store, rosterIndex) {
  let dropped = 0;
  for (const [id, item] of Object.entries(store)) {
    const source = sourceById(item.sourceId);
    if (!source) continue;
    if (isRelevant(source, item, rosterIndex) && !isSocialFiller(item.title)) continue;
    log.debug(`dropping no-longer-relevant item: ${item.title}`);
    delete store[id];
    dropped += 1;
  }
  return dropped;
}

export async function collectAll({ only } = {}) {
  const sources = enabledSources().filter((s) => !only || only.includes(s.id));
  const store = await loadItems();
  const perSource = {};
  let totalAdded = 0;
  // Built once per run, not per source — degrades to null (no fantasy-only
  // matches) until `npm run roster` has been run at least once, same as
  // player-name linking does elsewhere.
  const rosterIndex = buildRosterIndex(await loadRosterCache(), ROSTER_ALIASES);

  for (const source of sources) {
    const collector = COLLECTORS[source.collector];
    if (!collector) {
      log.warn(`${source.id}: unknown collector "${source.collector}"`);
      perSource[source.id] = { error: `unknown collector ${source.collector}` };
      continue;
    }

    let raw;
    try {
      raw = await collector(source);
    } catch (err) {
      log.error(`${source.id}: ${err.message}`);
      perSource[source.id] = { error: err.message };
      continue;
    }

    const relevant = raw.filter((item) => isRelevant(source, item, rosterIndex) && !isSocialFiller(item.title));
    // Every source gets the 45-day ceiling; wires additionally get the tighter
    // window. Undated items (a handful of feeds omit pubDate) are still kept —
    // dropping them on first sight would silently lose real stories.
    const limit = source.alwaysRelevant ? MAX_ITEM_AGE_DAYS : MAX_WIRE_AGE_DAYS;
    const fresh = relevant.filter((item) => !item.publishedAt || daysAgo(item.publishedAt) <= limit);
    const capped = fresh.slice(0, MAX_ITEMS_PER_SOURCE);

    const { added } = mergeItems(store, capped);
    totalAdded += added;
    perSource[source.id] = { found: raw.length, relevant: relevant.length, fresh: fresh.length, added };
    log.info(
      `${source.id}: ${raw.length} fetched, ${relevant.length} relevant, ${fresh.length} in date, ${added} new`,
    );
    // A feed whose every item is on topic but out of date has gone stale at the
    // source. Worth saying out loud — it otherwise reads as a quiet week.
    if (relevant.length && !fresh.length) {
      log.warn(`${source.id}: nothing within the age window — feed may be abandoned upstream`);
    }
  }

  const pruned = pruneItems(store, MAX_ITEM_AGE_DAYS);
  const dropped = pruneIrrelevant(store, rosterIndex);
  await saveItems(store);
  await recordRun({ stage: 'collect', sources: sources.length, added: totalAdded, pruned, dropped });
  log.ok(
    `collect done — ${totalAdded} new item(s), ${pruned} aged out, ${dropped} no longer relevant`,
  );
  return { perSource, totalAdded, pruned, dropped };
}

/**
 * Collect the social ticker. Kept separate from collectAll so a flaky third-party
 * mirror can never take the news river down with it — the worst case is an empty
 * ticker, which the template renders as nothing at all.
 */
export async function collectSocialAll() {
  if (!SOCIAL_ENABLED) {
    log.info('social collection disabled (SOCIAL_ENABLED=false)');
    return { totalAdded: 0, perAccount: {} };
  }

  const store = await loadSocial();
  const perAccount = {};
  let totalAdded = 0;

  for (const account of SOCIAL_ACCOUNTS) {
    let posts = [];
    try {
      posts = await collectAccount(account);
    } catch (err) {
      log.error(`social @${account.handle}: ${err.message}`);
      perAccount[`@${account.handle}`] = { error: err.message };
      continue;
    }

    const kept = posts.filter((p) => keepSocialPost(p, account.alwaysRelevant));
    const { added } = mergeSocial(store, kept);
    totalAdded += added;
    perAccount[`@${account.handle}`] = { found: posts.length, kept: kept.length, added };
    log.info(`@${account.handle}: ${posts.length} fetched, ${kept.length} kept, ${added} new`);
  }

  for (const entry of SOCIAL_TAGS) {
    let posts = [];
    try {
      posts = await collectTag(entry);
    } catch (err) {
      log.error(`social ${entry.name}: ${err.message}`);
      perAccount[entry.name] = { error: err.message };
      continue;
    }

    // Tag timelines are never trusted on their own — see config/social.js.
    const kept = posts.filter((p) => keepSocialPost(p, false));
    const { added } = mergeSocial(store, kept);
    totalAdded += added;
    perAccount[entry.name] = { found: posts.length, kept: kept.length, added };
    log.info(`${entry.name}: ${posts.length} fetched, ${kept.length} kept, ${added} new`);
  }

  const removed = pruneSocial(store);
  await saveSocial(store);
  await recordRun({ stage: 'social', added: totalAdded, pruned: removed });
  log.ok(`social done — ${totalAdded} new post(s), ${removed} pruned`);
  return { totalAdded, perAccount };
}

/**
 * Reads the browser-only accounts (see SOCIAL_BROWSER_ACCOUNTS in
 * config/social.js) and merges them into the same store collectSocialAll()
 * writes to. Kept as its own entry point, called only from `npm run
 * x-scrape`, never from collectAll/collectSocialAll or a GitHub Actions
 * workflow — this needs a real logged-in Chrome profile on the machine that
 * runs it, which a CI runner doesn't have.
 */
export async function collectSocialBrowser() {
  const store = await loadSocial();
  const perAccount = {};
  let totalAdded = 0;
  // Set true if any account's session looks expired. The CLI turns this
  // into a non-zero exit code, so the Windows Scheduled Task running this
  // shows a failed "Last Run Result" — that native history is the failsafe,
  // not a bespoke alert — see docs/x-browser-scraping.md.
  let sessionExpired = false;

  for (const account of SOCIAL_BROWSER_ACCOUNTS) {
    let posts = [];
    try {
      const result = await collectXProfile(account);
      posts = result.posts;
      if (result.sessionExpired) sessionExpired = true;
    } catch (err) {
      log.error(`x-browser @${account.handle}: ${err.message}`);
      perAccount[`@${account.handle}`] = { error: err.message };
      continue;
    }

    const kept = posts.filter((p) => keepSocialPost(p, account.alwaysRelevant));
    const { added } = mergeSocial(store, kept);
    totalAdded += added;
    perAccount[`@${account.handle}`] = { found: posts.length, kept: kept.length, added };
    log.info(`@${account.handle}: ${posts.length} fetched, ${kept.length} kept, ${added} new`);
  }

  const removed = pruneSocial(store);
  await saveSocial(store);
  await recordRun({ stage: 'social-browser', added: totalAdded, pruned: removed, sessionExpired });
  log.ok(`x-scrape done — ${totalAdded} new post(s), ${removed} pruned`);
  return { totalAdded, perAccount, sessionExpired };
}
