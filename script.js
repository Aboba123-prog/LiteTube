var SERVERS = [
    { type: "invidious", url: "https://inv.tux.pizza" },
    { type: "invidious", url: "https://yewtu.be" },
    { type: "invidious", url: "https://inv.riverside.rocks" },
    { type: "invidious", url: "https://invidious.nerdvpn.de" },
    { type: "invidious", url: "https://invidious.drgns.space" },
    { type: "invidious", url: "https://invidious.no-name-given.de" },

    { type: "piped", url: "https://pipedapi.adminforge.de" },
    { type: "piped", url: "https://pipedapi.yt" },
    { type: "piped", url: "https://pipedapi.drgns.space" },
    { type: "piped", url: "https://pipedapi.mha.fi" },
    { type: "piped", url: "https://api.piped.privacydev.net" },
    { type: "piped", url: "https://pipedapi.kavin.rocks" }
];

var activeServerIndex = 0;
var currentStreams = [];
var serverCooldown = {};
var requestTimeout = 8000;
var serverCooldownTime = 60000;

var searchInput = document.getElementById("searchInput");
var searchBtn = document.getElementById("searchBtn");
var homeTab = document.getElementById("homeTab");
var shortsTab = document.getElementById("shortsTab");
var gridContainer = document.getElementById("gridContainer");
var shortsContainer = document.getElementById("shortsContainer");
var playerContainer = document.getElementById("playerContainer");
var mainVideo = document.getElementById("mainVideo");
var videoTitle = document.getElementById("videoTitle");
var qualitySelect = document.getElementById("qualitySelect");
var captionTrack = document.getElementById("captionTrack");

var hasObserver = "IntersectionObserver" in window;
var shortsObserver = null;

function getServerKey(server) {
    return server.type + "|" + server.url;
}

function isServerAvailable(index) {
    var server = SERVERS[index];

    if (!server) {
        return false;
    }

    var key = getServerKey(server);

    return !serverCooldown[key] || Date.now() >= serverCooldown[key];
}

function markServerFailed(index) {
    var server = SERVERS[index];

    if (!server) {
        return;
    }

    var key = getServerKey(server);

    serverCooldown[key] = Date.now() + serverCooldownTime;
}

function markServerSuccess(index) {
    var server = SERVERS[index];

    if (!server) {
        return;
    }

    var key = getServerKey(server);

    delete serverCooldown[key];
    activeServerIndex = index;
}

function getServerOrder() {
    var available = [];
    var unavailable = [];
    var total = SERVERS.length;

    if (total === 0) {
        return [];
    }

    if (isServerAvailable(activeServerIndex)) {
        available.push(activeServerIndex);
    } else {
        unavailable.push(activeServerIndex);
    }

    for (var offset = 1; offset < total; offset++) {
        var index = (activeServerIndex + offset) % total;

        if (index === activeServerIndex) {
            continue;
        }

        if (isServerAvailable(index)) {
            if (available.indexOf(index) === -1) {
                available.push(index);
            }
        } else {
            if (unavailable.indexOf(index) === -1) {
                unavailable.push(index);
            }
        }
    }

    if (available.length > 0) {
        return available;
    }

    return unavailable;
}

function buildEndpoint(server, actionType, params) {
    if (!server) {
        return null;
    }

    if (server.type === "invidious") {
        if (actionType === "trending") {
            return "/api/v1/trending?region=RU";
        }

        if (actionType === "search") {
            return "/api/v1/search?q=" + encodeURIComponent(params.q);
        }

        if (actionType === "streams") {
            return "/api/v1/videos/" + encodeURIComponent(params.id);
        }
    }

    if (server.type === "piped") {
        if (actionType === "trending") {
            return "/trending?region=RU";
        }

        if (actionType === "search") {
            return "/search?q=" + encodeURIComponent(params.q) + "&filter=all";
        }

        if (actionType === "streams") {
            return "/streams/" + encodeURIComponent(params.id);
        }
    }

    return null;
}

function isValidResponse(actionType, data) {
    if (!data) {
        return false;
    }

    if (actionType === "trending" || actionType === "search") {
        if (Array.isArray(data)) {
            return true;
        }

        if (data && Array.isArray(data.items)) {
            return true;
        }

        return false;
    }

    if (actionType === "streams") {
        return typeof data === "object";
    }

    return false;
}

