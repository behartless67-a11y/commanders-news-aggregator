import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pollGame, parseScore } from '../../src/lib/predictions.js';

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
  if (payload.form_name === 'abroad') return captureAbroad(payload);
  if (payload.form_name === 'prediction') return capturePrediction(payload);
  if (payload.form_name === 'milestone') return captureMilestone(payload);
  return new Response('ok');
};

/**
 * The 5,000th reader saying hi (five-thousand.html). Kept in the `milestone`
 * blob store like the other surveys, and emailed to Ben on arrival, because
 * the whole point is talking to this person and a survey nobody looks at for
 * a week isn't a conversation. Reply-To is the reader's own address when they
 * leave one, so answering them is just hitting reply.
 */
const MILESTONE_FIELDS = [
  ['winner', 'Visit'],
  ['country', 'Country (from the visit)'],
  ['name', 'Name'],
  ['where', 'Reading from'],
  ['how_found', 'Found the site'],
  ['why_read', 'Why they read it'],
  ['fan_since', 'Fan since'],
  ['write_about', 'Write about next'],
  ['message', 'Anything else'],
  ['shoutout_ok', 'OK to shout them out'],
  ['email', 'Email'],
];

async function captureMilestone(payload) {
  const entry = {};
  for (const [field] of MILESTONE_FIELDS) entry[field] = String(payload.data?.[field] || '').trim().slice(0, 4000);
  const answered = MILESTONE_FIELDS.some(([field]) => !['winner', 'country'].includes(field) && entry[field]);
  if (!answered) return new Response('ok');

  const at = new Date().toISOString();
  const id = crypto.randomBytes(4).toString('hex');
  await getStore('milestone').set(`m:${at}:${id}`, JSON.stringify({ id, submittedAt: at, ...entry }));

  if (process.env.RESEND_API_KEY) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = MILESTONE_FIELDS
      .filter(([field]) => entry[field])
      .map(([field, label]) => `<p style="margin:0 0 14px"><strong>${label}</strong><br>${esc(entry[field]).replace(/\n/g, '<br>')}</p>`)
      .join('');
    const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) ? entry.email : undefined;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NEWSLETTER_FROM || 'Ben at The Burgundy Wire <newsletter@theburgundywire.com>',
        to: process.env.ADMIN_TEST_EMAIL || 'bh4hb@virginia.edu',
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `Your ${entry.winner ? entry.winner.replace(/^yes, visit /, '') : 'milestone'} reader wrote in${entry.name ? `: ${entry.name}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${rows}<p style="color:#888;font-size:12px">${replyTo ? `Hit reply to write back, and ask for their mailing address for the sticker${entry.country && entry.country !== 'US' ? 's (two, they\'re reading from abroad)' : ''}.` : 'No email left, so this one is one-way, and there\'s nowhere to send the sticker.'}</p></div>`,
      }),
    }).catch(() => {});
  }
  return new Response('ok');
}

/**
 * A reader's score for the next game, from the sidebar's "Call your shot"
 * card. The pick is the blob key itself (see src/lib/predictions.js), so the
 * value is empty.
 *
 * The game has to be the one the poll is open for, checked against the
 * schedule this deploy shipped with (netlify.toml includes it), and kickoff
 * can't have passed. The form only ever offers that game, so a pick for any
 * other one, or one sent after kickoff, came from somewhere other than the
 * form and isn't counted.
 */
async function capturePrediction(payload) {
  const game = String(payload.data?.game || '');
  const us = parseScore(payload.data?.commanders);
  const them = parseScore(payload.data?.opponent);
  if (us == null || them == null) return new Response('ok');

  let schedule = [];
  try {
    schedule = JSON.parse(await fs.readFile(path.resolve('data/schedule.json'), 'utf8'));
  } catch {
    return new Response('ok');
  }
  const open = pollGame(schedule);
  if (!open || open.key !== game || Date.now() >= Date.parse(open.iso)) return new Response('ok');

  const id = crypto.randomBytes(6).toString('hex');
  await getStore('predictions').set(`${game}/${us}-${them}/${id}`, '');
  return new Response('ok');
}

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
/**
 * "Hello from far away" survey answers (abroad.html, see assets/abroad.js), for
 * the admin panel's Readers abroad section. Every field is optional, so an
 * entry is kept as long as anything at all was filled in. Same key scheme as
 * the mailbag, so a listing comes back in order.
 */
const ABROAD_FIELDS = [
  'country', 'country_code', 'city', 'lang', 'story', 'watch', 'worst_kickoff',
  'favorite_player', 'write_about', 'mention_ok', 'mention_name', 'email',
];

async function captureAbroad(payload) {
  const entry = {};
  for (const field of ABROAD_FIELDS) {
    entry[field] = String(payload.data?.[field] || '').trim().slice(0, 4000);
  }
  const answered = ['country', 'city', 'story', 'watch', 'worst_kickoff', 'favorite_player', 'write_about', 'mention_name', 'email']
    .some((f) => entry[f]);
  if (!answered) return new Response('ok');

  const at = new Date().toISOString();
  const id = crypto.randomBytes(4).toString('hex');
  await getStore('abroad').set(`a:${at}:${id}`, JSON.stringify({ id, submittedAt: at, ...entry }));
  return new Response('ok');
}

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
