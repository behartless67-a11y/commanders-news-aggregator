const TZ = process.env.SITE_TZ || 'America/New_York';

export function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatDate(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function daysAgo(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return Infinity;
  return (Date.now() - date.getTime()) / 86400000;
}

/** Short relative label for the river ("just now", "3h ago", "2d ago"), falling back to a date. */
export function relativeLabel(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const minutes = (Date.now() - date.getTime()) / 60000;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return formatDate(iso);
}

export function rfc822(iso) {
  const date = iso ? new Date(iso) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString();
}

/**
 * Commanders.com's schedule page emits "MM/DD/YYYY HH:mm:ss ±HH:mm" rather
 * than ISO — parsed explicitly rather than handed to `new Date()` directly,
 * since that format isn't guaranteed portable across JS engines even though
 * V8 happens to accept it.
 */
export function parseGameTime(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}:?\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min, ss, offset] = m;
  const normalizedOffset = offset.includes(':') ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return toIso(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${normalizedOffset}`);
}

export { TZ };
