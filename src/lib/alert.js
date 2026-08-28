import { log } from './log.js';

/**
 * Sends the site owner an email with no new service, no new credential, and
 * no code on the receiving end: it submits the same Netlify Form the public
 * /contact.html page already uses, which Netlify already emails on every
 * submission (forwarded on to the real inbox via ImprovMX — see README).
 * A local script has no other easy way to reach an inbox without a mail
 * account of its own, and this reuses infrastructure already trusted for
 * exactly this purpose.
 */
const SITE_URL = process.env.ALERT_SITE_URL || 'https://theburgundywire.com';

export async function sendAlertEmail({ subject, message }) {
  const body = new URLSearchParams({
    'form-name': 'contact',
    name: 'Burgundy Wire automation',
    email: 'noreply@theburgundywire.com',
    message: `${subject}\n\n${message}`,
  });

  try {
    const res = await fetch(`${SITE_URL}/contact.html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      log.warn(`alert: contact form submission returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    log.warn(`alert: could not reach ${SITE_URL} (${err.message})`);
    return false;
  }
}
