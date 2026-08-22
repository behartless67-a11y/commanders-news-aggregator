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
  // Balanced against the video widget alone, not the whole sidebar — the
  // schedule list underneath it runs much longer than any reasonable initial
  // batch of players should chase.
  setupReveal('.roster-list', '.roster-more', 'roster-row-extra', '.widget-videos');

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
})();
