import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';

export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('site-stats');
  const total = Number((await store.get('total', { type: 'text' })) || '0');

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const count = Number((await store.get(`day:${date}`, { type: 'text' })) || '0');
    days.push({ date, count });
  }

  const { blobs } = await store.list({ prefix: 'path:' });
  const topPaths = (
    await Promise.all(
      blobs.map(async (b) => ({
        path: decodeURIComponent(b.key.slice('path:'.length)),
        count: Number((await store.get(b.key, { type: 'text' })) || '0'),
      })),
    )
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return new Response(JSON.stringify({ total, days, topPaths }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
