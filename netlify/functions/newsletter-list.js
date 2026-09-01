import { getStore, listStores } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';

/** Returns the subscriber count and list for the admin panel. */
export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('subscribers');
  const count = Number((await store.get('count', { type: 'text' }).catch(() => '0')) || '0');

  // List all sub: keys to get actual emails
  const { blobs } = await store.list({ prefix: 'sub:' }).catch(() => ({ blobs: [] }));
  const emails = blobs.map((b) => b.key.replace('sub:', ''));

  return new Response(JSON.stringify({ count, emails }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
