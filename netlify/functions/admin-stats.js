import { getStore } from '@netlify/blobs';
import { isAuthorized } from './_auth.js';
import { SOURCES } from '../../config/sources.js';

const sourceName = (id) => SOURCES.find((s) => s.id === id)?.name || id;

// Sunday-first, matching how this site's own audience thinks about a week —
// NFL Sunday is the traffic event a day-of-week chart exists to reveal, and
// burying it in the middle of a Monday-first row would be an odd way to show
// that off.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async (req) => {
  if (!isAuthorized(req)) return new Response('Unauthorized', { status: 401 });

  const store = getStore('site-stats');
  const text = (key) => store.get(key, { type: 'text' }).then((v) => Number(v || '0'));

  // Every read below is independent of every other, so the whole function is
  // one flat Promise.all rather than sequential awaits — this endpoint's read
  // volume grew a lot in this pass (14 days x2 + 12 months + 24 hours + 7
  // weekdays + several "top N" lists), and awaiting each one in turn would
  // turn a single dashboard load into dozens of round trips back to back
  // instead of all of them in flight together.
  const now = Date.now();
  const dayDates = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * 86400000).toISOString().slice(0, 10));
  // Anchored to the 1st of the target month before formatting, not computed
  // by subtracting months from "now" directly — subtracting from a day above
  // 28 can overflow into the wrong month (Aug 31 minus 6 months lands on the
  // nonexistent "Feb 31," which JS silently rolls forward into March), a bug
  // that would only show up near the end of most months and stay invisible
  // the rest of the time.
  const nowParts = new Date(now);
  const monthKeys = Array.from({ length: 12 }, (_, i) => {
    const anchor = new Date(Date.UTC(nowParts.getUTCFullYear(), nowParts.getUTCMonth() - (11 - i), 1));
    return anchor.toISOString().slice(0, 7);
  });

  const topN = async (prefix, mapKey) => {
    const { blobs } = await store.list({ prefix });
    const rows = await Promise.all(
      blobs.map(async (b) => ({
        [mapKey]: decodeURIComponent(b.key.slice(prefix.length)),
        count: await text(b.key),
      })),
    );
    return rows.sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const [
    total,
    outboundTotal,
    visitorNew,
    visitorReturn,
    dayCounts,
    dayUniques,
    monthCounts,
    hourCounts,
    weekdayCounts,
    topPaths,
    topReferrers,
    topOutboundRaw,
    topBrowsers,
    topOS,
    topDevices,
    topLanguages,
  ] = await Promise.all([
    text('total'),
    text('outboundTotal'),
    text('visitor:new'),
    text('visitor:return'),
    Promise.all(dayDates.map((d) => text(`day:${d}`))),
    Promise.all(dayDates.map((d) => text(`day:${d}:uniques`))),
    Promise.all(monthKeys.map((m) => text(`month:${m}`))),
    Promise.all(Array.from({ length: 24 }, (_, h) => text(`hour:${String(h).padStart(2, '0')}`))),
    Promise.all(WEEKDAYS.map((w) => text(`dow:${w}`))),
    topN('path:', 'path'),
    topN('ref:', 'referrer'),
    topN('outbound:', 'sourceId'),
    topN('browser:', 'browser'),
    topN('os:', 'os'),
    topN('device:', 'device'),
    topN('lang:', 'language'),
  ]);

  const days = dayDates.map((date, i) => ({ date, count: dayCounts[i], uniques: dayUniques[i] }));
  const months = monthKeys.map((month, i) => ({ month, count: monthCounts[i] }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2, '0'), count: hourCounts[h] }));
  const weekdays = WEEKDAYS.map((weekday, i) => ({ weekday, count: weekdayCounts[i] }));
  const topOutbound = topOutboundRaw.map((r) => ({ ...r, sourceName: sourceName(r.sourceId) }));

  return new Response(
    JSON.stringify({
      total,
      outboundTotal,
      visitors: { new: visitorNew, returning: visitorReturn },
      days,
      months,
      hours,
      weekdays,
      topPaths,
      topReferrers,
      topOutbound,
      topBrowsers,
      topOS,
      topDevices,
      topLanguages,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
