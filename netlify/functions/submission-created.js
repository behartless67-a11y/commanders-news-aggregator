import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

/**
 * Netlify calls this function automatically whenever any Netlify Form is
 * submitted (special naming convention). We filter for the email-subscribe
 * form and save the address to the subscribers blob store.
 *
 * The unsubscribe token is HMAC-SHA256(email, RESEND_API_KEY) — verifiable
 * without a separate lookup, and useless to guess without the secret.
 */
export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  if (payload.form_name !== 'email-subscribe') return new Response('ok');

  const email = String(payload.data?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return new Response('ok');

  const store = getStore('subscribers');
  const existing = await store.get(`sub:${email}`, { type: 'json' }).catch(() => null);
  if (existing) return new Response('ok'); // already subscribed

  const token = crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || 'fallback')
    .update(email)
    .digest('hex');

  await store.set(`sub:${email}`, JSON.stringify({
    email,
    subscribedAt: new Date().toISOString(),
    token,
  }));

  // Increment counter
  const count = Number((await store.get('count', { type: 'text' }).catch(() => '0')) || '0');
  await store.set('count', String(count + 1));

  return new Response('ok');
};
