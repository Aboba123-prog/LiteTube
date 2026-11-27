/* LiteTube - ES5, XMLHttpRequest, no dependencies */
(function () {
  'use strict';

  /* ================= Settings ================= */
  var TZ_OFFSET_MIN = 240;        /* GMT+4 */
  var TZ_LABEL = 'GMT+4';
  var REGION = 'US';              /* trending region code */
  var SHORTS_QUERY = '#shorts';
  var PAGE_SIZE = 12;             /* cards drawn per "Show more" */
  var TIMEOUT_MS = 9000;          /* per-server timeout */
  var BAD_COOLDOWN_MS = 120000;   /* skip a failed server for 2 minutes */

  /* Public mirrors, tried in order. Edit freely: {type: 'piped'|'invidious', url: 'https://host'}
     Piped entries use the API host (pipedapi...), not the website host.
     Public instances come and go, so keep this list fresh. */
  var SERVERS = [
    { type: 'piped',     url: 'https://pipedapi.kavin.rocks' },
    { type: 'piped',     url: 'https://pipedapi.leptons.xyz' },
    { type: 'piped',     url: 'https://pipedapi.nosebs.ru' },
    { type: 'invidious', url: 'https://inv.thepixora.com' },
    { type: 'piped',     url: 'https://pipedapi-libre.kavin.rocks' },
    { type: 'piped',     url: 'https://piped-api.privacy.com.de' },
    { type: 'piped',     url: 'https://pipedapi.adminforge.de' },
    { type: 'invidious', url: 'https://yewtu.be' },
    { type: 'invidious', url: 'https://inv.nadeko.net' },
    { type: 'invidious', url: 'https://invidious.nerdvpn.de' },
    { type: 'piped',     url: 'https://api.piped.yt' },
    { type: 'piped',     url: 'https://pipedapi.drgns.space' },
    { type: 'piped',     url: 'https://pipedapi.owo.si' },
    { type: 'piped',     url: 'https://pipedapi.ducks.party' },
    { type: 'piped',     url: 'https://piped-api.codespace.cz' },
    { type: 'piped',     url: 'https://pipedapi.reallyaweso.me' },
    { type: 'piped',     url: 'https://api.piped.private.coffee' }
  ];

  /* ================= Small helpers ================= */
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

  function hasClass(el, c) { return typeof el.className === 'string' && (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1; }
  function addClass(el, c) { if (!hasClass(el, c)) { el.className = (el.className + ' ' + c).replace(/^\s+|\s+$/g, ''); } }
  function removeClass(el, c) {
    el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  function preventDefault(e) {
    e = e || window.event;
    if (e.preventDefault) { e.preventDefault(); } else { e.returnValue = false; }
  }

  function safeDecode(s) { try { return decodeURIComponent(s); } catch (err) { return s; } }
  function nowMs() { return new Date().getTime(); }
  function isId(s) { return /^[A-Za-z0-9_-]{6,15}$/.test(s || ''); }
  function hostOf(s) { return s.url.replace(/^https?:\/\//, ''); }

  /* ================= GMT+4 date handling ================= */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* Shift the timestamp, then read it with the UTC getters.
     This never uses the device timezone. */
  function shifted(ms) { return new Date(ms + TZ_OFFSET_MIN * 60000); }

  function fmtDate(ms) {
    var d = shifted(ms);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function fmtDateTime(ms) {
    var d = shifted(ms);
    return fmtDate(ms) + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' ' + TZ_LABEL;
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's') + ' ago'; }

  function ago(ms) {
    var s = Math.floor((nowMs() - ms) / 1000), m, h, d;
    if (s < 60) { return 'just now'; }
    m = Math.floor(s / 60);
    if (m < 60) { return plural(m, 'minute'); }
    h = Math.floor(m / 60);
    if (h < 24) { return plural(h, 'hour'); }
    d = Math.floor(h / 24);
    if (d < 30) { return plural(d, 'day'); }
    if (d < 365) { return plural(Math.floor(d / 30), 'month'); }
    return plural(Math.floor(d / 365), 'year');
  }

  /* Text for a card: upload date (GMT+4), or scheduled start / live */
  function whenText(v, full) {
    if (v.live) { return 'Live now'; }
    if (v.ts && v.ts > nowMs() + 60000) { return 'Scheduled: ' + fmtDateTime(v.ts); }
    if (v.upcoming) { return 'Scheduled'; }
    if (v.ts) { return full ? fmtDate(v.ts) + ' (' + ago(v.ts) + ')' : fmtDate(v.ts); }
    return v.dateText || '';
  }

  function round1(x) { return x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10); }

  function fmtViews(n) {
    if (n === null || n === undefined || n < 0) { return ''; }
    if (n >= 1e9) { return round1(n / 1e9) + 'B views'; }
    if (n >= 1e6) { return round1(n / 1e6) + 'M views'; }
    if (n >= 1e3) { return round1(n / 1e3) + 'K views'; }
    return n + ' views';
  }

  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  /* ================= Networking with server fallback ================= */
  var goodIndex = 0;
  var badUntil = [];
  var i0;
  for (i0 = 0; i0 < SERVERS.length; i0++) { SERVERS[i0].idx = i0; badUntil.push(0); }

  try {
    var saved = parseInt(window.localStorage.getItem('lt_good'), 10);
    if (saved >= 0 && saved < SERVERS.length) { goodIndex = saved; }
  } catch (e1) {}

  function saveGood() { try { window.localStorage.setItem('lt_good', String(goodIndex)); } catch (e2) {} }

  function setStatus(t) { $('status').innerHTML = esc(t); }

  function xhrGet(url, timeout, cb) {
    var x, done = false, timer;
    function finish(err, data) {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      cb(err, data);
    }
    try {
      x = new XMLHttpRequest();
      timer = setTimeout(function () {
        finish('timeout');
        try { x.abort(); } catch (e3) {}
      }, timeout);
      x.open('GET', url, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) { return; }
        if (x.status >= 200 && x.status < 300) {
          try { finish(null, JSON.parse(x.responseText)); }
          catch (e4) { finish('bad json'); }
        } else {
          finish('http ' + x.status);
        }
      };
      x.send(null);
    } catch (e5) {
      finish('error');
    }
  }

  /* task = { url: function(server) -> string, parse: function(data, server) -> result|null,
              skip: {idx:true}, soft: bool }
     Tries servers in order until parse() returns a result. */
  function request(task, cb) {
    var order = [], later = [], i, idx, now = nowMs(), pos = 0;
    for (i = 0; i < SERVERS.length; i++) {
      idx = (goodIndex + i) % SERVERS.length;
      if (task.skip && task.skip[idx]) { continue; }
      if (badUntil[idx] > now) { later.push(idx); } else { order.push(idx); }
    }
    order = order.concat(later);

    function next() {
      var s, url;
      if (pos >= order.length) {
        setStatus('No server answered. Times are shown in ' + TZ_LABEL + '.');
        cb('failed');
        return;
      }
      idx = order[pos++];
      s = SERVERS[idx];
      url = task.url(s);
      setStatus('Connecting to ' + hostOf(s) + ' (' + pos + '/' + order.length + ')...');
      xhrGet(url, TIMEOUT_MS, function (err, data) {
        var res = null;
        if (!err) { try { res = task.parse(data, s); } catch (e6) { res = null; } }
        if (res) {
          goodIndex = s.idx;
          badUntil[s.idx] = 0;
          saveGood();
          setStatus('Server: ' + hostOf(s) + ' (' + s.type + ') - times are shown in ' + TZ_LABEL);
          cb(null, res, s);
        } else {
          if (!task.soft || err) { badUntil[s.idx] = nowMs() + BAD_COOLDOWN_MS; }
          next();
        }
      });
    }
    next();
  }

  /* ================= Normalising both APIs into one shape ================= */
  var REG = {};  /* id -> video, for click lookups */

  function videoIdFromUrl(u) {
    var m = /[?&]v=([A-Za-z0-9_-]{6,15})/.exec(u || '');
    return m ? m[1] : null;
  }

  function normPiped(it) {
    var id, up, dur, now = nowMs();
    if (!it || (it.type && it.type !== 'stream')) { return null; }
    id = videoIdFromUrl(it.url);
    if (!id) { return null; }
    up = it.uploaded > 0 ? it.uploaded : null;
    dur = typeof it.duration === 'number' ? it.duration : 0;
    return {
      id: id,
      title: it.title || 'Untitled',
      author: it.uploaderName || '',
      views: (typeof it.views === 'number' && it.views >= 0) ? it.views : null,
      ts: up,
      dateText: it.uploadedDate || '',
      dur: dur > 0 ? dur : 0,
      live: dur === -1 && !(up && up > now),
      upcoming: !!(up && up > now + 60000),
      short: !!it.isShort,
      thumb: it.thumbnail || ''
    };
  }

  function normInv(it, s) {
    var ts, up;
    if (!it || (it.type && it.type !== 'video') || !isId(it.videoId)) { return null; }
    up = !!it.isUpcoming;
    ts = it.published > 0 ? it.published * 1000 : null;
    if (up && it.premiereTimestamp > 0) { ts = it.premiereTimestamp * 1000; }
    return {
      id: it.videoId,
      title: it.title || 'Untitled',
      author: it.author || '',
      views: typeof it.viewCount === 'number' ? it.viewCount : null,
      ts: ts,
      dateText: it.publishedText || '',
      dur: it.lengthSeconds > 0 ? it.lengthSeconds : 0,
      live: !!it.liveNow,
      upcoming: up,
      short: false,
      thumb: s.url + '/vi/' + it.videoId + '/mqdefault.jpg'
    };
  }

  function normList(arr, s) {
    var out = [], i, v;
    if (!arr || typeof arr.length !== 'number') { return out; }
    for (i = 0; i < arr.length; i++) {
      v = s.type === 'piped' ? normPiped(arr[i]) : normInv(arr[i], s);
      if (v) { REG[v.id] = v; out.push(v); }
    }
    return out;
  }

  /* ================= API tasks ================= */
  function trendingTask() {
    return {
      url: function (s) {
        return s.type === 'piped'
          ? s.url + '/trending?region=' + REGION
          : s.url + '/api/v1/trending?region=' + REGION;
      },
      parse: function (data, s) {
        var list = normList(data, s);
        return list.length ? list : null;
      }
    };
  }

  function searchTask(q) {
    var eq = encodeURIComponent(q);
    return {
      url: function (s) {
        return s.type === 'piped'
          ? s.url + '/search?q=' + eq + '&filter=videos'
          : s.url + '/api/v1/search?q=' + eq + '&type=video';
      },
      parse: function (data, s) {
        var list = normList(s.type === 'piped' ? (data && data.items) : data, s);
        return (data && (s.type === 'piped' ? data.items : data.length !== undefined)) ? list : null;
      }
    };
  }

  function shortsTask() {
    var eq = encodeURIComponent(SHORTS_QUERY);
    return {
      url: function (s) {
        return s.type === 'piped'
          ? s.url + '/search?q=' + eq + '&filter=videos'
          : s.url + '/api/v1/search?q=' + eq + '&type=video';
      },
      parse: function (data, s) {
        var list = normList(s.type === 'piped' ? (data && data.items) : data, s), out = [], i, v;
        for (i = 0; i < list.length; i++) {
          v = list[i];
          if (v.live || v.upcoming) { continue; }
          if (v.short || (v.dur > 0 && v.dur <= 61)) { v.short = true; out.push(v); }
        }
        return out.length ? out : null;
      }
    };
  }

  function canHls() {
    try { return !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'); }
    catch (e7) { return false; }
  }

  function absUrl(u, s) { return u && u.charAt(0) === '/' ? s.url + u : u; }

  function pickPiped(data, maxH, s) {
    var list = (data && data.videoStreams) || [], best = null, bh = -1, low = null, lh = 99999, i, st, h;
    for (i = 0; i < list.length; i++) {
      st = list[i];
      if (st.videoOnly || !st.url) { continue; }
      if (!/mp4|mpeg_4/i.test((st.mimeType || '') + ' ' + (st.format || ''))) { continue; }
      h = parseInt(st.quality, 10) || 0;
      if (h <= maxH && h >= bh) { best = st; bh = h; }
      if (h < lh) { low = st; lh = h; }
    }
    if (!best) { best = low; }
    if (best) { return { url: absUrl(best.url, s) }; }
    if (data && data.hls && canHls()) { return { url: data.hls }; }
    return null;
  }

  function pickInv(data, maxH, s) {
    var list = (data && data.formatStreams) || [], best = null, bh = -1, low = null, lh = 99999, i, st, h;
    for (i = 0; i < list.length; i++) {
      st = list[i];
      if (!st.url) { continue; }
      if (!/mp4/i.test((st.container || '') + ' ' + (st.type || ''))) { continue; }
      h = parseInt(st.qualityLabel || st.quality, 10) || 0;
      if (h <= maxH && h >= bh) { best = st; bh = h; }
      if (h < lh) { low = st; lh = h; }
    }
    if (!best) { best = low; }
    return best ? { url: absUrl(best.url, s) } : null;
  }

  function streamTask(id, maxH, skip) {
    return {
      skip: skip,
      soft: true,
      url: function (s) {
        return s.type === 'piped'
          ? s.url + '/streams/' + id
          : s.url + '/api/v1/videos/' + id + '?local=true';
      },
      parse: function (data, s) {
        return s.type === 'piped' ? pickPiped(data, maxH, s) : pickInv(data, maxH, s);
      }
    };
  }

  /* Gets a playable URL; if the <video> then errors, onReady's retry() moves to the next server. */
  function streamInto(id, maxH, isStale, onReady, onFail) {
    var skip = {};
    function attempt() {
      request(streamTask(id, maxH, skip), function (err, st, s) {
        if (isStale()) { return; }
        if (err) { onFail(); return; }
        onReady(st, s, function () { skip[s.idx] = true; attempt(); });
      });
    }
    attempt();
  }

  /* ================= Cards and lists ================= */
  function cardHtml(v) {
    var badge = '';
    if (v.live) { badge = '<span class="badge live">LIVE</span>'; }
    else if (v.upcoming || (v.ts && v.ts > nowMs() + 60000)) { badge = '<span class="badge sched">SOON</span>'; }
    else if (v.dur) { badge = '<span class="badge">' + fmtDur(v.dur) + '</span>'; }
    return '<div class="card" data-id="' + esc(v.id) + '">' +
      '<span class="thumb">' +
      (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
      badge + '</span>' +
      '<span class="card-title">' + esc(v.title) + '</span>' +
      '<p class="meta">' + esc(v.author) + '<br>' +
      esc(fmtViews(v.views)) + (v.views !== null ? ' &middot; ' : '') + esc(whenText(v, false)) + '</p>' +
      '</div>';
  }

  function bindFeed(container) {
    on(container, 'click', function (e) {
      e = e || window.event;
      var t = e.target || e.srcElement, v;
      while (t && t !== container) {
        if (hasClass(t, 'card')) {
          v = REG[t.getAttribute('data-id')];
          if (v) { openPlayer(v); }
          return;
        }
        t = t.parentNode;
      }
    });
  }

  function makeList(feedId, msgId, moreId) {
    var feed = $(feedId), msg = $(msgId), more = $(moreId), items = [], shown = 0;
    var api = {
      onRetry: null,
      clear: function () { items = []; shown = 0; feed.innerHTML = ''; more.style.display = 'none'; },
      setMsg: function (html) { msg.innerHTML = html; msg.style.display = html ? 'block' : 'none'; },
      set: function (list) { api.clear(); items = list; api.showMore(); },
      showMore: function () {
        var end = Math.min(items.length, shown + PAGE_SIZE), html = '', i;
        for (i = shown; i < end; i++) { html += cardHtml(items[i]); }
        shown = end;
        if (feed.insertAdjacentHTML) { feed.insertAdjacentHTML('beforeend', html); }
        else { feed.innerHTML += html; }
        more.style.display = shown < items.length ? 'inline-block' : 'none';
      }
    };
    on(more, 'click', function () { api.showMore(); });
    on(msg, 'click', function (e) {
      e = e || window.event;
      var t = e.target || e.srcElement;
      if (t && hasClass(t, 'retry') && api.onRetry) { api.onRetry(); }
    });
    bindFeed(feed);
    return api;
  }

  var FAIL_HTML = 'Could not reach any server right now. Public mirrors are often busy or blocked.<br>' +
    '<button type="button" class="retry">Try again</button>';

  /* ---------- Home ---------- */
  var homeList, homeLoaded = false, homeBusy = false;

  function loadHome() {
    if (homeBusy) { return; }
    homeBusy = true;
    homeList.clear();
    homeList.setMsg('Loading trending videos...');
    request(trendingTask(), function (err, list) {
      homeBusy = false;
      if (err) { homeList.setMsg(FAIL_HTML); return; }
      homeLoaded = true;
      homeList.setMsg('');
      homeList.set(list);
    });
  }

  /* ---------- Search ---------- */
  var searchList, searchToken = 0, lastQuery = null;

  function loadSearch(q) {
    var token = ++searchToken;
    $('searchInput').value = q;
    if (!q) {
      lastQuery = null;
      searchList.clear();
      $('searchHeading').innerHTML = 'Search';
      searchList.setMsg('Type something in the box above and press Search.');
      return;
    }
    if (q === lastQuery) { return; }
    $('searchHeading').innerHTML = 'Results for "' + esc(q) + '"';
    searchList.clear();
    searchList.setMsg('Searching...');
    request(searchTask(q), function (err, list) {
      if (token !== searchToken) { return; }
      if (err) { lastQuery = null; searchList.setMsg(FAIL_HTML); return; }
      lastQuery = q;
      if (!list.length) { searchList.setMsg('No videos found. Try another search.'); return; }
      searchList.setMsg('');
      $('searchHeading').innerHTML = 'Results for "' + esc(q) + '" (' + list.length + ')';
      searchList.set(list);
    });
  }

  function submitSearch() {
    var q = $('searchInput').value.replace(/^\s+|\s+$/g, '');
    window.location.hash = '#/search/' + encodeURIComponent(q);
  }

  /* ---------- Player overlay ---------- */
  var playerEl, holderEl, playerMsg, playerToken = 0;

  function ytLink(id) {
    return '<a href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank">Open on YouTube</a>';
  }

  function openPlayer(v) {
    var token = ++playerToken;
    function stale() { return token !== playerToken; }

    addClass(playerEl, 'open');
    holderEl.innerHTML = '';
    $('playerTitle').innerHTML = esc(v.title);
    $('playerMeta').innerHTML = esc(v.author) +
      (v.views !== null ? ' &middot; ' + esc(fmtViews(v.views)) : '') +
      ' &middot; ' + esc(whenText(v, true));
    playerMsg.style.display = 'block';
    playerMsg.innerHTML = 'Loading video...';

    streamInto(v.id, 480, stale, function (st, s, retry) {
      var vid, failed = false;
      playerMsg.style.display = 'none';
      holderEl.innerHTML = '<video controls autoplay playsinline webkit-playsinline src="' + esc(st.url) + '"></video>';
      vid = holderEl.getElementsByTagName('video')[0];
      on(vid, 'error', function () {
        if (failed || stale()) { return; }
        failed = true;
        holderEl.innerHTML = '';
        playerMsg.style.display = 'block';
        playerMsg.innerHTML = 'Playback failed on ' + esc(hostOf(s)) + '. Trying another server...';
        retry();
      });
    }, function () {
      playerMsg.style.display = 'block';
      playerMsg.innerHTML = 'No server could provide a playable stream for this video. ' + ytLink(v.id);
    });
  }

  function closePlayer() {
    var vid = holderEl.getElementsByTagName('video')[0];
    playerToken++;
    if (vid) { try { vid.pause(); } catch (e8) {} }
    holderEl.innerHTML = '';   /* frees the media resource */
    removeClass(playerEl, 'open');
  }

  /* ---------- Shorts (one <video> at a time) ---------- */
  var shorts = [], shortIndex = 0, shortToken = 0, shortsBusy = false;
  var shortsLoaded = false, shortPlaying = false, shortSound = false;

  function currentShortVideo() { return $('shortFrame').getElementsByTagName('video')[0] || null; }

  function setShortLabel(t) {
    var el = $('shortLabel');
    if (el) { el.innerHTML = t; el.style.display = t ? 'block' : 'none'; }
  }

  function loadShorts() {
    if (shortsBusy) { return; }
    shortsBusy = true;
    setShortMsg('Loading Shorts...');
    request(shortsTask(), function (err, list) {
      shortsBusy = false;
      if (err) { setShortMsg(FAIL_HTML); return; }
      shorts = list;
      shortIndex = 0;
      shortsLoaded = true;
      setShortMsg('');
      renderShort();
    });
  }

  function setShortMsg(html) {
    var m = $('shortMsg');
    m.innerHTML = html;
    m.style.display = html ? 'block' : 'none';
  }

  function renderShort() {
    var s = shorts[shortIndex], token, frame = $('shortFrame');
    if (!s) { return; }
    token = ++shortToken;
    shortPlaying = false;

    frame.innerHTML =
      (s.thumb ? '<img class="short-bg" alt="" src="' + esc(s.thumb) + '" onerror="this.style.display=\'none\'">' : '') +
      '<div class="short-info"><strong>' + esc(s.title) + '</strong><span>' + esc(s.author) + '</span>' +
      '<span>' + esc(whenText(s, false)) + '</span></div>' +
      '<div class="short-pause" id="shortLabel">Loading...</div>';
    $('shortCount').innerHTML = (shortIndex + 1) + ' / ' + shorts.length;

    streamInto(s.id, 360, function () { return token !== shortToken; }, function (st, srv, retry) {
      var holder = document.createElement('div'), vid, failed = false, info;
      holder.innerHTML = '<video loop muted playsinline webkit-playsinline preload="auto" src="' + esc(st.url) + '"></video>';
      vid = holder.firstChild;
      vid.muted = !shortSound;
      on(vid, 'error', function () {
        if (failed || token !== shortToken) { return; }
        failed = true;
        if (vid.parentNode) { vid.parentNode.removeChild(vid); }
        setShortLabel('Trying another server...');
        retry();
      });
      info = frame.getElementsByTagName('div')[0];
      frame.insertBefore(vid, info);
      playShort();
    }, function () {
      setShortLabel('Could not load this Short. Tap Next.');
    });
  }

  function playShort() {
    var v = currentShortVideo(), p;
    if (!v) { return; }
    try {
      p = v.play();
      if (p && p.then) {
        p.then(function () { setShortState(true); }, function () { setShortState(false); });
      } else { setShortState(true); }
    } catch (e9) { setShortState(false); }
  }

  function pauseShort() {
    var v = currentShortVideo();
    if (v) { try { v.pause(); } catch (e10) {} }
    setShortState(false);
  }

  function setShortState(playing) {
    shortPlaying = playing;
    setShortLabel(playing ? '' : '&#9654; Tap to play');
  }

  function toggleShort() { if (!currentShortVideo()) { return; } if (shortPlaying) { pauseShort(); } else { playShort(); } }

  function goShort(step) {
    if (!shorts.length) { return; }
    shortIndex = (shortIndex + step + shorts.length) % shorts.length;
    renderShort();
  }

  function stopShorts() {
    shortToken++;
    pauseShort();
    $('shortFrame').innerHTML = '';
  }

  function bindShorts() {
    var frame = $('shortFrame'), startY = null;

    on($('shortPrev'), 'click', function () { goShort(-1); });
    on($('shortNext'), 'click', function () { goShort(1); });
    on($('shortSound'), 'click', function () {
      var v = currentShortVideo();
      shortSound = !shortSound;
      $('shortSound').innerHTML = 'Sound: ' + (shortSound ? 'on' : 'off');
      if (v) { v.muted = !shortSound; }
    });
    on($('shortMsg'), 'click', function (e) {
      e = e || window.event;
      var t = e.target || e.srcElement;
      if (t && hasClass(t, 'retry')) { loadShorts(); }
    });

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

  /* ================= Router (hash based) ================= */
  var views = ['home', 'search', 'shorts'];

  function showView(name) {
    var i;
    for (i = 0; i < views.length; i++) { removeClass($('view-' + views[i]), 'active'); }
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
      if (shortsLoaded) { renderShort(); } else { loadShorts(); }
    } else if (page === 'search') {
      showView('search');
      loadSearch(safeDecode(parts.slice(1).join('/')));
    } else {
      showView('home');
      if (!homeLoaded) { loadHome(); }
    }
    window.scrollTo(0, 0);
  }

  /* ================= Init ================= */
  function init() {
    if (playerEl) { return; }
    playerEl = $('player');
    holderEl = $('playerHolder');
    playerMsg = $('playerMsg');

    homeList = makeList('homeFeed', 'homeMsg', 'homeMore');
    homeList.onRetry = loadHome;
    searchList = makeList('searchFeed', 'searchMsg', 'searchMore');
    searchList.onRetry = function () { lastQuery = null; loadSearch($('searchInput').value.replace(/^\s+|\s+$/g, '')); };
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
      var last = window.location.hash;
      setInterval(function () {
        if (window.location.hash !== last) { last = window.location.hash; route(); }
      }, 300);
    }

    route();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') { init(); }
  else { on(document, 'DOMContentLoaded', init); on(window, 'load', init); }
})();
