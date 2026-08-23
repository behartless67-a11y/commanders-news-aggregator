import { isAuthorized } from './_auth.js';

const OWNER = 'behartless67-a11y';
const REPO = 'commanders-news-aggregator';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

/**
 * Commits the status flip straight to the repo via GitHub's Contents API,
 * using a fine-grained token scoped to Contents: Read and write on this one
 * repo only (see netlify env GITHUB_TOKEN) — the same minimal permission a
 * bot account would get, not a personal token with broader reach.
 *
 * This Function has no way to rebuild or redeploy the site itself (the
 * token deliberately can't trigger a GitHub Actions run — that needs a
 * separate "Actions" permission this token doesn't have, and shouldn't need
 * to). Instead, .github/workflows/publish-on-approve.yml watches for a push
 * to data/digests/** and does the build+deploy — the commit this Function
 * makes is exactly what fires that.
 */
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  if (!process.env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const week = String(body.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return new Response(JSON.stringify({ error: 'invalid week' }), { status: 400 });
  }

  const path = `data/digests/${week}.json`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'burgundywire-admin',
  };

  const getRes = await fetch(`${API}/${path}`, { headers });
  if (!getRes.ok) {
    return new Response(JSON.stringify({ error: `could not read ${path} (${getRes.status})` }), { status: 502 });
  }
  const file = await getRes.json();
  const record = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));

  if (record.status === 'published') {
    return new Response(JSON.stringify({ ok: true, alreadyPublished: true }));
  }

  record.status = 'published';
  record.reviewedAt = new Date().toISOString();

  const putRes = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Approve digest ${week} via admin panel`,
      content: Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8').toString('base64'),
      sha: file.sha,
    }),
  });

  if (!putRes.ok) {
    const detail = await putRes.text();
    return new Response(JSON.stringify({ error: `commit failed (${putRes.status}): ${detail.slice(0, 300)}` }), {
      status: 502,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
