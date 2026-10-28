/**
 * Upgrade the video rail's thumbnails into inline players.
 *
 * The build renders each card as an ordinary link to youtube.com, so the rail
 * works with JavaScript disabled — it just navigates. Here we intercept the
 * click and swap YouTube's embedded player into the thumbnail instead, keeping
 * the video on the page.
 *
 * Why not embed the iframes up front? YouTube's player is roughly a megabyte of
 * script per embed, and the rail carries six of them; eagerly loading those
 * would cost more than the rest of the site put together, and would hand
 * YouTube a page view for every visitor who never pressed play. Loading on
 * demand is the whole reason this file exists — it is not a progressive
 * enhancement of convenience.
 *
 * This is the only JavaScript on the site. Keep it that way if you can.
 */
(function () {
  'use strict';

  var ALLOW =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

  function play(link) {
    var id = link.getAttribute('data-video-id');
    var thumb = link.querySelector('.video-thumb');
    var titleEl = link.querySelector('.video-title');
    if (!id || !thumb) return false;

    var frame = document.createElement('iframe');
    // youtube-nocookie.com serves the same player without the tracking cookies
    // youtube.com sets. Combined with loading on click, nothing is written to a
    // visitor's browser unless they actually choose to watch something.
    frame.src =
      'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    frame.title = titleEl ? titleEl.textContent : 'Washington Commanders video';
    frame.className = 'video-frame';
    frame.allow = ALLOW;
    frame.allowFullscreen = true;
    frame.setAttribute('frameborder', '0');

    thumb.replaceChildren(frame);

    // The card is a player now, not a link. Drop the href so a stray click on
    // the surrounding chrome can't navigate away mid-video.
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.classList.add('is-playing');
    return true;
  }

  document.addEventListener('click', function (event) {
    if (typeof event.target.closest !== 'function') return;
    var link = event.target.closest('.video-link[data-video-id]');
    if (!link || link.classList.contains('is-playing')) return;
    if (play(link)) event.preventDefault();
  });

  /**
   * Progressive reveal, shared by the river and the Roster page's "in the
   * news" list.
   *
   * The build ships every item and marks the ones past the first batch with
   * `extraClass`; CSS hides those while the list carries .is-collapsed. So
   * this only flips classes — nothing is fetched, and a reader with
   * JavaScript off gets the whole list via each page's own <noscript>
   * override rather than a dead button.
   *
   * Also levels the list up to match the video/schedule rail beside it:
   * RIVER_INITIAL (or its Roster equivalent) is a static guess made at build
   * time, but actual item heights vary, so on any given day the list can
   * fall short of the rail and leave it trailing into dead space. Reveal-only,
   * deliberately — it never re-hides an item the reader has already been
   * shown, so it can't undo a press of the button or fight the server's
   * count. Erring one item tall is also the better direction — it puts the
   * button at the foot of the rail instead of stranding a gap above it.
   */
  function setupReveal(listSelector, moreSelector, extraClass, railSelector) {
    var list = document.querySelector(listSelector + '.is-collapsed');
    var more = document.querySelector(moreSelector);
    if (!list || !more) return;

    var batch = Number(more.getAttribute('data-batch')) || 10;
    var label = more.querySelector('span');
    var rail = document.querySelector(railSelector || '.sidebar');
    // Mirrors the breakpoint in site.css where the rail moves beside the list.
    // Below it the two stack, and there is no column to balance against.
    var twoColumn = window.matchMedia('(min-width: 900px)');

    var hiddenItems = function () {
      return list.querySelectorAll('.' + extraClass + ':not(.is-revealed)');
    };

    var syncMore = function () {
      if (!more) return;
      var left = hiddenItems().length;
      if (left > 0) {
        if (label) label.textContent = 'Show ' + Math.min(batch, left) + ' more';
        return;
      }
      // Nothing else to show — drop the collapsed state entirely so the
      // last-item border rules behave as they do on a fully expanded page.
      list.classList.remove('is-collapsed');
      more.remove();
      more = null;
    };

    var balance = function () {
      if (!more || !rail || !twoColumn.matches) return;
      // Bounded: one layout read per reveal, once, and never more than the
      // items actually present.
      var guard = 0;
      while (list.offsetHeight < rail.offsetHeight && guard++ < 60) {
        var next = hiddenItems()[0];
        if (!next) break;
        next.classList.add('is-revealed');
      }
      syncMore();
    };

    more.addEventListener('click', function () {
      var hidden = hiddenItems();
      var reveal = Math.min(batch, hidden.length);
      for (var i = 0; i < reveal; i++) hidden[i].classList.add('is-revealed');
      syncMore();
    });

    balance();
    // Thumbnails/photos are sized by attribute so the rail's height is stable
    // before they load, but the webfont is not — re-check once it has
    // settled, and after a resize reflows the list.
    window.addEventListener('load', balance);

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(balance, 150);
    });
  }

  setupReveal('.river', '.river-more', 'card-extra');

  /**
   * Matches the live feed's own height to the river's, in JS rather than
   * leaning on CSS grid stretch alone. align-self: stretch on .live-feed
   * (see site.css) sizes the grid *cell* correctly, but that cell contains a
   * flex column whose scrolling middle section has to actually grow to fill
   * it — flex-basis: 0 tells that section not to demand its own (oversized,
   * looped-twice) content height, but nothing forces it to claim 100% of a
   * newly-stretched ancestor's height in return, in every browser's flex
   * layout pass. Measuring .river directly and setting an explicit pixel
   * height sidesteps that uncertainty instead of trusting it.
   *
   * Runs after setupReveal('.river', ...) is wired up above, and its
   * listeners are added after that call registers its own — same-target
   * listeners for one event fire in registration order, so balance() has
   * already settled the river's real height (which can itself grow to match
   * the sidebar) by the time this reads it, not a stale pre-balance one.
   */
  // Same breakpoint the CSS uses to swap the ticker for this column in the
  // first place (see the shared min-width: 1300px rule in site.css) — below
  // it everything stacks in one column, live feed above the river rather
  // than beside it, and forcing a matching height there would be sizing one
  // box to a sibling it isn't even next to anymore.
  var liveFeedWide = window.matchMedia('(min-width: 1300px)');

  function syncLiveFeedHeight() {
    var feed = document.querySelector('.live-feed');
    var river = document.querySelector('.river');
    if (!feed || !river) return;
    // Cleared rather than left stale on a resize down past the breakpoint —
    // otherwise a reader who resizes narrower keeps whatever fixed height
    // was last set while the layout underneath it has already gone back to
    // a single stacked column.
    feed.style.height = liveFeedWide.matches ? river.offsetHeight + 'px' : '';
  }

  syncLiveFeedHeight();
  window.addEventListener('load', syncLiveFeedHeight);

  var liveFeedResizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(liveFeedResizeTimer);
    liveFeedResizeTimer = setTimeout(syncLiveFeedHeight, 150);
  });

  // The river also grows on demand, when a reader presses "Show more" —
  // delegated on document rather than bound to .river-more directly, so it
  // still fires after setupReveal's own click handler (bound directly on the
  // button) has already revealed more cards: a listener on an ancestor sees
  // a bubbling click after one on the target itself.
  document.addEventListener('click', function (event) {
    if (event.target.closest('.river-more')) syncLiveFeedHeight();
  });

  // Balanced against the video widget alone, not the whole sidebar — the
  // schedule list underneath it runs much longer than any reasonable initial
  // batch of players should chase.
  setupReveal('.roster-list', '.roster-more', 'roster-row-extra', '.widget-videos');
  setupReveal('.blog-list', '.blog-more', 'blog-post-extra', '.widget-videos');
  setupReveal('.social-feed-list', '.social-feed-more', 'social-feed-post-extra');

  /**
   * The Beat Writers page has several independent list+button pairs on one
   * page (one per reporter), which setupReveal above doesn't handle — it
   * only ever finds the first match. Same balance-against-the-video-widget
   * behavior, just looped per column instead of assuming there's only one.
   */
  var beatColumns = document.querySelectorAll('.beat-column');
  if (beatColumns.length) {
    var beatRail = document.querySelector('.widget-videos');
    var beatTwoColumn = window.matchMedia('(min-width: 900px)');
    var beatBalancers = [];

    beatColumns.forEach(function (column) {
      var list = column.querySelector('.beat-list.is-collapsed');
      var more = column.querySelector('.beat-more');
      if (!list || !more) return;

      var batch = Number(more.getAttribute('data-batch')) || 5;
      var label = more.querySelector('span');

      var hiddenItems = function () {
        return list.querySelectorAll('.beat-post-extra:not(.is-revealed)');
      };

      var syncMore = function () {
        if (!more) return;
        var left = hiddenItems().length;
        if (left > 0) {
          if (label) label.textContent = 'Show ' + Math.min(batch, left) + ' more';
          return;
        }
        list.classList.remove('is-collapsed');
        more.remove();
        more = null;
      };

      var balance = function () {
        if (!more || !beatRail || !beatTwoColumn.matches) return;
        var guard = 0;
        while (list.offsetHeight < beatRail.offsetHeight && guard++ < 60) {
          var next = hiddenItems()[0];
          if (!next) break;
          next.classList.add('is-revealed');
        }
        syncMore();
      };

      more.addEventListener('click', function () {
        var hidden = hiddenItems();
        var reveal = Math.min(batch, hidden.length);
        for (var i = 0; i < reveal; i++) hidden[i].classList.add('is-revealed');
        syncMore();
      });

      beatBalancers.push(balance);
      balance();
    });

    var runAllBeatBalancers = function () {
      beatBalancers.forEach(function (fn) { fn(); });
    };
    window.addEventListener('load', runAllBeatBalancers);

    var beatResizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(beatResizeTimer);
      beatResizeTimer = setTimeout(runAllBeatBalancers, 150);
    });
  }

  /**
   * Back-to-top. The anchor works on its own — this only decides when it's worth
   * showing, so it stays out of the way near the top of a page.
   */
  var toTop = document.querySelector('.to-top');

  if (toTop) {
    var shown = false;
    var sync = function () {
      var want = (window.pageYOffset || document.documentElement.scrollTop) > 700;
      if (want === shown) return;
      shown = want;
      toTop.classList.toggle('is-visible', want);
    };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  /**
   * Reformat each schedule row's kickoff time into the visitor's own
   * timezone. The server has no way to know that at build time, so it
   * renders in Eastern (see SITE_TZ in dates.js) with the game's real ISO
   * timestamp carried in data-iso — this just re-renders that timestamp
   * through the browser's own resolved timezone. A played game shows a
   * final score instead of a time and carries no data-iso, so it's
   * untouched here.
   */
  var timeEls = document.querySelectorAll('.schedule-time[data-iso]');
  if (timeEls.length) {
    var fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    var timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
    for (var i = 0; i < timeEls.length; i++) {
      var date = new Date(timeEls[i].getAttribute('data-iso'));
      if (isNaN(date.getTime())) continue;
      timeEls[i].textContent = fmt.format(date) + ' · ' + timeFmt.format(date);
    }
  }

  /**
   * Recompute every "3h ago" label against the reader's clock instead of the
   * build's.
   *
   * These are rendered server-side by relativeLabel() in src/lib/dates.js, so
   * they were only ever as accurate as the last deploy: a page built two hours
   * ago still claimed "just now". That silently made deploy frequency the thing
   * keeping the site looking alive, which is a bad reason to redeploy a static
   * site every hour (and on a credits-priced account, an expensive one). The
   * machine-readable timestamp is already in the <time datetime> attribute, so
   * the freshness can come from the browser and the deploys can slow down.
   *
   * Deliberately mirrors relativeLabel()'s thresholds exactly. Anything a week
   * or older is left as the server rendered it, since that's an absolute date
   * already and needs no clock of its own.
   */
  /**
   * Returns null where the server's own text should stand: an unparseable
   * date, a future timestamp (build.js warns about those, and a negative age
   * reads as nonsense), or anything a week or older, which relativeLabel()
   * renders as an absolute date that needs no clock.
   *
   * Shared with the live ticker below, so the thresholds exist once here and
   * once in relativeLabel(). Two copies is already one too many; three would
   * be asking for them to drift.
   */
  function relativeAgo(when) {
    if (isNaN(when.getTime())) return null;
    var minutes = (Date.now() - when.getTime()) / 60000;
    if (minutes < 0) return null;
    if (minutes < 1) return 'just now';
    if (minutes < 60) return Math.floor(minutes) + 'm ago';
    if (minutes < 1440) return Math.floor(minutes / 60) + 'h ago';
    if (minutes < 10080) return Math.floor(minutes / 1440) + 'd ago';
    return null;
  }

  // Not .post-date, the full date under a post's headline (postByline() in
  // templates.js), which has to stay a date.
  var agoEls = document.querySelectorAll('time[datetime]:not(.post-date)');
  for (var t = 0; t < agoEls.length; t++) {
    var agoLabel = relativeAgo(new Date(agoEls[t].getAttribute('datetime')));
    if (agoLabel) agoEls[t].textContent = agoLabel;
  }

  // The ticker, the Live Feed column and the Social Feed print their own
  // "Xh ago" labels in spans rather than <time>, so they get the same
  // treatment from each post's own timestamp. Since Oct 22 the site deploys
  // only when something actually changed (see src/site/build-hash.js), so a
  // label baked in at build time could otherwise be hours out of date.
  [['.ticker-time', '.ticker-post', 'data-at'],
    ['.live-feed-time', '.live-feed-post', 'data-at'],
    ['.social-feed-time', '.social-feed-post', 'data-published']].forEach(function (spec) {
    var els = document.querySelectorAll(spec[0]);
    for (var i = 0; i < els.length; i++) {
      var owner = els[i].closest(spec[1]);
      var stamp = owner && owner.getAttribute(spec[2]);
      var label = stamp && relativeAgo(new Date(stamp));
      if (label) els[i].textContent = label;
    }
  });

  /**
   * Live ticker refresh.
   *
   * A reader wrote in to say the beat-reporter ticker is stale exactly when
   * it matters, during a game, because this is a static site that only
   * changes when a build deploys. Same problem the timestamps above had, and
   * the same answer: let the browser do it, so freshness stops being a
   * reason to redeploy.
   *
   * Merges rather than replaces. /api/ticker only covers the seven beat
   * accounts (see netlify/functions/ticker.js for why), while the built page
   * also carries national insiders from the scheduled collection, so
   * overwriting the rail would quietly throw half of it away.
   *
   * Every failure path leaves the built-in ticker untouched: no endpoint, a
   * 503, a parse error, an empty list, or no JS at all.
   */
  (function () {
    var section = document.querySelector('.ticker');
    if (!section || typeof window.fetch !== 'function') return;
    var track = section.querySelector('.ticker-track');
    var groups = section.querySelectorAll('.ticker-group');
    if (!track || groups.length !== 2) return;

    var POLL_MS = 120000;
    var MAX_POSTS = 30;
    // Mirrors TICKER_CHARS_PER_SEC in templates.js — the marquee has to keep
    // a constant reading speed as the track's width changes under it.
    var CHARS_PER_SEC = 8.6;
    var signature = '';

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function textOf(node, selector) {
      var found = node.querySelector(selector);
      return found ? found.textContent : '';
    }

    /** The posts the build put on the page, read back out of the DOM. */
    function existing() {
      var out = [];
      var nodes = groups[0].querySelectorAll('.ticker-post');
      for (var i = 0; i < nodes.length; i++) {
        var url = nodes[i].getAttribute('href');
        if (!url) continue;
        out.push({
          url: url,
          handle: textOf(nodes[i], '.ticker-handle').replace(/^@/, ''),
          text: textOf(nodes[i], '.ticker-text'),
          publishedAt: nodes[i].getAttribute('data-at') || null
        });
      }
      return out;
    }

    function postHtml(post) {
      var when = post.publishedAt ? relativeAgo(new Date(post.publishedAt)) : null;
      var at = post.publishedAt ? ' data-at="' + esc(post.publishedAt) + '"' : '';
      return '<a class="ticker-post" href="' + esc(post.url) + '"' + at +
        ' target="_blank" rel="noopener noreferrer">' +
        '<span class="ticker-handle">@' + esc(post.handle) + '</span>' +
        '<span class="ticker-text">' + esc(post.text) + '</span>' +
        (when ? '<span class="ticker-time">' + esc(when) + '</span>' : '') +
        '</a>';
    }

    function render(posts) {
      var html = posts.map(postHtml).join('\n');
      var chars = posts.reduce(function (total, p) {
        return total + p.text.length + p.handle.length + 12;
      }, 0);
      groups[0].innerHTML = html;
      groups[1].innerHTML = html;
      track.style.animationDuration = Math.max(60, Math.round(chars / CHARS_PER_SEC)) + 's';
      renderLiveFeed(posts);
    }

    // The Live Feed column (liveFeedWidget() in templates.js) is the same
    // posts in a different shape, shown instead of the ticker on wide
    // screens, and until Oct 22 it only ever changed with a deploy. It now
    // takes the same fresh list the ticker just got. Avatars come from the
    // posts the build already rendered there, by handle; a handle the page
    // hasn't seen gets the same initial-letter placeholder the build uses.
    var liveTrack = document.querySelector('.live-feed-track');
    var liveGroups = liveTrack ? liveTrack.querySelectorAll('.live-feed-group') : [];
    // Mirrors LIVE_FEED_SECONDS_PER_POST in templates.js.
    var LIVE_SECONDS_PER_POST = 4.5;
    function renderLiveFeed(posts) {
      if (liveGroups.length !== 2) return;
      var avatars = {};
      var built = liveGroups[0].querySelectorAll('.live-feed-post');
      for (var i = 0; i < built.length; i++) {
        var handle = textOf(built[i], '.live-feed-handle').replace(/^@/, '');
        var avatar = built[i].querySelector('.live-feed-avatar');
        if (handle && avatar && !avatars[handle]) avatars[handle] = avatar.outerHTML;
      }
      var html = posts.map(function (post) {
        var when = post.publishedAt ? relativeAgo(new Date(post.publishedAt)) : null;
        var at = post.publishedAt ? ' data-at="' + esc(post.publishedAt) + '"' : '';
        var avatarHtml = avatars[post.handle] ||
          '<span class="live-feed-avatar live-feed-avatar-placeholder" aria-hidden="true">' + esc(post.handle.charAt(0)) + '</span>';
        return '<a class="live-feed-post" href="' + esc(post.url) + '"' + at + ' target="_blank" rel="noopener noreferrer">' +
          avatarHtml +
          '<span class="live-feed-body"><span class="live-feed-head-row">' +
          '<span class="live-feed-handle">@' + esc(post.handle) + '</span>' +
          (when ? '<span class="live-feed-time">' + esc(when) + '</span>' : '') +
          '</span><span class="live-feed-text">' + esc(post.text) + '</span></span></a>';
      }).join('');
      liveGroups[0].innerHTML = html;
      liveGroups[1].innerHTML = html;
      liveTrack.style.animationDuration = Math.max(20, Math.round(posts.length * LIVE_SECONDS_PER_POST)) + 's';
    }

    function merge(fresh) {
      var byUrl = {};
      var all = existing().concat(fresh);
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].url) byUrl[all[i].url] = all[i];
      }
      return Object.keys(byUrl)
        .map(function (k) { return byUrl[k]; })
        .sort(function (a, b) {
          return Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
        })
        .slice(0, MAX_POSTS);
    }

    function refresh() {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/ticker', { credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error('ticker ' + r.status); return r.json(); })
        .then(function (data) {
          if (!data || !data.posts || !data.posts.length) return;
          var merged = merge(data.posts);
          // Re-rendering restarts the CSS marquee from the left, so only do
          // it when the set actually changed. On a quiet afternoon that means
          // the rail is never interrupted at all.
          var next = merged.map(function (p) { return p.url; }).join('|');
          if (next === signature) return;
          signature = next;
          render(merged);
        })
        .catch(function () { /* leave whatever the build rendered */ });
    }

    signature = existing().map(function (p) { return p.url; }).join('|');
    refresh();
    setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refresh();
    });
  }());

  /**
   * A random id naming this browser tab's session, so the track Function can
   * tell "the same reader loaded three pages" apart from "three different
   * readers loaded one page each" — otherwise every pageview looks identical
   * and there's no way to derive a unique-visitor count at all.
   *
   * sessionStorage rather than a cookie or localStorage: it clears itself when
   * the tab closes, so nothing here identifies a return visit, let alone a
   * person. It never leaves this browser except as this one random string,
   * with no other data attached — see the server-side handling in
   * netlify/functions/track.js for what becomes of it.
   *
   * Wrapped in try/catch because sessionStorage can throw synchronously (not
   * just return null) in a handful of locked-down contexts — some privacy
   * extensions, some in-app browsers. Same rule as the beacon itself: this is
   * allowed to silently not happen, never allowed to break the page.
   */
  function sessionId() {
    try {
      var key = 'bw_sid';
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var id =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(key, id);
      return id;
    } catch (err) {
      return null;
    }
  }

  /**
   * A single boolean flag saying "this browser has been here before" — the
   * opposite lifetime from sessionId() above on purpose. sessionId() answers
   * "how many distinct browsers today" and must forget between visits to do
   * that honestly; this answers "does this browser ever come back" and can
   * only do that by remembering past the tab closing. localStorage, not a
   * cookie: still nothing sent to any other site, still not readable
   * server-side except as the one bit this function derives from it, and
   * still not an identifier — just a bit, no id, nothing to correlate across
   * browsers or link back to a person.
   *
   * Reads and (if unset) writes the flag in the same call, so a page that
   * never finishes loading still leaves the flag in whatever state a
   * completed pageview would have left it — there's no separate "first
   * visit" step to skip.
   */
  /**
   * The tag on a link Ben shares (`?via=reddit`, `?via=hogwaller`), read on the
   * page it lands on and sent with that one pageview (track.js buckets on it).
   * Kept in sessionStorage for the rest of the visit too, so a newsletter
   * signup three pages later can still say where the reader came from (see
   * the src field below). `utm_source` counts as well, for links someone else
   * tags. Nothing here outlives the tab.
   */
  var VIA_KEY = 'bw_via';
  var landingVia = (function () {
    var params = new URLSearchParams(window.location.search);
    var tag = (params.get('via') || params.get('utm_source') || '').toLowerCase();
    if (!/^[a-z0-9-]{1,24}$/.test(tag)) return null;
    try { sessionStorage.setItem(VIA_KEY, tag); } catch (e) {}
    return tag;
  })();
  function sessionVia() {
    if (landingVia) return landingVia;
    try { return sessionStorage.getItem(VIA_KEY); } catch (e) { return null; }
  }

  function isReturningVisitor() {
    try {
      var key = 'bw_seen';
      var seenBefore = Boolean(localStorage.getItem(key));
      if (!seenBefore) localStorage.setItem(key, '1');
      return seenBefore;
    } catch (err) {
      return false;
    }
  }

  /**
   * One pageview beacon per load, to the same site's own track Function —
   * no third-party analytics script (see netlify/functions/track.js).
   * Fire-and-forget: a failed or blocked beacon should never affect the page
   * a reader is actually here for.
   *
   * Skip the beacon entirely when an admin session cookie is present — the
   * admin is almost certainly the site owner refreshing after updates, not
   * a real visitor, and their traffic would otherwise inflate the numbers.
   * The cookie itself is verified server-side; checking for its existence
   * here is enough to suppress the beacon without exposing anything.
   */
  /**
   * Readers outside the US get a hello in their own language and an
   * invitation to write in (see assets/abroad.js). That file, with all its
   * translations, only loads for them; US readers never download it. The
   * country comes back from the track beacon below. `?country=DE` in the URL
   * forces it, for previewing what a reader there sees.
   */
  function sayHelloAbroad(country) {
    if (!country || country === 'US') return;
    window.__bwCountry = country;
    if (window.bwAbroad) { window.bwAbroad.start(country); return; }
    var s = document.createElement('script');
    s.src = 'abroad.js';
    s.defer = true;
    s.onload = function () { if (window.bwAbroad) window.bwAbroad.start(country); };
    document.head.appendChild(s);
  }
  var forcedCountry = (new URLSearchParams(window.location.search).get('country') || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(forcedCountry)) sayHelloAbroad(forcedCountry);

  /**
   * The reader behind a milestone pageview (5,000 first; see claimMilestone()
   * in track.js) gets a one-time "you're visit #5,000" hello and an invitation
   * to write in on five-thousand.html, because Ben would love to meet them.
   * Remembered in localStorage, so a reader who closes the popup still gets a
   * small reminder bar on later pages until they send the survey or close the
   * bar too. The winner gets a sticker, and two plus a shout-out if they're
   * reading from outside the US. `?milestone=5000` shows the popup without
   * remembering anything, for previewing what that reader sees.
   */
  var MILESTONE_KEY = 'bw_milestone';
  function milestoneState() {
    try { return JSON.parse(localStorage.getItem(MILESTONE_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveMilestone(state) {
    try { localStorage.setItem(MILESTONE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function markLabel(mark) { return '#' + Number(mark).toLocaleString('en-US'); }

  // Readers outside the US get a bonus on top of the sticker: Ben wants to
  // know who's reading from abroad most of all (same spirit as abroad.js).
  var ABROAD_BONUS = 'Reading from outside the US? You get two stickers instead of one, and a shout-out in the next post if you\'re up for it.';
  function isAbroad(country) { return !!country && country !== 'US'; }

  function celebrateMilestone(mark, preview, country) {
    if (!preview) saveMilestone({ mark: mark, status: 'won', country: country || null });
    if (document.querySelector('.milestone-modal')) return;
    var reminder = document.querySelector('.milestone-reminder');
    if (reminder) reminder.remove();
    var modal = document.createElement('div');
    modal.className = 'subscribe-modal milestone-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'milestone-heading');
    modal.innerHTML =
      '<div class="subscribe-modal-card">' +
        '<button class="subscribe-modal-close" type="button" aria-label="Close">&times;</button>' +
        '<img class="subscribe-modal-logo" src="logo.png" alt="The Burgundy Wire" />' +
        '<p class="subscribe-modal-eyebrow">Hold on a second</p>' +
        '<h2 class="subscribe-modal-heading" id="milestone-heading"></h2>' +
        '<p class="subscribe-modal-body milestone-modal-lead"></p>' +
        '<p class="subscribe-modal-body">Got two minutes? Tell me where you\'re reading from and what brought you here, and I\'ll send you one of the very first Burgundy Wire stickers, on me. I read every word.</p>' +
        (isAbroad(country) ? '<p class="subscribe-modal-body milestone-bonus"></p>' : '') +
        '<a class="subscribe-modal-submit milestone-modal-cta" href="five-thousand.html">Say hi to Ben</a>' +
        '<button class="subscribe-modal-skip" type="button">Maybe later</button>' +
      '</div>';
    modal.querySelector('#milestone-heading').textContent = 'You\'re visit ' + markLabel(mark) + '.';
    modal.querySelector('.milestone-modal-lead').textContent =
      'Out of ' + Number(mark).toLocaleString('en-US') + ' visits to The Burgundy Wire, this one is yours. ' +
      'I\'m Ben, a lifelong Washington fan writing this thing from Charlottesville, and I would genuinely love to know who you are.';
    var bonus = modal.querySelector('.milestone-bonus');
    if (bonus) bonus.textContent = ABROAD_BONUS;
    var close = function () { modal.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    modal.querySelector('.subscribe-modal-close').addEventListener('click', close);
    modal.querySelector('.subscribe-modal-skip').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    modal.querySelector('.milestone-modal-cta').focus();
  }

  // Later pages, for a reader who closed the popup without writing in.
  (function () {
    var state = milestoneState();
    if (!state || state.status !== 'won' || document.querySelector('form[name="milestone"]')) return;
    var bar = document.createElement('aside');
    bar.className = 'abroad-invite milestone-reminder';
    bar.setAttribute('aria-label', 'You were visit ' + markLabel(state.mark));
    bar.innerHTML =
      '<p class="abroad-invite-text"><strong class="abroad-invite-hello"></strong> ' +
      '<span class="abroad-invite-line">Ben would love to hear from you (and send you a sticker).</span> ' +
      '<a class="abroad-invite-link" href="five-thousand.html">Say hi &rarr;</a></p>' +
      '<button class="abroad-invite-close" type="button" aria-label="Close">&times;</button>';
    bar.querySelector('.abroad-invite-hello').textContent = 'You were visit ' + markLabel(state.mark) + '!';
    bar.querySelector('.abroad-invite-close').addEventListener('click', function () {
      bar.remove();
      saveMilestone({ mark: state.mark, status: 'closed' });
    });
    var hero = document.querySelector('.hero');
    if (hero) hero.insertAdjacentElement('afterend', bar);
    else document.body.insertAdjacentElement('afterbegin', bar);
  })();

  // five-thousand.html itself: tell the winner it's them, and post the survey
  // in place like the other forms on the site.
  (function () {
    var form = document.querySelector('form[name="milestone"]');
    if (!form) return;
    var state = milestoneState();
    if (state && state.mark) {
      var eyebrow = document.getElementById('milestone-eyebrow');
      if (eyebrow) eyebrow.textContent = state.status === 'sent' ? 'Thanks again' : 'That\'s you.';
      // The sticker is the winner's thank-you, so only the winner is told
      // about it. Anyone else who finds this unlisted page can still say hi.
      var sticker = document.getElementById('milestone-sticker');
      if (sticker) sticker.hidden = false;
      var abroadBonus = document.getElementById('milestone-abroad-bonus');
      if (abroadBonus && isAbroad(state.country)) { abroadBonus.textContent = ABROAD_BONUS; abroadBonus.hidden = false; }
      form.querySelector('input[name="country"]').value = state.country || '';
      // The page is written for 5,000; a later mark (10,000, 25,000) swaps in
      // its own number rather than needing a page of its own.
      Array.prototype.forEach.call(document.querySelectorAll('.milestone-mark'), function (el) { el.textContent = markLabel(state.mark); });
      Array.prototype.forEach.call(document.querySelectorAll('.milestone-ordinal'), function (el) { el.textContent = Number(state.mark).toLocaleString('en-US') + 'th'; });
      form.querySelector('input[name="winner"]').value = 'yes, visit ' + markLabel(state.mark);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var done = function () {
        form.innerHTML = '<p class="subscribe-done">Got it. I\'ll read every word, and if you left an email, you\'ll hear from me about your sticker. Hail.</p>';
        if (state && state.mark) saveMilestone({ mark: state.mark, status: 'sent' });
      };
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString() })
        .then(done, done);
    });
  })();

  // Roll call (roll-call.html): sent in place like the other forms, with
  // where the reader came from (?via=hailmail, kept for the tab by
  // sessionVia()) so Ben can tell which Hail Mail brought them.
  (function () {
    var form = document.querySelector('form[name="rollcall"]');
    if (!form) return;
    var via = form.querySelector('input[name="via"]');
    if (via) via.value = sessionVia() || '';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var done = function () {
        var p = document.createElement('p');
        p.className = 'abroad-thanks';
        p.textContent = "Got it. Thank you, truly. I read every single one of these, and I can't wait to read yours. Hail.";
        form.replaceWith(p);
        p.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString() })
        .then(done, done);
    });
  })();

  var forcedMilestone = Number(new URLSearchParams(window.location.search).get('milestone'));
  // Add ?country=DE to preview the version a reader outside the US gets.
  if (forcedMilestone > 0) celebrateMilestone(forcedMilestone, true, forcedCountry || null);

  if (document.cookie.split(';').some(function (c) { return c.trim() === 'bw_owner=1'; })) {
    // Ben's own browser (bw_owner, set by the admin page): don't count it.
    // track.js checks too, since this is only the cheap early exit.
  } else
  fetch('/.netlify/functions/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer,
      via: landingVia,
      sid: sessionId(),
      returning: isReturningVisitor(),
      // A bare number, bucketed server-side (see deviceBucket() in
      // track.js) rather than a label chosen here — one thing this client
      // doesn't have to decide, and one fewer arbitrary string that could
      // reach the server.
      viewportWidth: window.innerWidth,
    }),
  })
    .then(function (r) { return r.status === 200 ? r.json() : null; })
    .then(function (d) {
      if (d && !forcedCountry) sayHelloAbroad(d.country);
      if (d && d.milestone) celebrateMilestone(d.milestone, false, d.country);
    })
    .catch(function () {});

  /**
   * A second, separate beacon for outbound clicks — river cards mark their
   * external link with data-outbound="<sourceId>" (see itemCard() in
   * templates.js; internal Blog posts carry no such attribute, since they're
   * not a click-through to a source). Delegated on document rather than bound
   * per card, so it keeps working after the progressive-reveal button in
   * setupReveal() adds more cards to the DOM later.
   *
   * Fired on click, not on navigation completing: this is a bare <a
   * target="_blank">, and the new tab opens regardless of whether this
   * beacon's fetch ever resolves. Never call preventDefault here — a reader's
   * click must not depend on an analytics request succeeding.
   */
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-outbound]');
    if (!link) return;
    fetch('/.netlify/functions/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outbound', sourceId: link.getAttribute('data-outbound') }),
    }).catch(function () {});
  });

  /**
   * "Send it to the group chat" (postShare() in templates.js). Phones get
   * their own share sheet, which is where iMessage and the group texts live;
   * a desktop browser without one gets the link copied instead. Hidden in the
   * HTML and shown here, so a reader without JavaScript never sees a button
   * that does nothing. The link carries ?via=share, so whoever it brings in
   * is counted as a reader share.
   */
  Array.prototype.forEach.call(document.querySelectorAll('.post-share-row[data-share-url]'), function (row) {
    var url = row.getAttribute('data-share-url');
    var title = row.getAttribute('data-share-title') || document.title;
    var btn = row.querySelector('.post-share-btn');
    var done = row.querySelector('.post-share-done');
    var canCopy = navigator.clipboard && window.isSecureContext;
    if (!navigator.share && !canCopy) return;
    row.hidden = false;
    btn.addEventListener('click', function () {
      if (navigator.share) {
        // A reader backing out of the share sheet rejects too; that's not an error.
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      navigator.clipboard.writeText(url).then(
        function () { done.textContent = 'Link copied. Go paste it in the chat.'; done.hidden = false; },
        function () { done.textContent = 'Copy this link: ' + url; done.hidden = false; }
      );
    });
  });

  /**
   * Hail Mail floating bar. Shows after 2 seconds on every page load, as
   * long as the visitor hasn't subscribed or dismissed it (or is the admin).
   * Tapping "Sign me up" opens the subscribe modal; X permanently dismisses.
   */
  (function () {
    var bar = document.getElementById('hail-mail-bar');
    if (!bar) return;
    var BAR_KEY = 'bw_bar_dismissed';
    function dismissed() { try { return Boolean(localStorage.getItem(BAR_KEY)); } catch { return true; } }
    function dismiss() { try { localStorage.setItem(BAR_KEY, '1'); } catch {} }
    function isAdmin() { return document.cookie.split(';').some(function (c) { return c.trim() === 'bw_owner=1'; }); }
    function subscribed() { try { return Boolean(localStorage.getItem('bw_sub')); } catch { return false; } }
    if (dismissed() || subscribed() || isAdmin()) return;
    setTimeout(function () {
      bar.hidden = false;
      document.getElementById('hail-mail-bar-open').addEventListener('click', function () {
        bar.hidden = true;
        var modal = document.getElementById('subscribe-modal');
        if (modal) { modal.hidden = false; }
      });
      document.getElementById('hail-mail-bar-close').addEventListener('click', function () {
        bar.hidden = true;
        dismiss();
      });
    }, 2000);
  }());

  /**
   * Every Hail Mail signup form on the page: the homepage modal, the box at
   * the end of each post, and the one on hail-mail.html. All are the same
   * Netlify form ("email-subscribe"), so one handler posts them in place and
   * swaps the form for a thank-you instead of leaving the page for Netlify's
   * generic success screen. A subscribe from any of them sets bw_sub, which
   * retires the modal and the bar on this browser.
   */
  var SUB_KEY = 'bw_sub';
  function markSeen() {
    try { localStorage.setItem(SUB_KEY, '1'); } catch {}
  }
  Array.prototype.forEach.call(document.querySelectorAll('form[name="email-subscribe"]'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Which form ("popup", "post", "page") plus the link tag this visit
      // arrived on, e.g. "post:reddit", so the subscriber list says what works.
      var src = form.querySelector('input[name="src"]');
      var via = sessionVia();
      if (src && via && src.value.indexOf(':') === -1) src.value += ':' + via;
      var done = function () {
        form.innerHTML = '<p class="subscribe-done">You\'re on the list. Hail.</p>';
        markSeen();
        form.dispatchEvent(new CustomEvent('subscribed', { bubbles: true }));
      };
      // A failed request still says thanks: Netlify keeps every submission it
      // receives, and a network blip reading as "you're not on the list" would
      // just get the same address typed in twice.
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString() })
        .then(done, done);
    });
  });

  /**
   * "Call your shot", the reader score poll (predictionWidget() in
   * templates.js). Posts in place like the Hail Mail forms above, then
   * swaps the form for the crowd's pick from the predictions function. One
   * pick per game per browser, remembered in localStorage, so a reader who
   * comes back sees their call and the crowd's instead of a blank form. Once
   * kickoff passes the form goes for everyone and the card just shows what
   * readers called.
   *
   * A page can carry the card more than once (the sidebar, a few headlines
   * down the river on phones, the end of a pregame post), so the copies for
   * one game share a pick: lock it in on any of them and they all flip.
   *
   * The crowd numbers are cached for about a minute (see predictions.js), and
   * a pick is filed a moment after it's sent, so a brand-new pick can take a
   * minute to show up in them. The reader's own line shows straight away.
   */
  var POLL_NAME_KEY = 'bw_poll_name';
  var pollName = '';
  try { pollName = localStorage.getItem(POLL_NAME_KEY) || ''; } catch (e) { pollName = ''; }
  var pollGroups = {};
  Array.prototype.forEach.call(document.querySelectorAll('.widget-poll'), function (card) {
    var key = card.getAttribute('data-poll-key');
    (pollGroups[key] = pollGroups[key] || []).push(card);
  });
  Object.keys(pollGroups).forEach(function (key) {
    var cards = pollGroups[key];
    var opponent = cards[0].getAttribute('data-opponent');
    var kickoff = Date.parse(cards[0].getAttribute('data-kickoff'));
    var storeKey = 'bw_pick_' + key;
    var mine = null;
    try { mine = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (e) { mine = null; }

    function show(card, summary, note) {
      var results = card.querySelector('.poll-results');
      function line(className, text) {
        var p = document.createElement('p');
        p.className = className;
        p.textContent = text;
        results.appendChild(p);
        return p;
      }
      results.textContent = '';
      if (mine) line('poll-mine', 'Your call: Commanders ' + mine.us + ', ' + opponent + ' ' + mine.them + '.');
      if (mine && mine.name) line('poll-meta', 'You\'re on the board as ' + mine.name + '.');
      if (summary && summary.count) {
        var crowd = line('poll-crowd', '');
        var label = document.createElement('span');
        label.className = 'poll-crowd-label';
        label.textContent = 'Readers say';
        var score = document.createElement('strong');
        score.textContent = 'Commanders ' + summary.commanders + ', ' + opponent + ' ' + summary.opponent;
        crowd.appendChild(label);
        crowd.appendChild(score);
        line('poll-meta', summary.winPct + '% have us winning · ' + summary.count + (summary.count === 1 ? ' pick' : ' picks'));
      } else if (summary && mine) {
        line('poll-meta', 'Yours is the first pick in. Bold.');
      }
      if (note) line('poll-meta', note);
      results.hidden = false;
    }
    function load(note) {
      fetch('/.netlify/functions/predictions?game=' + encodeURIComponent(key), { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) { cards.forEach(function (c) { show(c, s, note); }); },
          function () { cards.forEach(function (c) { show(c, null, note); }); });
    }
    function lock(note) {
      cards.forEach(function (c) {
        var f = c.querySelector('.poll-form');
        if (f) f.remove();
      });
      load(note);
    }

    if (Date.now() >= kickoff) { lock('Picks locked at kickoff.'); return; }
    if (mine) { lock(); return; }

    cards.forEach(function (card) {
      var form = card.querySelector('.poll-form');
      if (!form) return;
      var nameInput = form.querySelector('input[name="name"]');
      var emailRow = form.querySelector('.poll-email');
      // The email only matters to someone joining the board, so its row waits
      // for a name. With JavaScript off, both rows simply show.
      function syncEmail() {
        if (emailRow) emailRow.hidden = !(nameInput && nameInput.value.trim());
      }
      if (nameInput && pollName) nameInput.value = pollName;
      syncEmail();
      if (nameInput) nameInput.addEventListener('input', syncEmail);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = new FormData(form);
        var name = String(data.get('name') || '').trim();
        mine = { us: Number(data.get('commanders')), them: Number(data.get('opponent')) };
        if (name) mine.name = name;
        try {
          localStorage.setItem(storeKey, JSON.stringify(mine));
          if (name) localStorage.setItem(POLL_NAME_KEY, name);
        } catch (err) {}
        if (name) pollName = name;
        // Same as a Hail Mail signup: no popup asking them again.
        if (String(data.get('email') || '').trim()) markSeen();
        // Same as the Hail Mail forms: a failed request still moves on, since
        // Netlify keeps whatever it received and a retry would only double it.
        var done = function () { lock(); };
        // The board is cached for a minute; put the new name in the "In for"
        // line now rather than leave the reader wondering whether it took.
        if (name) document.dispatchEvent(new CustomEvent('bw:picked', { detail: { name: name } }));
        fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(data).toString() })
          .then(done, done);
      });
    });
  });

  /**
   * The season leaderboard inside each poll card (.poll-board), and the
   * "Readers called it" box at the end of a post about a game that's been
   * played (.post-poll-results, postPoll() in templates.js). One request
   * serves both: the predictions function's ?board=season, scored by
   * buildBoard() in src/lib/predictions.js.
   */
  (function () {
    var boards = document.querySelectorAll('.poll-board');
    var calledIt = document.querySelectorAll('.post-poll-results[data-game]');
    // The full board on leaderboard.html (renderLeaderboardPage() in templates.js).
    var boardPage = document.querySelector('[data-leaderboard-page]');
    if (!boards.length && !calledIt.length && !boardPage) return;

    function make(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }
    function same(a, b) {
      var squash = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); };
      return squash(a) && squash(a) === squash(b);
    }
    function names(list) {
      if (list.length <= 6) return list.join(', ');
      return list.slice(0, 5).join(', ') + ' and ' + (list.length - 5) + ' more';
    }
    function row(r, rank, isMe) {
      var li = make('li', isMe ? 'is-me' : '');
      li.appendChild(make('span', 'board-rank', String(rank)));
      li.appendChild(make('span', 'board-name', r.name));
      li.appendChild(make('span', 'board-rec', r.right + '-' + (r.played - r.right)));
      var miss = make('span', 'board-miss', '±' + r.avgMiss);
      miss.title = 'Average points off per game';
      li.appendChild(miss);
      return li;
    }
    function renderBoard(box, data) {
      var rows = data.standings || [];
      var pending = data.pending && data.pending.names.length ? data.pending : null;
      box.textContent = '';
      if (!rows.length && !pending) { box.hidden = true; return; }
      box.appendChild(make('p', 'poll-board-title', 'Season standings'));
      if (rows.length) {
        var list = make('ol', 'poll-board-list');
        var meAt = -1;
        rows.forEach(function (r, i) { if (meAt < 0 && same(r.name, pollName)) meAt = i; });
        rows.slice(0, 5).forEach(function (r, i) { list.appendChild(row(r, i + 1, i === meAt)); });
        // A reader below the top five still sees where they stand.
        if (meAt >= 5) list.appendChild(row(rows[meAt], meAt + 1, true));
        box.appendChild(list);
        box.appendChild(make('p', 'poll-board-note', 'Most right winners, then fewest points off a game.'));
      }
      if (pending) box.appendChild(make('p', 'poll-board-pending', 'In for the ' + pending.opponent + ': ' + names(pending.names)));
      var more = make('a', 'poll-board-link', 'Full standings →');
      more.href = 'leaderboard.html';
      box.appendChild(more);
      box.hidden = false;
    }
    /** "2026-10-19-SF" as "Oct 19": the poll key carries the kickoff date. */
    function gameDate(key) {
      var m = /^(\d{4})-(\d{2})-(\d{2})-/.exec(key);
      if (!m) return key;
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
    /**
     * Everyone, every scored game: the whole board, on its own page. Same
     * data as the card's top five; the card links here for the rest.
     */
    function renderBoardPage(box, data) {
      var rows = data.standings || [];
      var games = data.games || [];
      var pending = data.pending && data.pending.names.length ? data.pending : null;
      box.textContent = '';
      box.appendChild(make('h2', null, 'Season standings'));
      if (!rows.length) {
        box.appendChild(make('p', 'board-empty', pending
          ? 'Nobody has been scored yet. The first standings go up after the ' + pending.opponent + ' game.'
          : 'Nobody is on the board yet. Put a name on your pick and you are first.'));
      } else {
        var table = make('table', 'data-table board-table');
        var head = make('thead');
        var hr = make('tr');
        [['#', true], ['Name'], ['Record', true], ['Avg off', true], ['Games', true]].forEach(function (h) {
          hr.appendChild(make('th', h[1] ? 'num' : null, h[0]));
        });
        head.appendChild(hr);
        table.appendChild(head);
        var body = make('tbody');
        rows.forEach(function (r, i) {
          var tr = make('tr', (same(r.name, pollName) ? 'is-me ' : '') + (r.house ? 'is-house' : ''));
          tr.appendChild(make('td', 'num', String(i + 1)));
          tr.appendChild(make('td', 'board-name', r.name));
          tr.appendChild(make('td', 'num', r.right + '-' + (r.played - r.right)));
          var miss = make('td', 'num', '±' + r.avgMiss);
          miss.title = 'Average points off per game';
          tr.appendChild(miss);
          tr.appendChild(make('td', 'num', String(r.played)));
          body.appendChild(tr);
        });
        table.appendChild(body);
        var wrap = make('div', 'table-scroll');
        wrap.appendChild(table);
        box.appendChild(wrap);
        box.appendChild(make('p', 'data-sub', 'Most right winners, then fewest points off a game (our score plus theirs).'));
      }
      if (pending) box.appendChild(make('p', 'board-pending', 'In for the ' + pending.opponent + ': ' + pending.names.join(', ') + '.'));
      games.forEach(function (g) {
        var sec = make('div', 'board-game');
        sec.appendChild(make('h3', null, gameDate(g.game) + ' · ' + g.opponent + ' · Final: Commanders ' + g.final.us + ', ' + g.opponent + ' ' + g.final.them));
        var line = g.players + (g.players === 1 ? ' named pick.' : ' named picks.');
        if (g.closest.length) {
          line += ' Closest: ' + g.closest.map(function (c) {
            return c.name + ' (' + c.commanders + '-' + c.opponent + ', off by ' + c.miss + (c.right ? '' : ', wrong winner') + ')';
          }).join(', ') + '.';
        }
        sec.appendChild(make('p', null, line));
        box.appendChild(sec);
      });
    }
    function boardPageFailed() {
      var note = boardPage && boardPage.querySelector('.board-loading');
      if (note) note.textContent = 'The standings did not load. Try again in a minute.';
    }
    function renderCalledIt(box, data) {
      var key = box.getAttribute('data-game');
      var final = (data.finals || {})[key];
      if (!final) return;
      var game = (data.games || []).filter(function (g) { return g.game === key; })[0];
      fetch('/.netlify/functions/predictions?game=' + encodeURIComponent(key), { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
        .then(function (crowd) {
          var count = crowd && crowd.count;
          if (!count && !game) return;
          var them = final.opponent;
          box.textContent = '';
          box.appendChild(make('p', 'post-poll-eyebrow', 'Readers called it'));
          box.appendChild(make('p', 'post-poll-final', 'Final: Commanders ' + final.us + ', ' + them + ' ' + final.them));
          if (count) {
            box.appendChild(make('p', 'post-poll-line', 'The crowd said Commanders ' + crowd.commanders + ', ' + them + ' ' + crowd.opponent +
              ' (' + count + (count === 1 ? ' pick, ' : ' picks, ') + crowd.winPct + '% had us winning).'));
          }
          if (game && game.closest.length) {
            box.appendChild(make('p', 'post-poll-line', 'Closest: ' + game.closest.map(function (c) {
              return c.name + ' (' + c.commanders + '-' + c.opponent + ', off by ' + c.miss + ')';
            }).join(', ') + '.'));
          }
          var link = make('a', 'post-poll-link', 'Season standings and this week\'s pick →');
          link.href = 'leaderboard.html';
          box.appendChild(link);
          box.hidden = false;
        });
    }

    var loaded = null;
    document.addEventListener('bw:picked', function (e) {
      var pending = loaded && loaded.pending;
      if (!pending || pending.names.some(function (n) { return same(n, e.detail.name); })) return;
      pending.names.push(e.detail.name);
      Array.prototype.forEach.call(boards, function (box) { renderBoard(box, loaded); });
      if (boardPage) renderBoardPage(boardPage, loaded);
    });

    fetch('/.netlify/functions/predictions?board=season', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) { boardPageFailed(); return; }
        loaded = data;
        Array.prototype.forEach.call(boards, function (box) { renderBoard(box, data); });
        Array.prototype.forEach.call(calledIt, function (box) { renderCalledIt(box, data); });
        if (boardPage) renderBoardPage(boardPage, data);
      }, boardPageFailed);
  })();

  // Links to #call-your-shot (Hail Mail, the "Readers called it" box) land on
  // the sidebar's copy, which on a phone is under every headline. The river
  // carries its own copy there, so go to that one instead. After load, and a
  // tick after that, because the browser does its own jump to the sidebar
  // copy once the page has loaded and would otherwise undo this one.
  if (location.hash === '#call-your-shot') {
    window.addEventListener('load', function () {
      setTimeout(function () {
        var feedPoll = document.getElementById('call-your-shot-feed');
        // Instant, not the page's usual smooth scroll: arriving somewhere
        // shouldn't play a 1,000px glide.
        if (feedPoll && feedPoll.offsetParent !== null) feedPoll.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, 0);
    });
  }

  /**
   * The Social Feed page, live during a game (netlify/functions/social-live.js).
   * The page carries the game window as data-live-from/data-live-to (worked
   * out at build time, liveWindowAttrs() in templates.js). Inside it, and only
   * while the tab is visible, this asks the function for the newest posts once
   * a minute and slides any it hasn't shown yet into place by time, already
   * rendered the same way as the rest of the list. Outside the window it
   * looks once when the page opens (Oct 22: the site stopped redeploying
   * every couple of hours just for new posts, see src/site/build-hash.js),
   * then sleeps until the window's start if the page is left open.
   * `?live=1` forces live mode on, for previewing.
   */
  (function () {
    var list = document.querySelector('.social-feed-list');
    if (!list) return;
    var forced = /[?&]live=1\b/.test(window.location.search);
    var from = Date.parse(list.getAttribute('data-live-from'));
    var to = Date.parse(list.getAttribute('data-live-to'));
    var status = document.getElementById('social-live-status');
    var statusText = status && status.querySelector('.social-live-text');
    var seen = {};
    Array.prototype.forEach.call(list.querySelectorAll('[data-post-id]'), function (el) {
      seen[el.getAttribute('data-post-id')] = true;
    });
    var timer = null;
    var MINUTE = 60000;
    function isLive() { var now = Date.now(); return forced || (now >= from && now <= to); }
    function later(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
    var pulledOnce = false;
    function tick() {
      if (!isLive()) {
        if (status) status.hidden = true;
        // One look per page view outside a game: no polling, no status line.
        if (!pulledOnce && !document.hidden) { pulledOnce = true; pull(false); }
        // Left open before kickoff: check back when the window opens (capped,
        // since browsers stretch long timers in background tabs anyway).
        if (Date.now() < from) later(Math.min(from - Date.now(), 30 * MINUTE));
        return;
      }
      if (status) status.hidden = false;
      if (document.hidden) { later(MINUTE); return; }
      pull(true).then(function () { later(MINUTE); });
    }
    function pull(live) {
      return fetch('/.netlify/functions/social-live', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.posts) return;
          var fresh = data.posts.filter(function (p) { return p.id && !seen[p.id]; });
          var shown = 0;
          // Oldest first (the answer is newest first), so on an empty page
          // each one has the one before it to sort against.
          fresh.slice().reverse().forEach(function (p) {
            seen[p.id] = true;
            // Into its place by time, not just the top: the page also holds
            // Nicki's posts (not in the live answer), and the mirror can be
            // a few minutes behind, so a "new" post isn't always the newest.
            var at = Date.parse(p.publishedAt) || 0;
            var before = null;
            var items = list.querySelectorAll('.social-feed-post');
            for (var i = 0; i < items.length; i++) {
              if ((Date.parse(items[i].getAttribute('data-published')) || 0) < at) { before = items[i]; break; }
            }
            var el;
            if (before) {
              before.insertAdjacentHTML('beforebegin', p.html);
              el = before.previousElementSibling;
            } else if (!items.length) {
              // An empty page (a quiet stretch before kickoff): anything goes.
              list.insertAdjacentHTML('beforeend', p.html);
              el = list.lastElementChild;
              var empty = list.parentNode.querySelector('.river-empty');
              if (empty) empty.hidden = true;
            } else {
              // Older than everything on the page: not news, leave it out.
              return;
            }
            el.classList.add('is-new');
            shown++;
          });
          if (live && statusText) {
            statusText.textContent = 'Live: checking for new posts every minute' +
              (shown ? '. ' + shown + (shown === 1 ? ' new post' : ' new posts') + ' just now.' : '');
          }
        }, function () {});
    }
    document.addEventListener('visibilitychange', function () {
      // A page opened in a background tab gets its one look when it's shown.
      if (!document.hidden && (isLive() || !pulledOnce)) tick();
    });
    tick();
  })();

  /**
   * Email subscribe modal. Opens on its own on every 10th visit, but never:
   *   - if the visitor has already dismissed or submitted (bw_sub key set)
   *   - if the admin session cookie is present (site owner browsing)
   * The Hail Mail bar's "Sign me up" also opens it, on any visit.
   *
   * The close buttons are wired up on every load, not just the 10th. They used
   * to be attached only when the modal opened itself, so on nine visits out of
   * ten, opening it from the bar gave a modal that couldn't be closed.
   */
  (function () {
    var modal = document.getElementById('subscribe-modal');
    if (!modal) return;

    function alreadySeen() {
      try { return Boolean(localStorage.getItem(SUB_KEY)); } catch { return true; }
    }
    function close() {
      modal.hidden = true;
      markSeen();
    }
    function isAdmin() {
      return document.cookie.split(';').some(function (c) { return c.trim() === 'bw_owner=1'; });
    }

    modal.querySelector('#subscribe-dismiss').addEventListener('click', close);
    modal.querySelector('#subscribe-skip').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    modal.addEventListener('subscribed', function () {
      setTimeout(function () { modal.hidden = true; }, 2000);
    });

    if (alreadySeen() || isAdmin()) return;

    // From a browser's 2nd pageview on, at most once every two weeks, until
    // the reader signs up or closes it (either one retires it for good, see
    // close() and markSeen() above). It used to wait for the 10th pageview,
    // which meant a reader who came in from Reddit and read two pages never
    // saw it at all; across a billion popup displays a two-page delay
    // converted best (see docs/viewership-deep-dive.md). Page one is left
    // alone so nobody gets asked before they've read anything.
    var VISIT_KEY = 'bw_visits';
    var PROMPTED_KEY = 'bw_sub_prompted';
    var visits;
    try { visits = (Number(localStorage.getItem(VISIT_KEY)) || 0) + 1; localStorage.setItem(VISIT_KEY, String(visits)); } catch { visits = 1; }
    if (visits < 2) return;
    var lastPrompt = 0;
    try { lastPrompt = Number(localStorage.getItem(PROMPTED_KEY)) || 0; } catch (e) {}
    if (Date.now() - lastPrompt < 14 * 86400000) return;

    // Small delay so the page content loads first. Not over the 5,000th-reader
    // welcome, which has the floor if it's up.
    setTimeout(function () {
      if (document.querySelector('.milestone-modal')) return;
      modal.hidden = false;
      try { localStorage.setItem(PROMPTED_KEY, String(Date.now())); } catch (e) {}
    }, 3000);
  }());

  /**
   * Photo slideshows in a Blog post (see photoSlideshow() in templates.js).
   *
   * The markup is already a working gallery before this runs: a CSS
   * scroll-snap strip you can swipe or trackpad through. Everything here is
   * addition, never repair, so nothing below is allowed to hide a slide or
   * take the track out of the scroll flow. If this function throws on some
   * browser we have never heard of, a reader still sees every photo.
   *
   * querySelectorAll, not one lookup: blog.html renders every post in full, so
   * that page carries one instance per post and each needs its own state.
   */
  (function () {
    var shows = document.querySelectorAll('[data-slideshow]');
    if (!shows.length) return;

    // Advance on a timer only for readers who haven't asked us not to. Read
    // once at setup; someone flipping the OS setting mid-article is not worth
    // a listener.
    var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ADVANCE_MS = 6000;

    function setup(show) {
      var track = show.querySelector('[data-slideshow-track]');
      var viewport = show.querySelector('.slideshow-viewport');
      var slides = track ? track.children : [];
      if (!track || !viewport || slides.length < 2) return;

      var index = 0;
      var timer = null;
      // Per instance, not shared: blog.html has several of these on one page,
      // and calling a halt to one shouldn't freeze the others.
      var mayAutoplay = !REDUCED;

      function arrow(dir, label, glyph) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slideshow-arrow slideshow-arrow-' + dir;
        b.setAttribute('aria-label', label);
        b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="' + glyph + '"/></svg>';
        viewport.appendChild(b);
        return b;
      }

      var prev = arrow('prev', 'Previous photo', 'M15 4l-8 8 8 8z');
      var next = arrow('next', 'Next photo', 'M9 4l8 8-8 8z');

      var dotRow = document.createElement('div');
      dotRow.className = 'slideshow-dots';
      var dots = [];
      for (var i = 0; i < slides.length; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'slideshow-dot';
        dot.setAttribute('aria-label', 'Photo ' + (i + 1) + ' of ' + slides.length);
        (function (n) {
          dot.addEventListener('click', function () { stop(); go(n); });
        }(i));
        dotRow.appendChild(dot);
        dots.push(dot);
      }
      show.appendChild(dotRow);

      /** Scroll position is the single source of truth, so a swipe, a trackpad
       *  flick and an arrow press all end up reported the same way. */
      function sync() {
        var width = slides[0].offsetWidth || 1;
        index = Math.round(track.scrollLeft / width);
        if (index < 0) index = 0;
        if (index > slides.length - 1) index = slides.length - 1;
        for (var i = 0; i < dots.length; i++) {
          dots[i].setAttribute('aria-current', i === index ? 'true' : 'false');
        }
        prev.disabled = index === 0;
        next.disabled = index === slides.length - 1;
      }

      function go(n) {
        if (n < 0 || n > slides.length - 1) return;
        track.scrollLeft = slides[0].offsetWidth * n;
      }

      /** Autoplay is a one-way door: once the reader touches anything they are
       *  driving, and we don't take the wheel back mid-read. */
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        mayAutoplay = false;
      }

      function start() {
        if (!mayAutoplay || timer) return;
        timer = setInterval(function () {
          if (index >= slides.length - 1) { stop(); return; }
          go(index + 1);
        }, ADVANCE_MS);
      }

      prev.addEventListener('click', function () { stop(); go(index - 1); });
      next.addEventListener('click', function () { stop(); go(index + 1); });

      // A manual scroll is the reader taking over too, but scroll also fires
      // for our own go() calls, so only treat a real pointer or wheel gesture
      // as intent.
      ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (evt) {
        track.addEventListener(evt, stop, { passive: true });
      });

      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      });

      var queued = false;
      track.addEventListener('scroll', function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; sync(); });
      }, { passive: true });

      show.addEventListener('mouseenter', function () { if (timer) { clearInterval(timer); timer = null; } });
      show.addEventListener('mouseleave', start);
      show.addEventListener('focusin', function () { if (timer) { clearInterval(timer); timer = null; } });

      // Don't burn through the set while it's below the fold. Without an
      // observer, just leave it parked until the reader does something.
      if (typeof IntersectionObserver === 'function') {
        new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) start();
          else if (timer) { clearInterval(timer); timer = null; }
        }, { threshold: 0.5 }).observe(show);
      }

      sync();
      // Recompute on resize: slide width drives every position we set, and the
      // aspect-ratio breakpoint at 640px changes it out from under us.
      window.addEventListener('resize', sync);
    }

    for (var s = 0; s < shows.length; s++) setup(shows[s]);
  }());
})();
