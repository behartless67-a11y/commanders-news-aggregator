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
   * Progressive reveal of the river.
   *
   * The build ships every headline and marks the ones past the first batch with
   * .card-extra; CSS hides those while .river carries .is-collapsed. So this only
   * flips classes — nothing is fetched, and a reader with JavaScript off gets the
   * whole river via the <noscript> override rather than a dead button.
   */
  var river = document.querySelector('.river.is-collapsed');
  var more = river && river.querySelector('.river-more');

  if (river && more) {
    var batch = Number(more.getAttribute('data-batch')) || 10;
    var label = more.querySelector('.river-more-label');

    more.addEventListener('click', function () {
      var hidden = river.querySelectorAll('.card-extra:not(.is-revealed)');
      var reveal = Math.min(batch, hidden.length);
      for (var i = 0; i < reveal; i++) hidden[i].classList.add('is-revealed');

      var left = hidden.length - reveal;
      if (left <= 0) {
        // Nothing else to show — drop the collapsed state entirely so the
        // last-card border rules behave as they do on a fully expanded page.
        river.classList.remove('is-collapsed');
        more.remove();
        return;
      }
      if (label) label.textContent = 'Show ' + Math.min(batch, left) + ' more';
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
})();
