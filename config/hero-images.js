/**
 * The header/ticker backdrop photo (see .hero in site.css) rotates through
 * this pool, one per build day (see heroImageForDate() in build.js), rather
 * than showing the same single photo forever or a different one on every
 * page load.
 *
 * Oct 28, 2026: Ben's own photos came out of the header and these went in.
 * The repo is public and his face was on every page; and the best "sea of
 * burgundy" photos anyone has taken are the ones below. They are public
 * domain (military photographers at Commanders games, via DVIDS, the White
 * House and the Joint Staff), CC0 (the night exterior) and CC BY-SA (Joe
 * Glorioso's All-Pro Reels game photos). The cropped strips are made by
 * scripts/process-photos.sh from originals kept on the Desktop
 * (header-photos/), and are served from this site; HERO_CREDITS below is
 * what credits.html shows for each, which the Creative Commons ones require
 * and the government ones ask for.
 *
 * The order matters: heroImageForDate() takes day-of-year modulo the pool
 * size, so neighbors in this list run on neighboring days. It alternates a
 * stadium or crowd shot with a tight game-action shot, so two rows of
 * helmets never run back to back. Add new photos with that in mind.
 *
 * Root-relative paths, because build.js drops the chosen one into site.css
 * and a stylesheet resolves relative URLs against its own location.
 */
export const HERO_IMAGES = [
  '/photos/hero-flyover-formation.jpg',
  '/photos/hero-team-runs-out.jpg',
  '/photos/hero-color-guard-flyover.jpg',
  '/photos/hero-mclaurin-champions-wall.jpg',
  '/photos/hero-anthem-fireworks.jpg',
  '/photos/hero-burgundy-fan-section.jpg',
  '/photos/hero-air-force-one-aerial.jpg',
  '/photos/hero-touchdown-celebration.jpg',
  '/photos/hero-stadium-exterior-night.jpg',
  '/photos/hero-huddle-helmets-up.jpg',
  '/photos/hero-full-bowl-anthem.jpg',
  '/photos/hero-tackle-championship-wall.jpg',
  '/photos/hero-fight-for-old-dc-mural.jpg',
  '/photos/hero-black-alternates-celebration.jpg',
  '/photos/hero-take-command-tunnel.jpg',
  '/photos/hero-mnf-huddle-lights.jpg',
  '/photos/hero-video-board-sign.jpg',
  '/photos/hero-mnf-line-of-scrimmage.jpg',
  '/photos/hero-giant-flag-crowd.jpg',
];

/**
 * One-off overrides by UTC date, the same day heroImageForDate() in build.js
 * works from (so a day flips at 8 PM Eastern during daylight time, 7 PM in
 * winter). That day shows this photo instead of its turn in the rotation.
 * A date in the past does nothing, so old entries can be cleared out
 * whenever. The two below put the new set's best frames up first.
 */
export const HERO_PINNED = {
  '2026-10-28': '/photos/hero-flyover-formation.jpg',
  '2026-10-29': '/photos/hero-mclaurin-champions-wall.jpg',
};

/**
 * Who took each header photo, keyed by the path above, for credits.html
 * (renderCreditsPage() in templates.js). `license` is the exact short name,
 * `licenseUrl` the deed for Creative Commons ones (empty for public domain),
 * `sourceUrl` the page the file came from. A photo with no entry would be
 * one of Ben's own; there are none right now.
 */
