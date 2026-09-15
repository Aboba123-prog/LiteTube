var API_NODES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.privacydev.net",
    "https://pipedapi.drgns.space",
    "https://pipedapi.adminforge.de"
];

var currentApiIndex = 0;
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
                    fetchJSON("/streams/" + videoId, function(err, data) {
                        if (!err && data && data.videoStreams) {
                            var bestUrl = data.videoStreams[0].url;
                            for (var k = 0; k < data.videoStreams.length; k++) {
                                if (data.videoStreams[k].videoOnly === false) {
                                    bestUrl = data.videoStreams[k].url;
                                    break;
                                }
                            }
                            videoElement.src = bestUrl;
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

function getApiUrl(path) {
    return API_NODES[currentApiIndex] + path;
}

function fetchJSON(path, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getApiUrl(path), true);
    
    function tryNextFallback() {
        if (currentApiIndex < API_NODES.length - 1) {
            currentApiIndex++;
            fetchJSON(path, callback);
        } else {
            currentApiIndex = 0;
            callback("Error", null);
        }
    }

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    callback(null, data);
                } catch (e) {
                    tryNextFallback();
                }
            } else if (xhr.status !== 0) {
                tryNextFallback();
            }
        }
    };
    
    xhr.onerror = function() {
        tryNextFallback();
    };
    
    xhr.send();
}

function renderGrid(items, container) {
    container.innerHTML = "";
    if (!items || items.length === 0) {
        container.innerHTML = "<div style='padding:20px;'>Ничего не найдено.</div>";
        return;
    }

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var rawUrl = item.url || item.id;
        if (!rawUrl) continue;

        var videoId = rawUrl.replace("/watch?v=", "").replace("/shorts/", "");
        var card = document.createElement("div");
        card.className = "card";
        card.setAttribute("data-id", videoId);

        var thumbUrl = item.thumbnail || (item.thumbnails && item.thumbnails.length ? item.thumbnails[0].url : "");
        var thumb = document.createElement("div");
        thumb.className = "card-thumb";
        if (thumbUrl) {
            thumb.style.backgroundImage = "url('" + thumbUrl + "')";
        }

        var title = document.createElement("div");
        title.className = "card-title";
        title.textContent = item.title || "Без названия";

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
    gridContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Загрузка...</div>";

    fetchJSON("/trending?region=RU", function (err, data) {
        if (err || !data) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка загрузки.</div>";
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

    fetchJSON("/search?q=shorts&filter=videos", function (err, data) {
        if (err || !data) {
            shortsContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка загрузки Shorts.</div>";
            return;
        }
        
        var items = data.items || data;
        shortsContainer.innerHTML = ""; 

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var rawUrl = item.url || item.id;
            if (!rawUrl) continue;
            var videoId = rawUrl.replace("/watch?v=", "").replace("/shorts/", "");

            var wrapper = document.createElement("div");
            wrapper.className = "short-video-wrapper";
            wrapper.setAttribute("data-id", videoId);

            var videoEl = document.createElement("video");
            videoEl.loop = true;
            videoEl.controls = true;
            videoEl.setAttribute("playsinline", "");
            videoEl.setAttribute("webkit-playsinline", "");

            var thumbUrl = item.thumbnail || (item.thumbnails && item.thumbnails.length ? item.thumbnails[0].url : "");
            videoEl.poster = thumbUrl;

            var titleEl = document.createElement("div");
            titleEl.className = "short-overlay-title";
            titleEl.textContent = item.title || "Без названия";

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
                        fetchJSON("/streams/" + id, function(e, d) {
                            if(!e && d && d.videoStreams) {
                                var bUrl = d.videoStreams[0].url;
                                for (var w = 0; w < d.videoStreams.length; w++) {
                                    if (d.videoStreams[w].videoOnly === false) {
                                        bUrl = d.videoStreams[w].url;
                                        break;
                                    }
                                }
                                v.src = bUrl;
                                v.play();
                            }
                        });
                    }
                };
            }
        }
    });
}

function playVideo(videoId) {
    playerContainer.classList.remove("hidden");
    window.scrollTo(0, 0);
    mainVideo.pause();
    mainVideo.removeAttribute('src');
    videoTitle.textContent = "Загрузка потока...";
    qualitySelect.innerHTML = "<option>Поиск качества...</option>";

    fetchJSON("/streams/" + videoId, function (err, data) {
        if (err || !data) {
            videoTitle.textContent = "Не удалось загрузить видео.";
            qualitySelect.innerHTML = "";
            return;
        }

        videoTitle.textContent = data.title || "Видео";
        var allStreams = data.videoStreams || [];
        var validStreams = [];
        
        for (var i = 0; i < allStreams.length; i++) {
            if (allStreams[i].videoOnly === false) {
                validStreams.push(allStreams[i]);
            }
        }

        currentStreams = validStreams.length > 0 ? validStreams : allStreams;
        qualitySelect.innerHTML = "";

        for (var j = 0; j < currentStreams.length; j++) {
            var stream = currentStreams[j];
            if (stream.quality) {
                var opt = document.createElement("option");
                opt.value = j;
                opt.textContent = stream.quality + " (" + (stream.format || "MP4") + ")";
                qualitySelect.appendChild(opt);
            }
        }

        if (currentStreams.length > 0) {
            mainVideo.src = currentStreams[0].url;
            mainVideo.play();
        }

        if (data.subtitles && data.subtitles.length > 0) {
            var subUrl = data.subtitles[0].url; 
            for(var k = 0; k < data.subtitles.length; k++) {
                if(data.subtitles[k].code === "ru") {
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
            mainVideo.play();
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

    fetchJSON("/search?q=" + encodeURIComponent(query) + "&filter=all", function (err, data) {
        if (err || !data) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка при поиске.</div>";
            return;
        }
        var items = data.items || data;
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
