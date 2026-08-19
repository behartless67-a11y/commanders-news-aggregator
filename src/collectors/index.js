import { enabledSources } from '../../config/sources.js';
import { log } from '../lib/log.js';
import { isRelevant } from '../lib/relevance.js';
import { daysAgo } from '../lib/dates.js';
import { loadItems, saveItems, mergeItems, recordRun } from '../lib/store.js';
import { collect as collectRss } from './rss.js';

const COLLECTORS = { rss: collectRss };

const MAX_ITEM_AGE_DAYS = Number(process.env.MAX_ITEM_AGE_DAYS || 14);
const MAX_ITEMS_PER_SOURCE = Number(process.env.MAX_ITEMS_PER_SOURCE || 15);

export async function collectAll({ only } = {}) {
  const sources = enabledSources().filter((s) => !only || only.includes(s.id));
  const store = await loadItems();
  const perSource = {};
  let totalAdded = 0;

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

    const relevant = raw.filter((item) => isRelevant(source, item));
    // The age window only applies to league-wide wires (ESPN/PFT/CBS/Yahoo),
    // which publish continuously — an old-dated item there really is stale.
    // The team's own feed (commanders.com) is a slow, curated editorial feed
    // that mixes 2022 draft-pick recaps with this month's posts in no
    // particular order, so gating it by age would drop nearly everything it
    // has; it's low-volume enough that the page-length cap in build.js
    // handles it instead. Undated items (a handful of feeds omit pubDate)
    // are always kept — dropping them on first sight would silently lose
    // real stories.
    const fresh = source.alwaysRelevant
      ? relevant
      : relevant.filter((item) => !item.publishedAt || daysAgo(item.publishedAt) <= MAX_ITEM_AGE_DAYS);
    const capped = fresh.slice(0, MAX_ITEMS_PER_SOURCE);

    const { added } = mergeItems(store, capped);
    totalAdded += added;
    perSource[source.id] = { found: raw.length, relevant: relevant.length, added };
    log.info(`${source.id}: ${raw.length} fetched, ${relevant.length} relevant, ${added} new`);
  }

  await saveItems(store);
  await recordRun({ stage: 'collect', sources: sources.length, added: totalAdded });
  log.ok(`collect done — ${totalAdded} new item(s)`);
  return { perSource, totalAdded };
}
