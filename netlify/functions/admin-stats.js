import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';
import { SOURCES } from '../../config/sources.js';

const sourceName = (id) => SOURCES.find((s) => s.id === id)?.name || id;

export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('site-stats');
  const total = Number((await store.get('total', { type: 'text' })) || '0');
  const outboundTotal = Number((await store.get('outboundTotal', { type: 'text' })) || '0');

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const [countRaw, uniquesRaw] = await Promise.all([
      store.get(`day:${date}`, { type: 'text' }),
      store.get(`day:${date}:uniques`, { type: 'text' }),
    ]);
    days.push({ date, count: Number(countRaw || '0'), uniques: Number(uniquesRaw || '0') });
  }

  // Same shape and cap for all three "top N" lists — read every blob under a
  // prefix, resolve its count, sort, keep the top 10. topOutbound additionally
  // resolves the stored sourceId to its config/sources.js display name, so
  // the dashboard doesn't have to know that "hogs-haven" means Hogs Haven.
  const topN = async (prefix, mapKey) => {
    const { blobs } = await store.list({ prefix });
    const rows = await Promise.all(
      blobs.map(async (b) => ({
        [mapKey]: decodeURIComponent(b.key.slice(prefix.length)),
        count: Number((await store.get(b.key, { type: 'text' })) || '0'),
      })),
    );
    return rows.sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const [topPaths, topReferrers, topOutboundRaw] = await Promise.all([
    topN('path:', 'path'),
    topN('ref:', 'referrer'),
    topN('outbound:', 'sourceId'),
  ]);
  const topOutbound = topOutboundRaw.map((r) => ({ ...r, sourceName: sourceName(r.sourceId) }));

  return new Response(JSON.stringify({ total, days, topPaths, topReferrers, outboundTotal, topOutbound }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