function requestServer(index, actionType, params, callback) {
    var server = SERVERS[index];

    if (!server) {
        callback(false, null);
        return;
    }

    var endpoint = buildEndpoint(server, actionType, params);

    if (!endpoint) {
        markServerFailed(index);
        callback(false, null);
        return;
    }

    var xhr = new XMLHttpRequest();
    var completed = false;

    var timeout = setTimeout(function () {
        if (completed) {
            return;
        }

        completed = true;

        try {
            xhr.abort();
        } catch (e) {
        }

        markServerFailed(index);
        callback(false, null);
    }, requestTimeout);

    function finish(success, data) {
        if (completed) {
            return;
        }

        completed = true;
        clearTimeout(timeout);

        if (success) {
            markServerSuccess(index);
            callback(true, data);
        } else {
            markServerFailed(index);
            callback(false, null);
        }
    }

    try {
        xhr.open("GET", server.url + endpoint, true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                var json;

                try {
                    json = JSON.parse(xhr.responseText);
                } catch (e) {
                    finish(false, null);
                    return;
                }

                if (!isValidResponse(actionType, json)) {
                    finish(false, null);
                    return;
                }

                var normalized = normalizeResponse(
                    actionType,
                    server.type,
                    json
                );

                if (!normalized) {
                    finish(false, null);
                    return;
                }

                finish(true, normalized);
            } else {
                finish(false, null);
            }
        };

        xhr.onerror = function () {
            finish(false, null);
        };

        xhr.onabort = function () {
            finish(false, null);
        };

        xhr.send();
    } catch (e) {
        finish(false, null);
    }
}

function requestCascade(actionType, params, order, position, callback) {
    if (!order || position >= order.length) {
        callback(
            "Все доступные серверы временно недоступны. Попробуйте еще раз через несколько секунд.",
            null
        );
        return;
    }

    var index = order[position];

    requestServer(index, actionType, params, function (success, data) {
        if (success && data) {
            callback(null, data);
            return;
        }

        requestCascade(
            actionType,
            params,
            order,
            position + 1,
            callback
        );
    });
}

function executeApiRequest(actionType, params, callback) {
    var order = getServerOrder();

    if (!order || order.length === 0) {
        callback(
            "Список серверов пуст.",
            null
        );
        return;
    }

    requestCascade(
        actionType,
        params,
        order,
        0,
        function (err, result) {
            if (!err && result) {
                callback(null, result);
                return;
            }

            callback(
                err || "Не удалось получить ответ от серверов.",
                null
            );
        }
    );
}

