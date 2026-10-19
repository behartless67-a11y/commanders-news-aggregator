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
 * Ben asked for faces first, then crowd and other Commanders shots. The
 * order below matters: heroImageForDate() takes day-of-year modulo the pool
 * size, so neighbors in this list run on neighboring days. It alternates a
 * shot with people in it and a stadium or crowd shot, so the header never
 * shows faces two days running. Add new photos with that in mind.
 *
 * The three "pair" images (Oct 13) are side-by-sides of two group selfies,
 * from the London brunch, Högwaller and the Seattle stands. A selfie is too
 * close to work as a strip on its own; see PAIRS in process-photos.sh. They
 * count as faces for the ordering.
 *
 * The two helmet strips (Oct 16) are from Ben's watching area at home, not
 * the game: the W helmet, and the signed vintage helmet beside a UVA one.
 * No faces, so each sits after a face shot.
 *
 * Root-relative paths, because build.js drops the chosen one into site.css
 * and a stylesheet resolves relative URLs against its own location.
 */
export const HERO_IMAGES = [
  '/photos/hero-bowl.jpg',
  '/photos/hero-crew.jpg',
  '/photos/hero-endzone.jpg',
  '/photos/hero-pair-brunch-hogwaller.jpg',
  '/photos/hero-helmet-w.jpg',
  '/photos/hero-rain-crowd.jpg',
  '/photos/hero-six-in-lot.jpg',
  '/photos/hero-video-board.jpg',
  '/photos/hero-rail-bowl.jpg',
  '/photos/hero-mariota-sign.jpg',
  '/photos/hero-pair-hogwaller-terry.jpg',
  '/photos/hero-pregame.jpg',
  '/photos/hero-pair-seattle-stands.jpg',
  '/photos/hero-helmet-vintage.jpg',
];

/**
 * One-off overrides by UTC date, the same day heroImageForDate() in build.js
 * works from (so a day flips at 8 PM Eastern during daylight time, 7 PM in
 * winter). That day shows this photo instead of its turn in the rotation.
 * Ben wanted to see the new helmet shots right away (Oct 17) rather than
 * wait for their turn. A date in the past does nothing, so old entries can
 * be cleared out whenever.
 */
export const HERO_PINNED = {
  '2026-10-17': '/photos/hero-helmet-w.jpg',
  '2026-10-18': '/photos/hero-helmet-vintage.jpg',
  // Ben's birthday post day: his turn in the rotation was a family photo,
  // and he wanted the helmets back instead. The vintage one follows on the
  // 20th by rotation anyway.
  '2026-10-19': '/photos/hero-helmet-w.jpg',
};
