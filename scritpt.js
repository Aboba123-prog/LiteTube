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

function getApiUrl(path) {
    return API_NODES[currentApiIndex] + path;
}

function fetchJSON(path, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getApiUrl(path), true);
    
    function tryNextFallback() {
        if (currentApiIndex < API_NODES.length - 1) {
            currentApiIndex++;
            fetchJSON(path, callback); // Пробуем следующее зеркало
        } else {
            currentApiIndex = 0; // Сбрасываем для будущих попыток
            callback("Все серверы недоступны", null);
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
    
    // Перехват сетевых ошибок (если браузер заблокировал запрос)
    xhr.onerror = function() {
        tryNextFallback();
    };
    
    xhr.send();
}

function loadTrending() {
    gridContainer.classList.remove("hidden");
    shortsContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");
    mainVideo.pause();
    gridContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Загрузка главных видео...</div>";

    fetchJSON("/trending?region=RU", function (err, data) {
        if (err || !data) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка. Проверьте интернет или отключите VPN.</div>";
            return;
        }
        renderGrid(data, gridContainer, false);
    });
}

function loadShorts() {
    shortsContainer.classList.remove("hidden");
    gridContainer.classList.add("hidden");
    playerContainer.classList.add("hidden");
    mainVideo.pause();
    shortsContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Загрузка Shorts...</div>";

    fetchJSON("/search?q=shorts&filter=videos", function (err, data) {
        if (err || !data) {
            shortsContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка загрузки Shorts.</div>";
            return;
        }
        var items = data.items || data;
        renderGrid(items, shortsContainer, true);
    });
}

function renderGrid(items, container, isShort) {
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
        card.className = isShort ? "short-card" : "card";
        card.setAttribute("data-id", videoId);

        var thumbUrl = item.thumbnail || (item.thumbnails && item.thumbnails.length ? item.thumbnails[0].url : "");
        var thumb = document.createElement("div");
        thumb.className = isShort ? "short-thumb" : "card-thumb";
        if (thumbUrl) {
            thumb.style.backgroundImage = "url('" + thumbUrl + "')";
        }

        var title = document.createElement("div");
        title.className = "card-title";
        title.textContent = item.title || "Без названия";

        card.appendChild(thumb);
        card.appendChild(title);

        card.onclick = function () {
            var id = this.getAttribute("data-id");
            playVideo(id);
        };

        container.appendChild(card);
    }
}

function playVideo(videoId) {
    playerContainer.classList.remove("hidden");
    window.scrollTo(0, 0);
    
    // Останавливаем старое видео перед загрузкой нового
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
        
        // ФИЛЬТР: Ищем потоки, где есть И видео, И звук (videoOnly === false)
        for (var i = 0; i < allStreams.length; i++) {
            if (allStreams[i].videoOnly === false) {
                validStreams.push(allStreams[i]);
            }
        }

        // Если не нашли объединенные потоки (крайне редко), берем что есть
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

        // Настройка субтитров (поиск русских)
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
    mainVideo.pause();
    gridContainer.innerHTML = "<div style='padding:20px; color:#aaa;'>Поиск...</div>";

    fetchJSON("/search?q=" + encodeURIComponent(query) + "&filter=all", function (err, data) {
        if (err || !data) {
            gridContainer.innerHTML = "<div style='padding:20px; color:#ff5555;'>Ошибка при поиске.</div>";
            return;
        }
        var items = data.items || data;
        renderGrid(items, gridContainer, false);
    });
};

// Поддержка поиска по нажатию Enter
searchInput.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        searchBtn.click();
    }
});

homeTab.onclick = function () {
    homeTab.className = "active";
    shortsTab.className = "";
    loadTrending();
};

shortsTab.onclick = function () {
    shortsTab.className = "active";
    homeTab.className = "";
    loadShorts();
};

// Запуск при открытии
loadTrending();