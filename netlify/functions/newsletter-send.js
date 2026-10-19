import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pollGame } from '../../src/lib/predictions.js';

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
 * A "bulletproof" button, in two versions.
 *
 * Desktop Outlook (Word's layout engine) gets a VML roundrect inside an
 * [if mso] comment: a fixed-size shape it draws itself, with real rounded
 * corners and its label centered in it. The first version of this button was
 * a colored table cell, and in Outlook (Oct 19, "Report for roll call") it
 * came out a tall square block with the next paragraph jammed against it:
 * Word ignores margin on a table, so the gap below vanished, and it sized
 * the box off the link's inherited 1.65 line height.
 *
 * Everyone else gets a pill-shaped table cell, gold with a darker gold edge
 * along the bottom, the label and an arrow. The space around it is padding
 * on a wrapping cell rather than margin, and every line height is set in
 * pixels (mso-line-height-rule: exactly), so nothing is left to inherit.
 *
 * The VML shape needs a width up front; it's estimated from the label at
 * roughly 9px a character in 15px bold, plus the side padding.
 */
function button(href, label) {
  const text = `${label}&nbsp;&rarr;`;
  const vmlWidth = Math.max(180, Math.round(String(label).length * 9 + 72));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:8px 0 26px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="50%" stroke="f" fillcolor="#FFB612">
          <w:anchorlock/>
          <center style="color:#14100f;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#FFB612" style="background:#FFB612;border-radius:999px;border-bottom:3px solid #c48c0a;padding:12px 28px;line-height:20px;mso-line-height-rule:exactly;">
            <a href="${href}" style="color:#14100f;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;letter-spacing:0.2px;text-decoration:none;display:inline-block;">${text}</a>
          </td></tr>
        </table>
        <!--<![endif]-->
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

/**
 * One line under every issue sent while a game's picks are open: what's
 * your number, and a link to the poll. Ben doesn't have to remember to ask,
 * and an issue that already links to the poll itself doesn't get it twice.
 * The link lands on the poll card (site.js sends phones to the river's copy).
 */
async function openPoll() {
  try {
    const schedule = JSON.parse(await fs.readFile(path.resolve('data/schedule.json'), 'utf8'));
    const poll = pollGame(schedule);
    return poll && Date.parse(poll.iso) > Date.now() ? poll : null;
  } catch {
    return null;
  }
}

function pollAsk(poll, body) {
  if (!poll || /call-your-shot/.test(body)) return '';
  const kickoff = new Date(poll.iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit',
  });
  const href = `${SITE_URL}/index.html?via=hailmail#call-your-shot`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
      <tr><td style="padding:16px 18px;border:1px solid #3a2b16;border-radius:6px;">
        <p style="margin:0 0 4px;color:#a89f9b;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Call your shot</p>
        <p style="margin:0;color:#efe9e4;font-family:${FONT};font-size:15px;line-height:1.6;">What's your number for the ${poll.opponent}? Picks lock at kickoff, ${kickoff} ET, and the season leaderboard is keeping score. <a href="${href}" style="${LINK_STYLE}font-weight:700;">Make your pick</a></p>
      </td></tr>
    </table>`;
}

function buildHtml(subject, body, email, poll = null) {
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
        ${pollAsk(poll, body)}
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

  const poll = await openPoll();

  // Test mode: send only to the site owner
  if (testOnly) {
    const TEST_EMAIL = process.env.ADMIN_TEST_EMAIL || 'bh4hb@virginia.edu';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: TEST_EMAIL, subject: `[TEST] ${subject}`, html: buildHtml(subject, body, TEST_EMAIL, poll) }),
    });
    return new Response(JSON.stringify({ sent: res.ok ? 1 : 0, test: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const store = getStore('subscribers');
  const { blobs } = await store.list({ prefix: 'sub:' }).catch(() => ({ blobs: [] }));

  if (!blobs.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, message: 'No subscribers yet.' }));
  }

  // Each subscriber is one call to Resend's /emails, and Resend's free plan
  // allows 100 of those a day, shared with welcome emails, test sends and the
  // 5,000th-reader note. Past it, a send fails partway through and the only
  // trace is a "failed" count. Better to refuse the whole send with a reason
  // than mail half the list. The fix when this trips is moving the send to
  // Resend Broadcasts (free up to 1,000 contacts, no daily cap), which needs a
  // real send to test against, so it waits until the list is close.
  const DAILY_HEADROOM = 90;
  if (blobs.length > DAILY_HEADROOM) {
    return new Response(JSON.stringify({
      error: `Hail Mail has ${blobs.length} subscribers, past the ${DAILY_HEADROOM} Resend's free plan can safely send in a day. Time to switch the send to Resend Broadcasts (see docs/viewership-deep-dive.md, 3.6).`,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // One request per 100 subscribers to Resend's batch endpoint, not one per
  // subscriber. The one-at-a-time loop this replaced ran straight into the
  // free plan's 2-requests-a-second limit: the Oct 15 issue went out "Sent 13,
  // 1 failed," with no way to tell who the one was. A batch is one request, so
  // there's no rate to trip, and it can't run past the function timeout as
  // the list grows.
  //
  // Everyone a batch reaches is logged under this issue (newsletter-sent,
  // "<issue>/<email>", the issue being a hash of the subject), and anyone
  // already logged is skipped. So after a partial failure, pressing "Send to
  // all subscribers" again reaches only the people who missed it, and a
  // double-click can't mail anyone twice. The Idempotency-Key covers the gap
  // between two clicks landing before the log is written.
  const issue = crypto.createHash('sha256').update(subject).digest('hex').slice(0, 16);
  const log = getStore('newsletter-sent');
  const { blobs: already } = await log.list({ prefix: `${issue}/` }).catch(() => ({ blobs: [] }));
  const done = new Set(already.map((b) => b.key.slice(issue.length + 1)));
  const emails = blobs.map((b) => b.key.replace('sub:', '')).filter((e) => !done.has(e));
  const skipped = blobs.length - emails.length;

  let sent = 0;
  const failedEmails = [];
  const errors = [];
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const key = `hailmail-${issue}-${crypto.createHash('sha256').update(chunk.join(',')).digest('hex').slice(0, 16)}`;
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify(chunk.map((email) => ({
          from: FROM,
          to: email,
          subject,
          html: buildHtml(subject, body, email, poll),
          // The unsubscribe button Gmail and Apple Mail show next to the
          // sender. The POST variant is the one-click kind; unsubscribe.js
          // reads the email and token from the query string, so a POST to the
          // same URL works as-is.
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl(email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }))),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        failedEmails.push(...chunk);
        errors.push(data.message || `Resend said ${res.status}`);
        continue;
      }
      sent += chunk.length;
      const at = new Date().toISOString();
      await Promise.all(chunk.map((email) => log.set(`${issue}/${email}`, at).catch(() => {})));
    } catch (err) {
      failedEmails.push(...chunk);
      errors.push(String(err.message || err));
    }
  }

  return new Response(JSON.stringify({ sent, failed: failedEmails.length, failedEmails, skipped, errors }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
