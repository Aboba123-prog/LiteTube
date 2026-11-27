/* LiteTube - ES5, no dependencies */
(function () {
  'use strict';

  /* ---------- Data (embedded, no external JSON) ---------- */
  var SRC_A = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
  var SRC_B = 'https://www.w3schools.com/html/mov_bbb.mp4';

  var VIDEOS = [
    { id: 1, title: 'Flower Blooming Time-lapse',  channel: 'Nature Lab',     views: '1.2M views', age: '2 days ago',   dur: '0:06', src: SRC_A, color: '#c0392b', tags: 'nature flower garden spring' },
    { id: 2, title: 'Big Buck Bunny - Short Clip', channel: 'Open Movies',    views: '980K views', age: '1 week ago',   dur: '0:10', src: SRC_B, color: '#2980b9', tags: 'animation cartoon bunny' },
    { id: 3, title: 'Relaxing Garden Colours',     channel: 'Calm Channel',   views: '450K views', age: '3 weeks ago',  dur: '0:06', src: SRC_A, color: '#27ae60', tags: 'relax garden colours nature' },
    { id: 4, title: 'Cartoon Fun for Everyone',    channel: 'Toon Time',      views: '2.1M views', age: '1 month ago',  dur: '0:10', src: SRC_B, color: '#8e44ad', tags: 'cartoon fun kids animation' },
    { id: 5, title: 'Macro Flowers in Close-up',   channel: 'Nature Lab',     views: '300K views', age: '4 days ago',   dur: '0:06', src: SRC_A, color: '#d35400', tags: 'macro flower nature closeup' },
    { id: 6, title: 'Funny Bunny Moments',         channel: 'Open Movies',    views: '76K views',  age: '5 days ago',   dur: '0:10', src: SRC_B, color: '#16a085', tags: 'funny bunny animals' },
    { id: 7, title: 'Spring Is Here',              channel: 'Seasons',        views: '1.8M views', age: '2 months ago', dur: '0:06', src: SRC_A, color: '#f39c12', tags: 'spring season flower' },
    { id: 8, title: 'Animation Basics Demo',       channel: 'Learn Studio',   views: '58K views',  age: '6 days ago',   dur: '0:10', src: SRC_B, color: '#34495e', tags: 'animation tutorial learn' }
  ];

  var SHORTS = [
    { title: 'Tiny flower, big colour',  channel: '@natureLab',  src: SRC_A, color: '#e74c3c' },
    { title: 'Bunny says hello',         channel: '@openmovies', src: SRC_B, color: '#3498db' },
    { title: 'Garden in 6 seconds',      channel: '@calm',       src: SRC_A, color: '#2ecc71' },
    { title: 'Cartoon quick laugh',      channel: '@toontime',   src: SRC_B, color: '#9b59b6' },
    { title: 'Spring vibes',             channel: '@seasons',    src: SRC_A, color: '#f1c40f' }
  ];

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function on(el, evt, fn) {
    if (!el) { return; }
    if (el.addEventListener) { el.addEventListener(evt, fn, false); }
    else if (el.attachEvent) { el.attachEvent('on' + evt, fn); }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasClass(el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1; }
  function addClass(el, c) { if (!hasClass(el, c)) { el.className = (el.className + ' ' + c).replace(/^\s+|\s+$/g, ''); } }
  function removeClass(el, c) {
    el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  function preventDefault(e) {
    e = e || window.event;
    if (e.preventDefault) { e.preventDefault(); } else { e.returnValue = false; }
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (err) { return s; }
  }

  function findVideo(id) {
    var i;
    for (i = 0; i < VIDEOS.length; i++) {
      if (String(VIDEOS[i].id) === String(id)) { return VIDEOS[i]; }
    }
    return null;
  }

  /* ---------- Cards ---------- */
  function cardHtml(v) {
    return '<div class="card" data-id="' + v.id + '">' +
      '<span class="thumb" style="background:' + v.color + '">' +
      '<span class="play-icon"></span>' +
      '<span class="badge">' + esc(v.dur) + '</span></span>' +
      '<span class="card-title">' + esc(v.title) + '</span>' +
      '<p class="meta">' + esc(v.channel) + '<br>' + esc(v.views) + ' &middot; ' + esc(v.age) + '</p>' +
      '</div>';
  }

  function renderFeed(container, list) {
    var html = '', i;
    for (i = 0; i < list.length; i++) { html += cardHtml(list[i]); }
    container.innerHTML = html;
  }

  /* One delegated click handler per feed (fewer listeners = lighter) */
  function bindFeed(container) {
    on(container, 'click', function (e) {
      e = e || window.event;
      var t = e.target || e.srcElement;
      while (t && t !== container) {
        if (t.className && hasClass(t, 'card')) {
          var v = findVideo(t.getAttribute('data-id'));
          if (v) { openPlayer(v); }
          return;
        }
        t = t.parentNode;
      }
    });
  }

  /* ---------- Player overlay ---------- */
  var playerEl, holderEl;

  function openPlayer(v) {
    holderEl.innerHTML = '<video controls autoplay preload="auto" src="' + esc(v.src) + '"></video>';
    $('playerTitle').innerHTML = esc(v.title);
    $('playerMeta').innerHTML = esc(v.channel) + ' &middot; ' + esc(v.views) + ' &middot; ' + esc(v.age);
    addClass(playerEl, 'open');
  }

  function closePlayer() {
    var vid = holderEl.getElementsByTagName('video')[0];
    if (vid) { try { vid.pause(); } catch (err) {} }
    holderEl.innerHTML = '';   /* frees the media resource */
    removeClass(playerEl, 'open');
  }

  /* ---------- Search ---------- */
  function searchVideos(q) {
    var words = q.toLowerCase().replace(/^\s+|\s+$/g, '').split(/\s+/);
    var out = [], i, j, hay, ok;
    for (i = 0; i < VIDEOS.length; i++) {
      hay = (VIDEOS[i].title + ' ' + VIDEOS[i].channel + ' ' + VIDEOS[i].tags).toLowerCase();
      ok = true;
      for (j = 0; j < words.length; j++) {
        if (words[j] && hay.indexOf(words[j]) === -1) { ok = false; break; }
      }
      if (ok) { out.push(VIDEOS[i]); }
    }
    return out;
  }

  function renderSearch(q) {
    var results = q ? searchVideos(q) : VIDEOS;
    $('searchHeading').innerHTML = q
      ? 'Results for "' + esc(q) + '" (' + results.length + ')'
      : 'All videos';
    renderFeed($('searchFeed'), results);
    $('searchEmpty').style.display = results.length ? 'none' : 'block';
    $('searchInput').value = q;
  }

  function submitSearch() {
    var q = $('searchInput').value.replace(/^\s+|\s+$/g, '');
    window.location.hash = '#/search/' + encodeURIComponent(q);
  }

  /* ---------- Shorts (one video element at a time) ---------- */
  var shortIndex = 0;
  var shortPlaying = false;

  function currentShortVideo() {
    return $('shortFrame').getElementsByTagName('video')[0] || null;
  }

  function renderShort() {
    var s = SHORTS[shortIndex];
    var frame = $('shortFrame');
    frame.innerHTML =
      '<div class="short-bg" style="background:' + s.color + '"></div>' +
      '<video loop muted preload="metadata" playsinline webkit-playsinline src="' + esc(s.src) + '"></video>' +
      '<div class="short-info"><strong>' + esc(s.title) + '</strong><span>' + esc(s.channel) + '</span></div>' +
      '<div class="short-pause" id="shortPauseIcon">&#9654;</div>';
    $('shortCount').innerHTML = (shortIndex + 1) + ' / ' + SHORTS.length;
    playShort();
  }

  function playShort() {
    var v = currentShortVideo();
    var icon = $('shortPauseIcon');
    if (!v) { return; }
    try {
      var p = v.play();
      if (p && p.then) { p.then(function () { setShortState(true); }, function () { setShortState(false); }); }
      else { setShortState(true); }
    } catch (err) { setShortState(false); }
    if (icon) { icon.style.display = 'none'; }
  }

  function pauseShort() {
    var v = currentShortVideo();
    if (v) { try { v.pause(); } catch (err) {} }
    setShortState(false);
  }

  function setShortState(playing) {
    shortPlaying = playing;
    var icon = $('shortPauseIcon');
    if (icon) { icon.style.display = playing ? 'none' : 'block'; }
  }

  function toggleShort() { if (shortPlaying) { pauseShort(); } else { playShort(); } }

  function goShort(step) {
    shortIndex = (shortIndex + step + SHORTS.length) % SHORTS.length;
    renderShort();
  }

  function stopShorts() {
    pauseShort();
    $('shortFrame').innerHTML = '';   /* release the video */
  }

  function bindShorts() {
    var frame = $('shortFrame');
    var startY = null;

    on($('shortPrev'), 'click', function () { goShort(-1); });
    on($('shortNext'), 'click', function () { goShort(1); });

    on(frame, 'click', toggleShort);

    on(frame, 'touchstart', function (e) {
      if (e.touches && e.touches.length) { startY = e.touches[0].clientY; }
    });
    on(frame, 'touchend', function (e) {
      if (startY === null || !e.changedTouches || !e.changedTouches.length) { return; }
      var dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (dy < -50) { goShort(1); }
      else if (dy > 50) { goShort(-1); }
    });

    on(document, 'keydown', function (e) {
      e = e || window.event;
      var k = e.keyCode;
      if (!hasClass($('view-shorts'), 'active')) { return; }
      if (k === 38) { goShort(-1); preventDefault(e); }
      else if (k === 40) { goShort(1); preventDefault(e); }
      else if (k === 32) { toggleShort(); preventDefault(e); }
    });
  }

  /* ---------- Router (hash based) ---------- */
  var views = ['home', 'search', 'shorts'];
  var homeRendered = false;

  function showView(name) {
    var i;
    for (i = 0; i < views.length; i++) {
      removeClass($('view-' + views[i]), 'active');
    }
    addClass($('view-' + name), 'active');
    removeClass($('tab-home'), 'active');
    removeClass($('tab-shorts'), 'active');
    if (name === 'home') { addClass($('tab-home'), 'active'); }
    if (name === 'shorts') { addClass($('tab-shorts'), 'active'); }
  }

  function route() {
    var hash = window.location.hash || '#/home';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var page = parts[0] || 'home';

    closePlayer();
    if (page !== 'shorts') { stopShorts(); }

    if (page === 'shorts') {
      showView('shorts');
      renderShort();
    } else if (page === 'search') {
      showView('search');
      renderSearch(safeDecode(parts.slice(1).join('/')));
    } else {
      showView('home');
      if (!homeRendered) { renderFeed($('homeFeed'), VIDEOS); homeRendered = true; }
    }
    window.scrollTo(0, 0);
  }

  /* ---------- Init ---------- */
  function init() {
    playerEl = $('player');
    holderEl = $('playerHolder');

    bindFeed($('homeFeed'));
    bindFeed($('searchFeed'));
    bindShorts();

    on($('searchForm'), 'submit', function (e) { preventDefault(e); submitSearch(); });
    on($('searchBtn'), 'click', function (e) { preventDefault(e); submitSearch(); });
    on($('playerClose'), 'click', closePlayer);
    on(playerEl, 'click', function (e) {
      e = e || window.event;
      if ((e.target || e.srcElement) === playerEl) { closePlayer(); }
    });

    if ('onhashchange' in window) {
      on(window, 'hashchange', route);
    } else {
      /* very old browsers: poll the hash */
      var last = window.location.hash;
      setInterval(function () {
        if (window.location.hash !== last) { last = window.location.hash; route(); }
      }, 300);
    }

    route();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') { init(); }
  else { on(document, 'DOMContentLoaded', init); on(window, 'load', function () { if (!playerEl) { init(); } }); }
})();
