import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';
import crypto from 'node:crypto';

const SITE_URL = process.env.SITE_URL || 'https://theburgundywire.com';
const FROM = process.env.NEWSLETTER_FROM || 'Ben at The Burgundy Wire <newsletter@theburgundywire.com>';

function unsubscribeUrl(email) {
  const token = crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || 'fallback')
    .update(email)
    .digest('hex');
  return `${SITE_URL}/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

function buildHtml(subject, body, email) {
  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
<style>
  body { margin: 0; padding: 0; background: #14100f; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .wrap { max-width: 680px; margin: 0 auto; background: #1a1414; width: 100%; }
  .header {
    background: linear-gradient(160deg, rgba(90,20,20,0.55) 0%, rgba(20,16,15,0.92) 100%), #14100f;
    padding: 36px 32px 28px;
    text-align: center;
    border-bottom: 3px solid #FFB612;
  }
  .header img { height: 60px; max-height: 60px; width: auto; max-width: 200px; filter: drop-shadow(3px 3px 0 rgba(0,0,0,0.9)); display: block; margin: 0 auto; }
  .header-stars { font-size: 16px; margin: 8px 0 4px; letter-spacing: 6px; }
  .header p { color: #a89f9b; font-size: 11px; margin: 4px 0 0; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; }
  .body { padding: 32px; color: #efe9e4; font-size: 15px; line-height: 1.65; }
  .body h1 { color: #FFB612; font-size: 22px; margin: 0 0 20px; line-height: 1.3; }
  .body p { margin: 0 0 16px; color: #efe9e4; }
  .cta { display: inline-block; background: #FFB612; color: #0a0807; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 8px 0 24px; }
  .footer { padding: 24px 32px; border-top: 1px solid rgba(255,182,18,0.15); text-align: center; }
  .footer p { color: #7c7370; font-size: 12px; margin: 0 0 6px; }
  .footer a { color: #a89f9b; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <img src="${SITE_URL}/logo.png" alt="The Burgundy Wire" width="200" height="93" />
    <div class="header-stars">&#9733; &#9733; &#9733;</div>
    <p>Sports &middot; News &middot; DC</p>
  </div>
  <div class="body">
    ${body}
    <p><a class="cta" href="${SITE_URL}/blog.html">Read on the site</a></p>
  </div>
  <div class="footer">
    <p>You're getting this because you signed up at theburgundywire.com.</p>
    <p><a href="${unsubscribeUrl(email)}">Unsubscribe</a> anytime. No hard feelings.</p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Admin-protected endpoint. POST { subject, body } to send to all subscribers.
 * `body` is plain HTML paragraphs — the function wraps it in the email template.
 * Returns { sent, failed } counts.
 */
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  if (!process.env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 501 });
  }

  const { subject, body, testOnly } = await req.json().catch(() => ({}));
  if (!subject || !body) {
    return new Response(JSON.stringify({ error: 'subject and body required' }), { status: 400 });
  }

  // Test mode: send only to the site owner
  if (testOnly) {
    const TEST_EMAIL = process.env.ADMIN_TEST_EMAIL || 'bh4hb@virginia.edu';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: TEST_EMAIL, subject: `[TEST] ${subject}`, html: buildHtml(subject, body, TEST_EMAIL) }),
    });
    return new Response(JSON.stringify({ sent: res.ok ? 1 : 0, test: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const store = getStore('subscribers');
  const { blobs } = await store.list({ prefix: 'sub:' }).catch(() => ({ blobs: [] }));

  if (!blobs.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, message: 'No subscribers yet.' }));
  }

  let sent = 0;
  let failed = 0;

  for (const blob of blobs) {
    const email = blob.key.replace('sub:', '');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject,
          html: buildHtml(subject, body, email),
        }),
      });
      if (res.ok) { sent++; } else { failed++; }
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
