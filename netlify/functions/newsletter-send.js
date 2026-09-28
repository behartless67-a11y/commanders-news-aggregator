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

/*
 * Why this is tables and inline styles, in 2026.
 *
 * Desktop Outlook renders HTML email with Word's layout engine, not a
 * browser. That engine ignores padding on <a>, padding and max-width on
 * <div>, border-radius, gradients, and much of a <style> block. The previous
 * template was built from styled divs, and in Outlook it came out as one
 * edge-to-edge column the full width of the window, text flush against the
 * left side, and "buttons" that were bare yellow highlights with no padding.
 *
 * What Word's engine *does* honor is table-cell padding and bgcolor, which is
 * why every email that looks right in Outlook is built this way. It all
 * renders the same in Gmail and Apple Mail, which handle tables fine.
 */
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const P_STYLE = `margin:0 0 16px;color:#efe9e4;font-family:${FONT};font-size:15px;line-height:1.65;`;
const LINK_STYLE = 'color:#FFB612;text-decoration:underline;';

/**
 * A "bulletproof" button: the color and padding live on a table cell, which
 * Outlook respects, instead of on the link, which it doesn't. Outlook still
 * drops the border-radius, so corners come out square there. Harmless.
 */
function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr><td bgcolor="#FFB612" style="background:#FFB612;border-radius:6px;padding:13px 26px;">
        <a href="${href}" style="color:#0a0807;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;display:inline-block;">${label}</a>
      </td></tr>
    </table>`;
}

/**
 * Ben keeps writing plain <p> and <a class="cta"> in the admin panel; this
 * turns them into markup Outlook will actually lay out. Inline styles
 * because Outlook applies a <style> block unreliably, and plain links get the
 * site gold because its default is a dark blue that disappears on this
 * background (a "Send me a question" link was unreadable in a test send).
 *
 * The CTA passes run first and emit links that already carry a style, so the
 * link-color pass after them, which only touches unstyled links, leaves the
 * buttons alone.
 */
function emailSafeBody(body) {
  const CTA = '<a\\b([^>]*\\bclass="cta"[^>]*)>([\\s\\S]*?)<\\/a>';
  const toButton = (m, attrs, label) => button((/\bhref="([^"]*)"/i.exec(attrs) || [])[1] || SITE_URL, label);
  return String(body)
    // A CTA wrapped in its own paragraph becomes a block button, and the <p>
    // goes with it: a table nested inside a <p> is invalid, and Outlook
    // handles invalid nesting badly.
    .replace(new RegExp(`<p[^>]*>\\s*${CTA}\\s*</p>`, 'gi'), toButton)
    .replace(new RegExp(CTA, 'gi'), toButton)
    .replace(/<a\b(?![^>]*\bstyle=)([^>]*)>/gi, `<a$1 style="${LINK_STYLE}">`)
    .replace(/<p>/gi, `<p style="${P_STYLE}">`)
    .replace(/<h1>/gi, `<h1 style="margin:0 0 20px;color:#FFB612;font-family:${FONT};font-size:22px;line-height:1.3;">`);
}

function buildHtml(subject, body, email) {
  // The template's own "Read on the site" button only when the email didn't
  // bring its own. A newsletter pointing at a specific post already has the
  // button that matters, and a second generic one underneath it read as
  // clutter in the first test send.
  const fallbackCta = /class="cta"/i.test(body) ? '' : button(`${SITE_URL}/blog.html`, 'Read on the site');
  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#14100f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#14100f" style="background:#14100f;">
  <tr><td align="center" style="padding:0;">
    <!--[if mso]><table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1a1414" style="max-width:680px;background:#1a1414;">
      <tr><td align="center" bgcolor="#14100f" style="background:#14100f;padding:36px 32px 28px;border-bottom:3px solid #FFB612;text-align:center;">
        <img src="${SITE_URL}/logo.png" alt="The Burgundy Wire" width="200" height="93" style="display:block;margin:0 auto;border:0;height:auto;max-width:200px;" />
        <p style="margin:8px 0 4px;color:#efe9e4;font-family:${FONT};font-size:16px;letter-spacing:6px;">&#9733; &#9733; &#9733;</p>
        <p style="margin:4px 0 0;color:#a89f9b;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Sports &middot; News &middot; DC</p>
      </td></tr>
      <tr><td style="padding:32px;color:#efe9e4;font-family:${FONT};font-size:15px;line-height:1.65;">
        ${emailSafeBody(body)}
        ${fallbackCta}
      </td></tr>
      <tr><td align="center" style="padding:24px 32px;border-top:1px solid #3a2b16;text-align:center;">
        <p style="margin:0 0 6px;color:#7c7370;font-family:${FONT};font-size:12px;">You're getting this because you signed up at theburgundywire.com.</p>
        <p style="margin:0;color:#7c7370;font-family:${FONT};font-size:12px;"><a href="${unsubscribeUrl(email)}" style="color:#a89f9b;text-decoration:underline;">Unsubscribe</a> anytime. No hard feelings.</p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
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
