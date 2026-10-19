import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pollGame, parseScore, playerFor } from '../../src/lib/predictions.js';

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
  if (payload.form_name === 'rollcall') return captureRollCall(payload);
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
 * Roll call (roll-call.html): any reader telling Ben about themselves. Same
 * treatment as the 5,000th reader: kept in its own blob store for the admin
 * panel's Roll call section, and emailed to Ben the moment it arrives, with
 * Reply-To set to the reader when they leave an address. `share` says what
 * Ben may do with it ("no" unless the reader picked otherwise, and anything
 * unexpected reads as "no"), and the email leads with it so it's the first
 * thing he sees.
 */
const ROLLCALL_FIELDS = [
  ['name', 'Name'],
  ['where', 'Reading from'],
  ['story', 'How they became a fan'],
  ['watch', 'Watches the games'],
  ['ritual', 'Game-day ritual'],
  ['favorite_player', 'Favorite player'],
  ['not_over', 'Still not over'],
  ['write_about', 'Write about'],
  ['email', 'Email'],
  ['via', 'Came from'],
];
const ROLLCALL_SHARE = {
  no: 'Just for you. Do not share.',
  anon: 'OK to share, but leave their name out.',
  name: 'OK to share, with their name and where they are from.',
};

async function captureRollCall(payload) {
  const entry = {};
  for (const [field] of ROLLCALL_FIELDS) entry[field] = String(payload.data?.[field] || '').trim().slice(0, 4000);
  const share = String(payload.data?.share || '');
  entry.share = ROLLCALL_SHARE[share] ? share : 'no';
  const answered = ROLLCALL_FIELDS.some(([field]) => field !== 'via' && entry[field]);
  if (!answered) return new Response('ok');

  const at = new Date().toISOString();
  const id = crypto.randomBytes(4).toString('hex');
  await getStore('rollcall').set(`r:${at}:${id}`, JSON.stringify({ id, submittedAt: at, ...entry }));

  if (process.env.RESEND_API_KEY) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = ROLLCALL_FIELDS
      .filter(([field]) => entry[field])
      .map(([field, label]) => `<p style="margin:0 0 14px"><strong>${label}</strong><br>${esc(entry[field]).replace(/\n/g, '<br>')}</p>`)
      .join('');
    const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) ? entry.email : undefined;
    const who = [entry.name, entry.where].filter(Boolean).join(' from ');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NEWSLETTER_FROM || 'Ben at The Burgundy Wire <newsletter@theburgundywire.com>',
        to: process.env.ADMIN_TEST_EMAIL || 'bh4hb@virginia.edu',
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `Roll call${who ? `: ${who}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222"><p style="margin:0 0 18px;padding:10px 12px;background:#f6f1e6;border-left:4px solid #FFB612"><strong>Sharing:</strong> ${ROLLCALL_SHARE[entry.share]}</p>${rows}<p style="color:#888;font-size:12px">${replyTo ? 'Hit reply to write back.' : 'No email left, so this one is one-way.'}</p></div>`,
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

  // Both optional. A name puts the pick on the season leaderboard (one per
  // name per game, so a second pick replaces the first; see buildBoard() in
  // src/lib/predictions.js). An email signs the reader up for Hail Mail, which
  // the form says in so many words.
  const player = playerFor(payload.data?.name);
  if (player) {
    await getStore('leaderboard').set(`${game}/${player.slug}`, JSON.stringify({
      name: player.name, commanders: us, opponent: them, submittedAt: new Date().toISOString(),
    }));
  }
  const email = String(payload.data?.email || '').trim().toLowerCase();
  if (email) await subscribe(email, 'poll');
  return new Response('ok');
}

/**
 * The unsubscribe token is HMAC-SHA256(email, RESEND_API_KEY) — verifiable
 * without a separate lookup, and useless to guess without the secret.
 */
async function captureSubscriber(payload) {
  // Which form, plus the link tag the visit arrived on ("popup:reddit"); see
  // the email-subscribe handler in site.js. The one way to learn which of the
  // growth ideas in docs/viewership-deep-dive.md actually bring readers in.
  const src = String(payload.data?.src || '').trim().slice(0, 40);
  await subscribe(String(payload.data?.email || '').trim().toLowerCase(), src);
  return new Response('ok');
}

/** Shared by the Hail Mail forms and the poll's optional email. */
async function subscribe(email, src) {
  if (!email || !email.includes('@')) return;

  const store = getStore('subscribers');
  const existing = await store.get(`sub:${email}`, { type: 'json' }).catch(() => null);
  if (existing) return; // already subscribed

  const token = crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || 'fallback')
    .update(email)
    .digest('hex');

  await store.set(`sub:${email}`, JSON.stringify({
    email,
    subscribedAt: new Date().toISOString(),
    token,
    ...(src ? { src } : {}),
  }));

  const count = Number((await store.get('count', { type: 'text' }).catch(() => '0')) || '0');
  await store.set('count', String(count + 1));

  await sendWelcome(email, token);
}

const SITE = process.env.SITE_URL || 'https://theburgundywire.com';

/**
 * The first email a new subscriber gets: what Hail Mail is, two places to
 * start, and one question to answer by replying. Replies go to the From
 * address, which the domain's mail forwarding (ImprovMX) passes on to Ben.
 * They're the conversation the newsletter is for, and they feed Wire Taps.
 * Same unsubscribe link as every issue. A failed send costs nothing: the
 * reader is already on the list.
 */
async function sendWelcome(email, token) {
  if (!process.env.RESEND_API_KEY) return;
  const unsub = `${SITE}/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
  const p = (s) => `<p style="margin:0 0 16px">${s}</p>`;
  const link = (href, text) => `<a href="${SITE}/${href}?via=hailmail" style="color:#7a1c1c;font-weight:700">${text}</a>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#222;max-width:560px">
${p('Hey, it\'s Ben.')}
${p('Thanks for signing up for Hail Mail. Here\'s the deal: before every Commanders game, one email from me. My score, the crowd\'s score, who\'s in and who\'s out, and the one thing that made me yell at the TV that week. No spam, no ads, and nobody else gets your address.')}
${p('If you\'re new around here, start with these:')}
<ul style="margin:0 0 16px;padding-left:20px">
<li style="margin-bottom:6px">${link('blog-original-how-a-crt-tv-a-ditch-and-the-internet-made-me-a-lifer', 'How a CRT TV, a Ditch, and the Internet Made Me a Lifer')} (the origin story)</li>
<li>${link('blog', 'Everything I\'ve written so far')}</li>
</ul>
${p('And one question, because I genuinely want to know: <strong>what\'s your Commanders origin story?</strong> Hit reply and tell me. I read every one.')}
${p('Hail,<br>Ben')}
<p style="margin:24px 0 0;font-size:12px;color:#888"><a href="${SITE}" style="color:#888">theburgundywire.com</a> &middot; <a href="${unsub}" style="color:#888">Unsubscribe</a> anytime. No hard feelings.</p>
</div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_FROM || 'Ben at The Burgundy Wire <newsletter@theburgundywire.com>',
      to: email,
      subject: 'You\'re on the Hail Mail list',
      html,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  }).catch(() => {});
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