export const HERO_CREDITS = {
  '/photos/hero-flyover-formation.jpg': {
    title: "Flyover formation over the upper deck, Christmas 2025",
    credit: "Senior Airman Martha Moore, 316th Wing, U.S. Air Force (via DVIDS)",
    license: "Public domain (U.S. Air Force)",
    licenseUrl: "",
    sourceUrl: "https://www.dvidshub.net/image/9465511/1st-hs-conducts-flyover-washington-commanders-vs-dallas-cowboys-game",
  },
  '/photos/hero-team-runs-out.jpg': {
    title: "The team runs out through the smoke, Eagles 2022",
    credit: "Joe Glorioso / All-Pro Reels, via Wikimedia Commons",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NFL_Week_3_Washington_Commanders_vs._Philadelphia_Eagles_(52394247069).jpg",
  },
  '/photos/hero-color-guard-flyover.jpg': {
    title: "Color guard, flyover and the field-sized flag, Salute to Service 2024",
    credit: "Staff Sgt. Chazz Kibler, 29th MPAD, Maryland National Guard (via DVIDS)",
    license: "Public domain (U.S. Army National Guard)",
    licenseUrl: "",
    sourceUrl: "https://www.dvidshub.net/image/8769662/flyover-northwest-stadium",
  },
  '/photos/hero-mclaurin-champions-wall.jpg': {
    title: "Terry McLaurin along the World Champions wall, Eagles 2022",
    credit: "Joe Glorioso / All-Pro Reels, via Wikimedia Commons",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NFL_Week_3_Washington_Commanders_vs._Philadelphia_Eagles_(52394393065).jpg",
  },
  '/photos/hero-anthem-fireworks.jpg': {
    title: "Anthem fireworks over the roofline, Christmas 2025",
    credit: "Senior Airman Martha Moore, 316th Wing, U.S. Air Force (via DVIDS)",
    license: "Public domain (U.S. Air Force)",
    licenseUrl: "",
    sourceUrl: "https://www.dvidshub.net/image/9465502/1st-hs-conducts-flyover-washington-commanders-vs-dallas-cowboys-game",
  },
  '/photos/hero-burgundy-fan-section.jpg': {
    title: "Burgundy at the rail, Raiders 2025",
    credit: "Joe Glorioso / All-Pro Reels, via Wikimedia Commons",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:2025_Raiders_at_Commanders_79.jpg",
  },
  '/photos/hero-air-force-one-aerial.jpg': {
    title: "The whole bowl from the air, Lions game 2025",
    credit: "Joyce N. Boghosian, Official White House Photo",
    license: "Public domain (U.S. Government)",
    licenseUrl: "",
    sourceUrl: "https://www.flickr.com/photos/whitehouse/54914488471/",
  },
  '/photos/hero-touchdown-celebration.jpg': {
    title: "Touchdown celebration in front of the crowd, Jaguars 2022",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/52379250590/",
  },
  '/photos/hero-stadium-exterior-night.jpg': {
    title: "Northwest Stadium at night, December 2024",
    credit: "Dissident93, Wikimedia Commons",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Atlanta_Falcons_at_Washington_Commanders_2024_21.jpg",
  },
  '/photos/hero-huddle-helmets-up.jpg': {
    title: "Pregame huddle, helmets up, Jaguars 2022",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/52379248960/",
  },
  '/photos/hero-full-bowl-anthem.jpg': {
    title: "The full bowl during the anthem, December 2024",
    credit: "Benjamin Applebaum, DoD photo (Joint Staff Flickr)",
    license: "Public domain (U.S. Department of Defense)",
    licenseUrl: "",
    sourceUrl: "https://www.flickr.com/photos/thejointstaff/54206193516/",
  },
  '/photos/hero-tackle-championship-wall.jpg': {
    title: "A tackle at the championship wall, Jaguars 2022",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/52379248285/",
  },
  '/photos/hero-fight-for-old-dc-mural.jpg': {
    title: "The Fight for Old D.C. mural, Eagles 2022",
    credit: "Joe Glorioso / All-Pro Reels, via Wikimedia Commons",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NFL_Week_3_Washington_Commanders_vs._Philadelphia_Eagles_(52393449007).jpg",
  },
  '/photos/hero-black-alternates-celebration.jpg': {
    title: "The black alternates celebrate, Vikings 2022",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/52498460434/",
  },
  '/photos/hero-take-command-tunnel.jpg': {
    title: "The Take Command tunnel, Eagles 2022",
    credit: "Joe Glorioso / All-Pro Reels, via Wikimedia Commons",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NFL_Week_3_Washington_Commanders_vs._Philadelphia_Eagles_(52394253154).jpg",
  },
  '/photos/hero-mnf-huddle-lights.jpg': {
    title: "Monday night huddle under the lights, Bears 2025",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/54858913859/",
  },
  '/photos/hero-video-board-sign.jpg': {
    title: "The video board and the Northwest Stadium sign, Christmas 2025",
    credit: "Senior Airman Martha Moore, 316th Wing, U.S. Air Force (via DVIDS)",
    license: "Public domain (U.S. Air Force)",
    licenseUrl: "",
    sourceUrl: "https://www.dvidshub.net/image/9465495/1st-hs-conducts-flyover-washington-commanders-vs-dallas-cowboys-game",
  },
  '/photos/hero-mnf-line-of-scrimmage.jpg': {
    title: "The line of scrimmage, Bears 2025",
    credit: "Joe Glorioso / All-Pro Reels",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://www.flickr.com/photos/joeglo/54858914139/",
  },
  '/photos/hero-giant-flag-crowd.jpg': {
    title: "Fans carrying the giant flag, Christmas 2025",
    credit: "Senior Airman Martha Moore, 316th Wing, U.S. Air Force (via DVIDS)",
    license: "Public domain (U.S. Air Force)",
    licenseUrl: "",
    sourceUrl: "https://www.dvidshub.net/image/9465512/1st-hs-conducts-flyover-washington-commanders-vs-dallas-cowboys-game",
  },
};
