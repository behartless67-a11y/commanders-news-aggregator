import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

/**
 * One-click unsubscribe. Called from the link in every email:
 *   /unsubscribe?email=xxx&token=yyy
 *
 * The token is HMAC-SHA256(email, RESEND_API_KEY) — same as what
 * submission-created.js stores — so we can verify without a database lookup.
 */
export default async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  const token = url.searchParams.get('token') || '';

  if (!email || !token) return new Response('Missing parameters.', { status: 400 });

  const expected = crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || 'fallback')
    .update(email)
    .digest('hex');

  if (token !== expected) return new Response('Invalid token.', { status: 403 });

  const store = getStore('subscribers');
  const existing = await store.get(`sub:${email}`, { type: 'text' }).catch(() => null);
  if (existing) {
    await store.delete(`sub:${email}`);
    const count = Number((await store.get('count', { type: 'text' }).catch(() => '0')) || '0');
    if (count > 0) await store.set('count', String(count - 1));
  }

  return new Response(`
    <!doctype html><html><head><meta charset="UTF-8">
    <title>Unsubscribed</title>
    <style>body{font-family:sans-serif;background:#14100f;color:#efe9e4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}p{color:#a89f9b}</style>
    </head><body>
    <div><h1 style="color:#FFB612">You're unsubscribed.</h1>
    <p>You won't hear from us again. We're sorry to see you go.<br>
    <a href="https://theburgundywire.com" style="color:#FFB612">Back to the site</a></p></div>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } });
};
