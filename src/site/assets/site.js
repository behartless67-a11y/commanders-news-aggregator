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
  if (document.cookie.split(';').some(function (c) { return c.trim().startsWith('admin_session='); })) {
    // admin browsing — don't count this
  } else
  fetch('/.netlify/functions/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer,
      sid: sessionId(),
      returning: isReturningVisitor(),
      // A bare number, bucketed server-side (see deviceBucket() in
      // track.js) rather than a label chosen here — one thing this client
      // doesn't have to decide, and one fewer arbitrary string that could
      // reach the server.
      viewportWidth: window.innerWidth,
    }),
  }).catch(function () {});

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
    function isAdmin() { return document.cookie.split(';').some(function (c) { return c.trim().startsWith('admin_session='); }); }
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
   * Email subscribe modal. Shows to roughly 1 in 10 page loads, but never:
   *   - if the visitor has already dismissed or submitted (bw_sub key set)
   *   - if the admin session cookie is present (site owner browsing)
   *   - on the admin page itself
   * The form submits to Netlify Forms; on success we set the key so it
   * never shows again on this browser.
   */
  (function () {
    var modal = document.getElementById('subscribe-modal');
    if (!modal) return;

    var SUB_KEY = 'bw_sub';

    function alreadySeen() {
      try { return Boolean(localStorage.getItem(SUB_KEY)); } catch { return true; }
    }
    function markSeen() {
      try { localStorage.setItem(SUB_KEY, '1'); } catch {}
    }
    function isAdmin() {
      return document.cookie.split(';').some(function (c) { return c.trim().startsWith('admin_session='); });
    }

    if (alreadySeen() || isAdmin()) return;

    // Show on every 10th visit rather than randomly — feels intentional,
    // not annoying, and gives regulars a break between prompts.
    var VISIT_KEY = 'bw_visits';
    var visits;
    try { visits = (Number(localStorage.getItem(VISIT_KEY)) || 0) + 1; localStorage.setItem(VISIT_KEY, String(visits)); } catch { visits = 1; }
    if (visits % 10 !== 0) return;

    // Small delay so the page content loads first
    setTimeout(function () {
      modal.hidden = false;
      modal.querySelector('#subscribe-dismiss').addEventListener('click', function () {
        modal.hidden = true;
        markSeen();
      });
      modal.querySelector('#subscribe-skip').addEventListener('click', function () {
        modal.hidden = true;
        markSeen();
      });
      // Close on backdrop click
      modal.addEventListener('click', function (e) {
        if (e.target === modal) { modal.hidden = true; markSeen(); }
      });
      // Handle form submit
      var form = modal.querySelector('.subscribe-modal-form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = new FormData(form);
        fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(data).toString() })
          .then(function () {
            form.innerHTML = '<p style="color:var(--gold);font-weight:700;text-align:center;margin:0">You\'re on the list. Hail.</p>';
            setTimeout(function () { modal.hidden = true; }, 2000);
            markSeen();
          }).catch(function () {
            form.innerHTML = '<p style="color:var(--gold);font-weight:700;text-align:center;margin:0">You\'re on the list. Hail.</p>';
            setTimeout(function () { modal.hidden = true; }, 2000);
            markSeen();
          });
      });
    }, 3000);
  }());
})();
