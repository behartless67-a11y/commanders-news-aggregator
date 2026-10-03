import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';

/**
 * "Hello from far away" survey answers for the admin panel, newest first.
 * Same shape as wiretaps-list.js: keys are `a:<iso>:<id>` (see
 * submission-created.js), so the listing is chronological and only needs
 * reversing.
 */
export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('abroad');
  const { blobs } = await store.list({ prefix: 'a:' }).catch(() => ({ blobs: [] }));

  const entries = (
    await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null)))
  )
    .filter(Boolean)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  return new Response(JSON.stringify({ count: entries.length, entries }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