function normalizeResponse(actionType, serverType, data) {
    if (!data) {
        return null;
    }

    if (actionType === "trending" || actionType === "search") {
        var rawList = Array.isArray(data)
            ? data
            : (Array.isArray(data.items) ? data.items : []);

        var items = [];

        for (var i = 0; i < rawList.length; i++) {
            var item = rawList[i];

            if (!item) {
                continue;
            }

            var id = item.videoId;

            if (!id && item.url) {
                id = item.url
                    .replace("/watch?v=", "")
                    .replace("/shorts/", "")
                    .replace("/watch/", "")
                    .split("&")[0]
                    .split("?")[0];
            }

            if (!id && item.id && typeof item.id === "string") {
                id = item.id;
            }

            if (!id) {
                continue;
            }

            var title = item.title || "Без названия";
            var thumb = "";

            if (
                item.videoThumbnails &&
                item.videoThumbnails.length > 0
            ) {
                thumb = item.videoThumbnails[0].url || "";
            }

            if (!thumb && item.thumbnail) {
                thumb = item.thumbnail;
            }

            if (
                !thumb &&
                item.thumbnails &&
                item.thumbnails.length > 0
            ) {
                thumb = item.thumbnails[0].url || "";
            }

            if (!thumb) {
                thumb =
                    "https://i.ytimg.com/vi/" +
                    encodeURIComponent(id) +
                    "/hqdefault.jpg";
            }

            items.push({
                id: id,
                title: title,
                thumbnail: thumb
            });
        }

        if (items.length === 0) {
            return null;
        }

        return items;
    }

    if (actionType === "streams") {
        var title = data.title || "Видео";
        var streams = [];
        var subtitles = [];

        if (serverType === "invidious") {
            var formatStreams = data.formatStreams || [];

            for (var j = 0; j < formatStreams.length; j++) {
                var fs = formatStreams[j];

                if (fs && fs.url) {
                    streams.push({
                        url: fs.url,
                        quality: fs.qualityLabel ||
                            fs.resolution ||
                            "SD",
                        format: fs.container || "MP4"
                    });
                }
            }

            var adaptiveFormats = data.adaptiveFormats || [];

            for (var a = 0; a < adaptiveFormats.length; a++) {
                var af = adaptiveFormats[a];

                if (
                    af &&
                    af.url &&
                    af.type &&
                    af.type.indexOf("video/") === 0 &&
                    af.audioQuality
                ) {
                    streams.push({
                        url: af.url,
                        quality: af.qualityLabel ||
                            af.resolution ||
                            "HD",
                        format: af.container || "MP4"
                    });
                }
            }

            var captions = data.captions || [];

            for (var c = 0; c < captions.length; c++) {
                if (captions[c] && captions[c].url) {
                    subtitles.push({
                        url: captions[c].url,
                        code: captions[c].languageCode || ""
                    });
                }
            }
        }

        if (serverType === "piped") {
            var vStreams = data.videoStreams || [];

            for (var k = 0; k < vStreams.length; k++) {
                var vs = vStreams[k];

                if (
                    vs &&
                    vs.url &&
                    vs.videoOnly === false
                ) {
                    streams.push({
                        url: vs.url,
                        quality: vs.quality || "SD",
                        format: vs.format || "MP4"
                    });
                }
            }

            var subs = data.subtitles || [];

            for (var s = 0; s < subs.length; s++) {
                if (subs[s] && subs[s].url) {
                    subtitles.push({
                        url: subs[s].url,
                        code: subs[s].code ||
                            subs[s].languageCode ||
                            ""
                    });
                }
            }
        }

        var uniqueStreams = [];
        var streamUrls = {};

        for (var u = 0; u < streams.length; u++) {
            if (!streams[u] || !streams[u].url) {
                continue;
            }

            if (!streamUrls[streams[u].url]) {
                streamUrls[streams[u].url] = true;
                uniqueStreams.push(streams[u]);
            }
        }

        if (uniqueStreams.length === 0) {
            return null;
        }

        return {
            title: title,
            streams: uniqueStreams,
            subtitles: subtitles
        };
    }

    return null;
}

function renderGrid(items, container) {
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!items || items.length === 0) {
        container.innerHTML =
            "<div style='padding:20px;'>Ничего не найдено.</div>";
        return;
    }

    for (var i = 0; i < items.length; i++) {
        var item = items[i];

        var card = document.createElement("div");
        card.className = "card";
        card.setAttribute("data-id", item.id);

        var thumb = document.createElement("div");
        thumb.className = "card-thumb";

        if (item.thumbnail) {
            thumb.style.backgroundImage =
                "url('" +
                item.thumbnail.replace(/'/g, "\\'") +
                "')";
        }

        var title = document.createElement("div");
        title.className = "card-title";
        title.textContent = item.title;

        card.appendChild(thumb);
        card.appendChild(title);

        card.onclick = function () {
            var id = this.getAttribute("data-id");

            if (id) {
                playVideo(id);
            }
        };

        container.appendChild(card);
    }
}

function stopMainVideo() {
    if (!mainVideo) {
        return;
    }

    try {
        mainVideo.pause();
    } catch (e) {
    }

    mainVideo.removeAttribute("src");
    mainVideo.load();
}

function stopShortsVideos() {
    if (!shortsContainer) {
        return;
    }

    var videos = shortsContainer.querySelectorAll("video");

    for (var i = 0; i < videos.length; i++) {
        try {
            videos[i].pause();
        } catch (e) {
        }
    }
}

function loadTrending() {
    gridContainer.classList.remove("hidden");
    shortsContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");

    shortsContainer.className = "hidden";

    stopShortsVideos();
    stopMainVideo();

    gridContainer.innerHTML =
        "<div style='padding:20px; color:#aaa;'>" +
        "Поиск рабочего сервера и загрузка..." +
        "</div>";

    executeApiRequest(
        "trending",
        {},
        function (err, data) {
            if (err || !data) {
                gridContainer.innerHTML =
                    "<div style='padding:20px; color:#ff5555;'>" +
                    (err || "Ошибка загрузки.") +
                    "</div>";
                return;
            }

            renderGrid(data, gridContainer);
        }
    );
}

