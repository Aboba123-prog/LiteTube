var SERVERS = [
    { type: "invidious", url: "https://invidious.nerdvpn.de" },
    { type: "invidious", url: "https://inv.tux.pizza" },
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

var hasObserver = ('IntersectionObserver' in window);
var shortsObserver;

if (hasObserver) {
    shortsObserver = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var videoElement = entry.target.querySelector("video");
            var videoId = entry.target.getAttribute("data-id");

            if (entry.isIntersecting) {
                if (!videoElement.src) {
                    loadStreamsForVideo(videoId, function(err, streams) {
                        if (!err && streams && streams.length > 0) {
                            videoElement.src = streams[0].url;
                            var playPromise = videoElement.play();
                            if (playPromise !== undefined && playPromise.catch) {
                                playPromise.catch(function(e) {});
                            }
                        }
                    });
                } else {
                    var playPromise = videoElement.play();
                    if (playPromise !== undefined && playPromise.catch) {
                        playPromise.catch(function(e) {});
                    }
                }
            } else {
                if (videoElement && !videoElement.paused) {
                    videoElement.pause();
                }
            }
        }
    }, { threshold: 0.5 });
}

function requestCascade(actionType, params, attemptIndex, callback) {
    if (attemptIndex >= SERVERS.length) {
        callback("Все серверы недоступны. Попробуйте еще раз позже.", null);
        return;
    }

    var server = SERVERS[attemptIndex];
    var endpoint = "";

    if (server.type === "invidious") {
        if (actionType === "trending") endpoint = "/api/v1/trending?region=RU";
        else if (actionType === "search") endpoint = "/api/v1/search?q=" + encodeURIComponent(params.q);
        else if (actionType === "streams") endpoint = "/api/v1/videos/" + params.id;
    } else if (server.type === "piped") {
        if (actionType === "trending") endpoint = "/trending?region=RU";
        else if (actionType === "search") endpoint = "/search?q=" + encodeURIComponent(params.q) + "&filter=all";
        else if (actionType === "streams") endpoint = "/streams/" + params.id;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", server.url + endpoint, true);
    
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    var json = JSON.parse(xhr.responseText);
                    var normalizedData = normalizeResponse(actionType, server.type, json);
                    if (normalizedData) {
                        activeServerIndex = attemptIndex;
                        callback(null, normalizedData);
                    } else {
                        requestCascade(actionType, params, attemptIndex + 1, callback);
                    }
                } catch (e) {
                    requestCascade(actionType, params, attemptIndex + 1, callback);
                }
            } else {
                requestCascade(actionType, params, attemptIndex + 1, callback);
            }
        }
    };

    xhr.onerror = function () {
        requestCascade(actionType, params, attemptIndex + 1, callback);
    };

    xhr.send();
}

function executeApiRequest(actionType, params, callback) {
    requestCascade(actionType, params, activeServerIndex, function(err, result) {
        if (err) {
            requestCascade(actionType, params, 0, callback);
        } else {
            callback(null, result);
        }
    });
}

function normalizeResponse(actionType, serverType, data) {
    if (!data) return null;

    if (actionType === "trending" || actionType === "search") {
        var rawList = Array.isArray(data) ? data : (data.items || []);
        var items = [];

        for (var i = 0; i < rawList.length; i++) {
            var item = rawList[i];
            var id = item.videoId || (item.url ? item.url.replace("/watch?v=", "").replace("/shorts/", "") : item.id);
            if (!id) continue;

            var title = item.title || "Без названия";
            var thumb = "";

            if (item.videoThumbnails && item.videoThumbnails.length > 0) {
                thumb = item.videoThumbnails[0].url;
            } else if (item.thumbnail) {
                thumb = item.thumbnail;
            } else if (item.thumbnails && item.thumbnails.length > 0) {
                thumb = item.thumbnails[0].url;
            } else {
                thumb = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
            }

            items.push({ id: id, title: title, thumbnail: thumb });
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
                if (fs.url) {
                    streams.push({
                        url: fs.url,
                        quality: fs.qualityLabel || fs.resolution || "SD",
                        format: fs.container || "MP4"
                    });
                }
            }
            var captions = data.captions || [];
            for (var c = 0; c < captions.length; c++) {
                subtitles.push({ url: captions[c].url, code: captions[c].languageCode });
            }
        } else if (serverType === "piped") {
            var vStreams = data.videoStreams || [];
            for (var k = 0; k < vStreams.length; k++) {
                var vs = vStreams[k];
                if (vs.url && vs.videoOnly === false) {
                    streams.push({
                        url: vs.url,
                        quality: vs.quality || "SD",
                        format: vs.format || "MP4"
                    });
                }
            }
            var subs = data.subtitles || [];
            for (var s = 0; s < subs.length; s++) {
                subtitles.push({ url: subs[s].url, code: subs[s].code });
            }
        }

        if (streams.length === 0) return null;
        return { title: title, streams: streams, subtitles: subtitles };
    }

    return null;
}

function renderGrid(items, container) {
    if (!container) return;
    container.innerHTML = "";
    
    if (!items || items.length === 0) {
        container.innerHTML = "<div style='padding:20px;'>Ничего не найдено.</div>";
        return;
    }

    for (var i = 0; i < items.length; i++) {
        var item = items[i];

        var card = document.createElement("div");
        card.className = "card";
        card.setAttribute("data-id", item.id);

        var thumb = document.createElement("div");
        thumb.className = "card-thumb";
        thumb.style.backgroundImage = "url('" + item.thumbnail + "')";

        var title = document.createElement("div");
        title.className = "card-title";
        title.textContent = item.title;

        card.appendChild(thumb);
        card.appendChild(title);

        card.onclick = function () {
            playVideo(this.getAttribute("data-id"));
        };

        container.appendChild(card);
    }
}

