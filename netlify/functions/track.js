import { getStore } from '@netlify/blobs';

/**
 * Fired once per pageview by a tiny beacon in site.js — the only way to get
 * a real pageview count without a paid analytics add-on, since Netlify's own
 * CDN logs aren't exposed to a site owner on this plan. Deliberately just a
 * running total, a per-day count, and a per-path count — "basic statistics",
 * not a replacement for real analytics tooling.
 */
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json().catch(() => ({}));
  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '/';
  const day = new Date().toISOString().slice(0, 10);
  const store = getStore('site-stats');

  const bump = async (key) => {
    const current = Number((await store.get(key, { type: 'text' })) || '0');
    await store.set(key, String(current + 1));
  };

  await Promise.all([bump('total'), bump(`day:${day}`), bump(`path:${encodeURIComponent(path)}`)]);

  return new Response(null, { status: 204 });
};
