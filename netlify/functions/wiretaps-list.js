import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';

/**
 * Mailbag questions for the admin panel, newest first.
 *
 * Keys are `q:<iso>:<id>` (see submission-created.js), so the listing comes
 * back in chronological order and only needs reversing. Each blob is fetched
 * individually because the list API returns keys, not contents; there will
 * never be enough questions here for that to matter.
 */
export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('wiretaps');
  const { blobs } = await store.list({ prefix: 'q:' }).catch(() => ({ blobs: [] }));

  const questions = (
    await Promise.all(
      blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null)),
    )
  )
    .filter(Boolean)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  return new Response(JSON.stringify({ count: questions.length, questions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
