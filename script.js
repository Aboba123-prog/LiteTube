var resultsDiv = document.getElementById('results');
var statusDiv = document.getElementById('status');
var playerBox = document.getElementById('playerBox');
var player = document.getElementById('player');
var nowPlaying = document.getElementById('nowPlaying');
var searchInput = document.getElementById('q');

var mirrors = [
    'https://vid.puffyan.us',
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
    'https://yt.artemislena.eu',
    'https://invidious.privacyredirect.com',
    'https://invidious.protokolla.fi'
];

var currentXhr = null;
var timeoutTimer = null;

// Сброс состояния приложения при клике на логотип
function resetApp() {
    if (currentXhr) currentXhr.abort();
    if (timeoutTimer) clearTimeout(timeoutTimer);

    closePlayer();
    searchInput.value = '';
    resultsDiv.innerHTML = '';
    statusDiv.innerHTML = 'Введите поисковый запрос или ссылку на видео';
    window.scrollTo(0, 0);
}

function quickSearch(tag) {
    searchInput.value = tag;
    startSearch();
}

function extractId(str) {
    var reg = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var m = str.match(reg);
    if (m && m[7] && m[7].length === 11) return m[7];
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return false;
}

function playVideo(id, titleText) {
    playerBox.style.display = 'block';
    nowPlaying.innerHTML = titleText ? titleText : 'Видео ID: ' + id;
    player.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    window.scrollTo(0, 0);
}

function closePlayer() {
    player.src = '';
    playerBox.style.display = 'none';
}

function startSearch() {
    var query = searchInput.value.replace(/^\s+|\s+$/g, '');
    if (!query) return;

    var directId = extractId(query);
    if (directId) {
        playVideo(directId, 'Прямой запуск ссылки/ID');
        statusDiv.innerHTML = 'Видео загружено в плеер.';
        return;
    }

    if (currentXhr) {
        currentXhr.abort();
    }
    if (timeoutTimer) {
        clearTimeout(timeoutTimer);
    }

    resultsDiv.innerHTML = '';
    tryMirror(query, 0);
}

function tryMirror(query, index) {
    if (index >= mirrors.length) {
        tryFallbackProxy(query);
        return;
    }

    statusDiv.innerHTML = 'Поиск через сервер ' + (index + 1) + ' из ' + mirrors.length + '...';

    var xhr = new XMLHttpRequest();
    currentXhr = xhr;
    var url = mirrors[index] + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=video';

    xhr.open('GET', url, true);

    timeoutTimer = setTimeout(function () {
        xhr.abort();
        tryMirror(query, index + 1);
    }, 3000);

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            clearTimeout(timeoutTimer);
            if (xhr.status === 200 && xhr.responseText.indexOf('videoId') !== -1) {
                parseApiText(xhr.responseText);
            } else {
                tryMirror(query, index + 1);
            }
        }
    };

    xhr.send();
}

function tryFallbackProxy(query) {
    statusDiv.innerHTML = 'Запуск резервного шлюза...';

    var xhr = new XMLHttpRequest();
    currentXhr = xhr;
    var ytUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    var proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(ytUrl);

    xhr.open('GET', proxyUrl, true);

    timeoutTimer = setTimeout(function () {
        xhr.abort();
        statusDiv.innerHTML = 'Все сервера перегружены. Попробуйте еще раз.';
    }, 5000);

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            clearTimeout(timeoutTimer);
            if (xhr.status === 200 && xhr.responseText.length > 500) {
                parseHtmlText(xhr.responseText);
            } else {
                statusDiv.innerHTML = 'Не удалось найти ролики. Попробуйте другой запрос.';
            }
        }
    };

    xhr.send();
}

function parseApiText(raw) {
    var items = [];
    var blocks = raw.split('"type":"video"');

    for (var i = 1; i < blocks.length; i++) {
        var chunk = blocks[i];
        var idMatch = chunk.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        var titleMatch = chunk.match(/"title":"((?:\\.|[^"\\])*)"/);
        var authorMatch = chunk.match(/"author":"((?:\\.|[^"\\])*)"/);

        if (idMatch && titleMatch) {
            var id = idMatch[1];
            var exists = false;
            for (var j = 0; j < items.length; j++) {
                if (items[j].id === id) exists = true;
            }
            if (!exists) {
                items.push({
                    id: id,
                    title: cleanStr(titleMatch[1]),
                    author: authorMatch ? cleanStr(authorMatch[1]) : 'YouTube'
                });
            }
        }
        if (items.length >= 20) break;
    }

    renderItems(items);
}

function parseHtmlText(html) {
    var items = [];
    var regex = /"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"\}\]/g;
    var match;

    while ((match = regex.exec(html)) !== null) {
        var id = match[1];
        var exists = false;
        for (var j = 0; j < items.length; j++) {
            if (items[j].id === id) exists = true;
        }
        if (!exists) {
            items.push({
                id: id,
                title: cleanStr(match[2]),
                author: 'YouTube'
            });
        }
        if (items.length >= 20) break;
    }

    renderItems(items);
}

function renderItems(items) {
    if (items.length === 0) {
        statusDiv.innerHTML = 'По вашему запросу ничего не найдено.';
        return;
    }

    statusDiv.innerHTML = 'Найдено роликов: ' + items.length;
    var html = '';

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var safeTitle = item.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += '<div class="item" onclick="playVideo(\'' + item.id + '\', \id=\'' + safeTitle + '\')">' +
            '<img class="thumb" src="https://i.ytimg.com/vi/' + item.id + '/default.jpg" alt="">' +
            '<div class="info">' +
            '<div class="title">' + item.title + '</div>' +
            '<div class="meta">Канал: ' + item.author + '</div>' +
            '</div>' +
            '</div>';
    }

    resultsDiv.innerHTML = html;
}

function cleanStr(str) {
    var decoded = str.replace(/\\u([\d\w]{4})/gi, function (m, grp) {
        return String.fromCharCode(parseInt(grp, 16));
    });
    return decoded.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');
}
