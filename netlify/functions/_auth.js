import crypto from 'node:crypto';

/**
 * Signed-cookie sessions, not a server-side session store — a Function
 * invocation has no memory of the last one, so "is this visitor logged in"
 * has to be provable from the cookie alone. The cookie carries its own
 * expiry plus an HMAC over that expiry (keyed by ADMIN_SESSION_SECRET); a
 * forged or expired cookie fails verification without ever touching a
 * database. One shared admin password, not per-user accounts — this site
 * has exactly one admin.
 */

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function sign(expiry) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(String(expiry)).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function checkPassword(password) {
  if (!password || !process.env.ADMIN_PASSWORD_HASH) return false;
  const hash = crypto.createHash('sha256').update(String(password)).digest('hex');
  return timingSafeEqualStr(hash, process.env.ADMIN_PASSWORD_HASH);
}

export function createSessionCookie() {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `${expiry}.${sign(expiry)}`;
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** `req` is a standard Fetch API Request, as Netlify's own function runtime hands it to a v2 handler. */
export function isAuthorized(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const raw = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return false;

  const value = raw.slice(COOKIE_NAME.length + 1);
  const [expiryStr, sig] = value.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !sig || Math.floor(Date.now() / 1000) > expiry) return false;

  return timingSafeEqualStr(sig, sign(expiry));
}
