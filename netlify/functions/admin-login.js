import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { checkPassword, createSessionCookie } from './_auth.js';

/**
 * Admin login, with a lockout. Until Oct 21 anyone could POST password
 * guesses here as fast as they liked; the only thing standing between a
 * guesser and the admin panel was the password itself.
 *
 * Now: MAX_FAILS wrong passwords from one address inside WINDOW_MS locks
 * that address out for LOCK_MS, and every wrong password costs a short
 * delay. Counted per address, not site-wide, on purpose: a site-wide lock
 * would let anyone lock Ben out of his own admin panel just by guessing.
 *
 * The address is never stored as-is: the key is a salted hash of it, which
 * is enough to count attempts and useless for anything else. A correct
 * password clears the count. If the store can't be reached, login still
 * works (fail open on the counter, never on the password check itself).
 */
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const FAIL_DELAY_MS = 600;

const json = (body, status, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

function keyFor(req, context) {
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const salt = process.env.ADMIN_SESSION_SECRET || '';
  return `ip:${crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)}`;
}

// The store is passed in so the lockout can be tested without Netlify.
export async function login(req, context, store) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const key = keyFor(req, context);
  const now = Date.now();
  const record = (await store.get(key, { type: 'json' }).catch(() => null)) || { fails: 0, first: now, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const wait = Math.ceil((record.lockedUntil - now) / 1000);
    return json({ ok: false, locked: true, retryAfter: wait }, 429, { 'Retry-After': String(wait) });
  }

  const body = await req.json().catch(() => ({}));
  if (!checkPassword(body.password)) {
    // A fresh window once the old one has run out.
    const fresh = now - record.first > WINDOW_MS;
    const fails = (fresh ? 0 : record.fails) + 1;
    const next = {
      fails,
      first: fresh ? now : record.first,
      lockedUntil: fails >= MAX_FAILS ? now + LOCK_MS : 0,
    };
    await store.setJSON(key, next).catch(() => {});
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return next.lockedUntil
      ? json({ ok: false, locked: true, retryAfter: LOCK_MS / 1000 }, 429, { 'Retry-After': String(LOCK_MS / 1000) })
      : json({ ok: false }, 401);
  }

  if (record.fails) await store.delete(key).catch(() => {});
  return json({ ok: true }, 200, { 'Set-Cookie': createSessionCookie() });
}

export default async (req, context) => login(req, context, getStore('admin-login'));