function loadTrending() {
    gridContainer.classList.remove("hidden");
    shortsContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");
    shortsContainer.className = "hidden";
    mainVideo.pause();
    gridContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Поиск рабочего сервера и загрузка...</div>";

    executeApiRequest("trending", {}, function (err, data) {
        if (err || !data) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>" + (err || "Ошибка загрузки.") + "</div>";
            return;
        }
        renderGrid(data, gridContainer);
    });
}

function loadShorts() {
    shortsContainer.classList.remove("hidden");
    gridContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");
    mainVideo.pause();
    
    shortsContainer.innerHTML = "<div style='padding:20px; color:#aaa; text-align:center;'>Загрузка Shorts...</div>";
    shortsContainer.className = "shorts-feed-container"; 

    executeApiRequest("search", { q: "shorts" }, function (err, items) {
        if (err || !items) {
            shortsContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка загрузки Shorts.</div>";
            return;
        }
        
        shortsContainer.innerHTML = ""; 

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
            videoEl.poster = item.thumbnail;

            var titleEl = document.createElement("div");
            titleEl.className = "short-overlay-title";
            titleEl.textContent = item.title;

            wrapper.appendChild(videoEl);
            wrapper.appendChild(titleEl);
            shortsContainer.appendChild(wrapper);

            if (hasObserver) {
                shortsObserver.observe(wrapper);
            } else {
                wrapper.onclick = function() {
                    var v = this.querySelector("video");
                    var id = this.getAttribute("data-id");
                    if (!v.src) {
                        loadStreamsForVideo(id, function(e, str) {
                            if (!e && str && str.length > 0) {
                                v.src = str[0].url;
                                v.play();
                            }
                        });
                    }
                };
            }
        }
    });
}

function loadStreamsForVideo(videoId, callback) {
    executeApiRequest("streams", { id: videoId }, function (err, data) {
        if (err || !data) {
            callback(err, null);
        } else {
            callback(null, data.streams, data);
        }
    });
}

function playVideo(videoId) {
    playerContainer.classList.remove("hidden");
    window.scrollTo(0, 0);
    mainVideo.pause();
    mainVideo.removeAttribute('src');
    videoTitle.textContent = "Подключение к серверу...";
    qualitySelect.innerHTML = "<option>Загрузка...</option>";

    executeApiRequest("streams", { id: videoId }, function (err, data) {
        if (err || !data) {
            videoTitle.textContent = "Не удалось воспроизвести видео.";
            qualitySelect.innerHTML = "";
            return;
        }

        videoTitle.textContent = data.title;
        currentStreams = data.streams;
        qualitySelect.innerHTML = "";

        for (var j = 0; j < currentStreams.length; j++) {
            var stream = currentStreams[j];
            var opt = document.createElement("option");
            opt.value = j;
            opt.textContent = stream.quality + " (" + stream.format + ")";
            qualitySelect.appendChild(opt);
        }

        if (currentStreams.length > 0) {
            mainVideo.src = currentStreams[0].url;
            var playPromise = mainVideo.play();
            if (playPromise !== undefined && playPromise.catch) {
                playPromise.catch(function(e) {});
            }
        }

        if (data.subtitles && data.subtitles.length > 0) {
            var subUrl = data.subtitles[0].url; 
            for (var k = 0; k < data.subtitles.length; k++) {
                if (data.subtitles[k].code === "ru") {
                    subUrl = data.subtitles[k].url;
                    break;
                }
            }
            captionTrack.src = subUrl;
            captionTrack.default = true;
        } else {
            captionTrack.removeAttribute("src");
            captionTrack.default = false;
        }
    });
}

qualitySelect.onchange = function () {
    var idx = parseInt(this.value, 10);
    if (currentStreams[idx]) {
        var currentTime = mainVideo.currentTime;
        var isPaused = mainVideo.paused;
        
        mainVideo.src = currentStreams[idx].url;
        mainVideo.currentTime = currentTime;
        
        if (!isPaused) {
            var playPromise = mainVideo.play();
            if (playPromise !== undefined && playPromise.catch) {
                playPromise.catch(function(e) {});
            }
        }
    }
};

searchBtn.onclick = function () {
    var query = searchInput.value;
    if (!query) return;

    gridContainer.classList.remove("hidden");
    shortsContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");
    shortsContainer.className = "hidden";
    mainVideo.pause();
    gridContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Поиск...</div>";

    executeApiRequest("search", { q: query }, function (err, items) {
        if (err || !items) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка поиска.</div>";
            return;
        }
        renderGrid(items, gridContainer);
    });
};

searchInput.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        searchBtn.click();
    }
});

homeTab.onclick = function () {
    homeTab.className = "active";
    shortsTab.className = "";
    
    var shortsVideos = shortsContainer.querySelectorAll("video");
    for (var i = 0; i < shortsVideos.length; i++) {
        shortsVideos[i].pause();
    }
    
    loadTrending();
};

shortsTab.onclick = function () {
    shortsTab.className = "active";
    homeTab.className = "";
    loadShorts();
};

loadTrending();
