import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

/**
 * Netlify calls this function automatically whenever ANY Netlify Form on the
 * site is submitted (special naming convention), so it dispatches on
 * form_name. Netlify keeps its own copy of every submission regardless of
 * what happens here, which is the only reason the first Wire Taps questions
 * weren't lost while this function was still ignoring them.
 *
 * Anything that isn't recognised is a no-op rather than an error: the
 * contact form is handled by Netlify's own email notification and has no
 * blob of its own.
 */
export default async (req) => {
  // Netlify wraps the legacy submission-created body as { payload: {...} };
  // form_name and data live one level down, not on the parsed body itself.
  const { payload } = await req.json().catch(() => ({}));
  if (!payload) return new Response('ok');

  if (payload.form_name === 'email-subscribe') return captureSubscriber(payload);
  if (payload.form_name === 'wiretaps') return captureWireTap(payload);
  return new Response('ok');
};

/**
 * The unsubscribe token is HMAC-SHA256(email, RESEND_API_KEY) — verifiable
 * without a separate lookup, and useless to guess without the secret.
 */
async function captureSubscriber(payload) {
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

  const count = Number((await store.get('count', { type: 'text' }).catch(() => '0')) || '0');
  await store.set('count', String(count + 1));

  return new Response('ok');
}

/**
 * Mailbag questions, for the Wire Taps page.
 *
 * Keyed by submission time so a lexicographic blob listing is already in
 * chronological order, which is the only sort the admin panel needs. The
 * random suffix only exists to keep two questions submitted in the same
 * millisecond from overwriting each other.
 *
 * `name` is optional on the form and stays optional here: "anonymous is
 * fine" is a promise the page makes, so an empty name is stored as empty
 * rather than backfilled from anything else in the payload.
 */
async function captureWireTap(payload) {
  const question = String(payload.data?.question || '').trim();
  if (!question) return new Response('ok');

  const at = new Date().toISOString();
  const id = crypto.randomBytes(4).toString('hex');

  await getStore('wiretaps').set(`q:${at}:${id}`, JSON.stringify({
    id,
    name: String(payload.data?.name || '').trim(),
    question,
    submittedAt: at,
    status: 'new',
  }));

  return new Response('ok');
}
