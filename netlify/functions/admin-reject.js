import { isAuthorized } from './_auth.js';

const OWNER = 'behartless67-a11y';
const REPO = 'commanders-news-aggregator';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

/**
 * Same mechanism as admin-approve.js (see that file's header comment for
 * why a Contents-API commit rather than a workflow trigger) — this just
 * writes status: 'rejected' instead of 'published'. build.js already only
 * ever picks up status === 'published' records, so a rejected draft simply
 * never reaches the site; no other code needed to make rejection "work."
 */
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  if (!process.env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const key = String(body.key || '').trim();
  const type = body.type === 'preview' ? 'preview' : 'weekly';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Response(JSON.stringify({ error: 'invalid key' }), { status: 400 });
  }

  const dir = type === 'preview' ? 'previews' : 'digests';
  const path = `data/${dir}/${key}.json`;
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
    return new Response(JSON.stringify({ error: 'already published — cannot reject' }), { status: 409 });
  }
  if (record.status === 'rejected') {
    return new Response(JSON.stringify({ ok: true, alreadyRejected: true }));
  }

  record.status = 'rejected';
  record.reviewedAt = new Date().toISOString();

  const putRes = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Reject ${type} ${key} via admin panel`,
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
