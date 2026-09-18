/**
 * TV network name (as commanders.com's own schedule page spells it, see
 * src/lib/schedule.js) to that network's own live-stream landing page.
 *
 * Each URL was verified by hand with a direct curl before being added here,
 * same policy as config/sources.js. Deliberately the network's general watch
 * hub, not a link to this specific game: none of these networks expose a
 * stable, predictable per-game URL, and a wrong guessed one would be worse
 * than a real page that just requires picking the game once there.
 *
 * A network with no entry here (a Deportes-only feed on a network that has no
 * separate watch page, or a name commanders.com hasn't used yet) renders with
 * no link, not a guessed URL.
 */
export const BROADCAST_URLS = {
  FOX: 'https://www.fox.com/live/',
  CBS: 'https://www.cbs.com/live-tv/',
  NBC: 'https://www.nbc.com/live',
  ABC: 'https://abc.com/watch-live',
  ESPN: 'https://www.espn.com/watch/',
  'ESPN DEPORTES': 'https://www.espn.com/watch/',
  'NFL NETWORK': 'https://www.nfl.com/network/watch/nfl-network-live',
  'AMAZON PRIME': 'https://www.amazon.com/gp/video/storefront',
};
