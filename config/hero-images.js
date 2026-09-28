/**
 * The header/ticker backdrop photo (see .hero in site.css) rotates through
 * this pool, one per build day (see heroImageForDate() in build.js), rather
 * than showing the same single photo forever or a different one on every
 * page load.
 *
 * These are Ben's own photos from the Week 3 home opener against Seattle,
 * 2026-09-27, cut to a wide band by scripts/process-photos.sh. They replaced
 * a pool of CC0 stock photos from Wikimedia Commons, which were hotlinked
 * from Wikimedia's CDN on purpose: with someone else's photo, serving it from
 * the source is the defensible choice and copying it to this site is not.
 * These are Ben's, so the reverse holds, and they are served from this
 * site's own origin like every other photo in a post.
 *
 * Chosen for atmosphere rather than faces, since the header sits under a
 * heavy dark scrim and appears at the top of every page for a whole day.
 * Root-relative paths, because build.js drops the chosen one into site.css
 * and a stylesheet resolves relative URLs against its own location.
 */
export const HERO_IMAGES = [
  '/photos/hero-bowl.jpg',
  '/photos/hero-endzone.jpg',
  '/photos/hero-rain-crowd.jpg',
  '/photos/hero-red-lot.jpg',
];