function loadShorts() {
    shortsContainer.classList.remove("hidden");
    gridContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");

    stopMainVideo();

    shortsContainer.className = "shorts-feed-container";

    shortsContainer.innerHTML =
        "<div style='padding:20px; color:#aaa; text-align:center;'>" +
        "Загрузка Shorts..." +
        "</div>";

    executeApiRequest(
        "search",
        { q: "shorts" },
        function (err, items) {
            if (err || !items) {
                shortsContainer.innerHTML =
                    "<div style='padding:20px; color:#ff5555;'>" +
                    "Ошибка загрузки Shorts." +
                    "</div>";
                return;
            }

            shortsContainer.innerHTML = "";

            if (shortsObserver) {
                try {
                    shortsObserver.disconnect();
                } catch (e) {
                }
            }

            for (var i = 0; i < items.length; i++) {
                var item = items[i];

                var wrapper = document.createElement("div");
                wrapper.className = "short-video-wrapper";
                wrapper.setAttribute("data-id", item.id);

                var videoEl = document.createElement("video");
                videoEl.loop = true;
                videoEl.controls = true;
                videoEl.setAttribute("playsinline", "");
                videoEl.setAttribute("webkit-playsinline", "");

                if (item.thumbnail) {
                    videoEl.poster = item.thumbnail;
                }

                var titleEl = document.createElement("div");
                titleEl.className = "short-overlay-title";
                titleEl.textContent = item.title;

                wrapper.appendChild(videoEl);
                wrapper.appendChild(titleEl);

                shortsContainer.appendChild(wrapper);

                if (hasObserver && shortsObserver) {
                    shortsObserver.observe(wrapper);
                } else {
                    wrapper.onclick = function () {
                        var wrapperElement = this;
                        var v = wrapperElement.querySelector("video");
                        var id = wrapperElement.getAttribute("data-id");

                        if (!v || !id) {
                            return;
                        }

                        if (!v.src) {
                            loadStreamsForVideo(
                                id,
                                function (e, streams) {
                                    if (
                                        !e &&
                                        streams &&
                                        streams.length > 0
                                    ) {
                                        v.src = streams[0].url;

                                        var p = v.play();

                                        if (p && p.catch) {
                                            p.catch(function () {
                                            });
                                        }
                                    }
                                }
                            );
                        } else {
                            var p2 = v.play();

                            if (p2 && p2.catch) {
                                p2.catch(function () {
                                });
                            }
                        }
                    };
                }
            }
        }
    );
}

function loadStreamsForVideo(videoId, callback) {
    executeApiRequest(
        "streams",
        { id: videoId },
        function (err, data) {
            if (err || !data) {
                callback(err || "Ошибка загрузки потока.", null);
                return;
            }

            callback(null, data.streams, data);
        }
    );
}

function playVideo(videoId) {
    if (!videoId) {
        return;
    }

    playerContainer.classList.remove("hidden");

    window.scrollTo(0, 0);

    stopMainVideo();

    currentStreams = [];

    videoTitle.textContent = "Подключение к серверу...";

    qualitySelect.innerHTML =
        "<option>Загрузка...</option>";

    if (captionTrack) {
        captionTrack.removeAttribute("src");
        captionTrack.default = false;
    }

    executeApiRequest(
        "streams",
        { id: videoId },
        function (err, data) {
            if (err || !data) {
                videoTitle.textContent =
                    "Не удалось воспроизвести видео.";

                qualitySelect.innerHTML = "";
                return;
            }

            videoTitle.textContent = data.title || "Видео";

            currentStreams = data.streams || [];

            qualitySelect.innerHTML = "";

            for (var j = 0; j < currentStreams.length; j++) {
                var stream = currentStreams[j];

                var opt = document.createElement("option");

                opt.value = j;

                opt.textContent =
                    (stream.quality || "SD") +
                    " (" +
                    (stream.format || "MP4") +
                    ")";

                qualitySelect.appendChild(opt);
            }

            if (currentStreams.length > 0) {
                mainVideo.src = currentStreams[0].url;

                var playPromise = mainVideo.play();

                if (playPromise && playPromise.catch) {
                    playPromise.catch(function () {
                    });
                }
            }

            if (
                data.subtitles &&
                data.subtitles.length > 0 &&
                captionTrack
            ) {
                var subUrl = data.subtitles[0].url;

                for (
                    var k = 0;
                    k < data.subtitles.length;
                    k++
                ) {
                    if (
                        data.subtitles[k].code === "ru" ||
                        data.subtitles[k].code === "ru-RU"
                    ) {
                        subUrl = data.subtitles[k].url;
                        break;
                    }
                }

                captionTrack.src = subUrl;
                captionTrack.default = true;
            }
        }
    );
}

if (qualitySelect) {
    qualitySelect.onchange = function () {
        var idx = parseInt(this.value, 10);

        if (
            isNaN(idx) ||
            !currentStreams[idx] ||
            !mainVideo
        ) {
            return;
        }

        var currentTime = mainVideo.currentTime || 0;
        var isPaused = mainVideo.paused;

        mainVideo.src = currentStreams[idx].url;

        mainVideo.addEventListener(
            "loadedmetadata",
            function restoreTime() {
                try {
                    mainVideo.currentTime = currentTime;
                } catch (e) {
                }

                mainVideo.removeEventListener(
                    "loadedmetadata",
                    restoreTime
                );
            }
        );

        if (!isPaused) {
            var playPromise = mainVideo.play();

            if (playPromise && playPromise.catch) {
                playPromise.catch(function () {
                });
            }
        }
    };
}

if (searchBtn) {
    searchBtn.onclick = function () {
        var query = searchInput
            ? searchInput.value.trim()
            : "";

        if (!query) {
            return;
        }

        gridContainer.classList.remove("hidden");
        shortsContainer.classList.add("hidden");
        playerContainer.classList.add("hidden");

        shortsContainer.className = "hidden";

        stopShortsVideos();
        stopMainVideo();

        gridContainer.innerHTML =
            "<div style='padding:20px; color:#aaa;'>" +
            "Поиск..." +
            "</div>";

        executeApiRequest(
            "search",
            { q: query },
            function (err, items) {
                if (err || !items) {
                    gridContainer.innerHTML =
                        "<div style='padding:20px; color:#ff5555;'>" +
                        "Ошибка поиска." +
                        "</div>";
                    return;
                }

                renderGrid(items, gridContainer);
            }
        );
    };
}

if (searchInput && searchBtn) {
    searchInput.addEventListener(
        "keypress",
        function (event) {
            if (event.key === "Enter") {
                searchBtn.click();
            }
        }
    );
}

if (homeTab) {
    homeTab.onclick = function () {
        homeTab.className = "active";

        if (shortsTab) {
            shortsTab.className = "";
        }

        stopShortsVideos();

        loadTrending();
    };
}

if (shortsTab) {
    shortsTab.onclick = function () {
        shortsTab.className = "active";

        if (homeTab) {
            homeTab.className = "";
        }

        loadShorts();
    };
}

if (hasObserver) {
    shortsObserver = new IntersectionObserver(
        function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];

                var wrapper = entry.target;

                var videoElement =
                    wrapper.querySelector("video");

                var videoId =
                    wrapper.getAttribute("data-id");

                if (!videoElement || !videoId) {
                    continue;
                }

                if (entry.isIntersecting) {
                    if (!videoElement.src) {
                        loadStreamsForVideo(
                            videoId,
                            function (err, streams) {
                                if (
                                    !err &&
                                    streams &&
                                    streams.length > 0
                                ) {
                                    videoElement.src =
                                        streams[0].url;

                                    var playPromise =
                                        videoElement.play();

                                    if (
                                        playPromise &&
                                        playPromise.catch
                                    ) {
                                        playPromise.catch(
                                            function () {
                                            }
                                        );
                                    }
                                }
                            }
                        );
                    } else {
                        var playPromise2 =
                            videoElement.play();

                        if (
                            playPromise2 &&
                            playPromise2.catch
                        ) {
                            playPromise2.catch(
                                function () {
                                }
                            );
                        }
                    }
                } else {
                    if (!videoElement.paused) {
                        videoElement.pause();
                    }
                }
            }
        },
        {
            threshold: 0.5
        }
    );
}

loadTrending();
