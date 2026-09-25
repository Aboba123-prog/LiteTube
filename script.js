(function () {
    'use strict';

    var VERIFIED_SERVERS = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.leptons.xyz',
        'https://pipedapi.nosebs.ru',
        'https://pipedapi-libre.kavin.rocks',
        'https://piped-api.privacy.com.de',
        'https://pipedapi.adminforge.de',
        'https://api.piped.yt',
        'https://pipedapi.drgns.space',
        'https://pipedapi.owo.si',
        'https://pipedapi.ducks.party',
        'https://piped-api.codespace.cz',
        'https://pipedapi.reallyaweso.me',
        'https://api.piped.private.coffee',
        'https://pipedapi.darkness.services',
        'https://pipedapi.orangenet.cc'
    ];

    var EXTRA_SERVERS = [
        'https://pipedapi.tokhmi.xyz',
        'https://pipedapi.moomoo.me',
        'https://pipedapi.syncpundit.io',
        'https://api-piped.mha.fi',
        'https://piped-api.garudalinux.org',
        'https://pipedapi.rivo.lol',
        'https://pipedapi.privacydev.net',
        'https://pipedapi.frontendfriendly.xyz',
        'https://pipedapi.astartes.nl',
        'https://pipedapi.osphost.fi',
        'https://pipedapi.simpleprivacy.fr',
        'https://piapi.ggtyler.dev',
        'https://api.watch.pluto.lat',
        'https://piped-backend.seitan-ayoub.lol',
        'https://piped-api.hostux.net',
        'https://pdapi.vern.cc',
        'https://pipedapi.pfcd.me'
    ];

    var API_PROXY = 'https://api.allorigins.win/get?url=';

    var HISTORY_KEY = 'litetube_history_v6';
    var FAVORITES_KEY = 'litetube_favorites_v6';
    var SETTINGS_KEY = 'litetube_settings_v6';

    var HISTORY_LIMIT = 60;
    var FAVORITES_LIMIT = 60;
    var SEARCH_LIMIT = 36;
    var HOME_LIMIT = 24;
    var SHORTS_LIMIT = 30;

    var state = {
        page: 'home',
        pageBeforePlayer: 'search',
        current: null,
        streams: [],
        currentStream: -1,
        requestId: 0,
        history: [],
        favorites: [],
        settings: {
            theme: 'light',
            lite: 'auto',
            tv: false,
            serverMode: 'auto'
        },
        currentServer: '',
        workingServers: {}
    };

    function $(id) {
        return document.getElementById(id)
    }

    function trim(value) {
        return String(value || '').replace(/^\s+|\s+$/g, '')
    }

    function esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function on(element, name, handler) {
        if (!element) {
            return
        }

        if (element.addEventListener) {
            element.addEventListener(name, handler, false)
        } else if (element.attachEvent) {
            element.attachEvent('on' + name, handler)
        } else {
            element['on' + name] = handler
        }
    }

    function cancel(event) {
        event = event || window.event;

        if (event.preventDefault) {
            event.preventDefault()
        }

        event.returnValue = false;

        return false
    }

    function storageGet(key) {
        try {
            return localStorage.getItem(key)
        } catch (e) {
            return null
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value)
        } catch (e) { }
    }

    function loadArray(key) {
        var text = storageGet(key);

        if (!text) {
            return []
        }

        try {
            var value = JSON.parse(text);

            if (value && value.length) {
                return value
            }
        } catch (e) { }

        return []
    }

    function randomInt(max) {
        return Math.floor(Math.random() * max)
    }

    function shuffle(list) {
        var result = list.slice(0);
        var i;
        var j;
        var temp;

        for (i = result.length - 1; i > 0; i--) {
            j = randomInt(i + 1);
            temp = result[i];
            result[i] = result[j];
            result[j] = temp
        }

        return result
    }

    function unique(list) {
        var result = [];
        var seen = {};
        var i;

        for (i = 0; i < list.length; i++) {
            if (!seen[list[i]]) {
                seen[list[i]] = true;
                result.push(list[i])
            }
        }

        return result
    }

    function contains(list, value) {
        var i;

        for (i = 0; i < list.length; i++) {
            if (list[i] === value) {
                return true
            }
        }

        return false
    }

    function loadSettings() {
        var data = storageGet(SETTINGS_KEY);
        var parsed;

        state.history = loadArray(HISTORY_KEY);
        state.favorites = loadArray(FAVORITES_KEY);

        if (data) {
            try {
                parsed = JSON.parse(data);

                if (parsed && typeof parsed === 'object') {

                    if (
                        parsed.theme === 'dark' ||
                        parsed.theme === 'light'
                    ) {
                        state.settings.theme = parsed.theme
                    }

                    if (
                        parsed.lite === 'auto' ||
                        parsed.lite === 'on' ||
                        parsed.lite === 'off'
                    ) {
                        state.settings.lite = parsed.lite
                    }

                    if (parsed.tv === true) {
                        state.settings.tv = true
                    }

                    if (
                        parsed.serverMode === 'auto' ||
                        parsed.serverMode === 'random' ||
                        parsed.serverMode === 'verified' ||
                        parsed.serverMode === 'extra'
                    ) {
                        state.settings.serverMode = parsed.serverMode
                    }

                }
            } catch (e) { }
        }
    }

    function saveSettings() {
        storageSet(
            SETTINGS_KEY,
            JSON.stringify(state.settings)
        )
    }

    function saveData() {
        storageSet(
            HISTORY_KEY,
            JSON.stringify(state.history)
        );

        storageSet(
            FAVORITES_KEY,
            JSON.stringify(state.favorites)
        );

        saveSettings()
    }

    function detectTV() {
        var ua = String(
            navigator.userAgent || ''
        ).toLowerCase();

        if (
            /smart-tv|smarttv|hbbtv|googletv|android tv|netcast|web0s|webos|tizen|viera|aquos|bravia|appletv/.test(ua)
        ) {
            return true
        }

        return false
    }

    function effectiveLite() {
        if (state.settings.lite === 'on') {
            return true
        }

        if (state.settings.lite === 'off') {
            return false
        }

        return false
    }

    function addBodyClass(name) {
        if (
            document.body.className.indexOf(name) === -1
        ) {
            document.body.className =
                trim(
                    document.body.className +
                    ' ' +
                    name
                )
        }
    }

    function removeBodyClass(name) {
        var parts =
            document.body.className.split(/\s+/);

        var result = [];
        var i;

        for (i = 0; i < parts.length; i++) {
            if (
                parts[i] &&
                parts[i] !== name
            ) {
                result.push(parts[i])
            }
        }

        document.body.className =
            result.join(' ')
    }

    function applyPreferences() {
        if (state.settings.theme === 'dark') {
            addBodyClass('dark')
        } else {
            removeBodyClass('dark')
        }

        if (state.settings.tv) {
            addBodyClass('tvMode')
        } else {
            removeBodyClass('tvMode')
        }

        if (effectiveLite()) {
            addBodyClass('liteMode')
        } else {
            removeBodyClass('liteMode')
        }

        $('themeButton').innerHTML =
            state.settings.theme === 'dark' ?
                'Светлая тема' :
                'Тёмная тема';

        $('tvButton').innerHTML =
            state.settings.tv ?
                'Выключить ТВ-режим' :
                'Включить ТВ-режим';

        $('liteMode').value =
            state.settings.lite;

        $('serverMode').value =
            state.settings.serverMode;

        updateServerLabel();
        updateServerStats();
        makeCardsFocusable()
    }

    function getVideoId(value) {
        var text = trim(value);
        var match;

        if (!text) {
            return ''
        }

        if (
            /^[A-Za-z0-9_-]{11}$/.test(text)
        ) {
            return text
        }

        match =
            text.match(
                /[?&]v=([A-Za-z0-9_-]{11})/i
            );

        if (match) {
            return match[1]
        }

        match =
            text.match(
                /youtu\.be\/([A-Za-z0-9_-]{11})/i
            );

        if (match) {
            return match[1]
        }

        match =
            text.match(
                /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i
            );

        if (match) {
            return match[1]
        }

        match =
            text.match(
                /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i
            );

        if (match) {
            return match[1]
        }

        return ''
    }

    function thumbUrl(id) {
        return (
            'https://i.ytimg.com/vi/' +
            encodeURIComponent(id) +
            '/mqdefault.jpg'
        )
    }

    function youtubeUrl(id) {
        return (
            'https://www.youtube.com/watch?v=' +
            encodeURIComponent(id)
        )
    }

    function formatDuration(value) {
        var seconds = parseInt(value, 10);
        var hours;
        var minutes;
        var sec;

        if (
            isNaN(seconds) ||
            seconds < 0
        ) {
            return ''
        }

        hours =
            Math.floor(
                seconds / 3600
            );

        minutes =
            Math.floor(
                (seconds % 3600) / 60
            );

        sec =
            seconds % 60;

        if (sec < 10) {
            sec = '0' + sec
        }

        if (hours > 0) {

            if (minutes < 10) {
                minutes = '0' + minutes
            }

            return (
                hours +
                ':' +
                minutes +
                ':' +
                sec
            )
        }

        if (minutes < 10) {
            minutes = '0' + minutes
        }

        return (
            minutes +
            ':' +
            sec
        )
    }

    function formatViews(value) {
        var count = parseInt(value, 10);

        if (
            isNaN(count) ||
            count < 1
        ) {
            return ''
        }

        if (count >= 1000000000) {
            return (
                Math.round(
                    count / 100000000
                ) / 10
            ) + ' млрд'
        }

        if (count >= 1000000) {
            return (
                Math.round(
                    count / 100000
                ) / 10
            ) + ' млн'
        }

        if (count >= 1000) {
            return (
                Math.round(
                    count / 100
                ) / 10
            ) + ' тыс.'
        }

        return String(count)
    }

    function getThumb(item) {
        var list = item.videoThumbnails || [];
        var i;

        if (item.thumbnailUrl) {
            return item.thumbnailUrl
        }

        if (item.thumbnail) {
            return item.thumbnail
        }

        for (i = 0; i < list.length; i++) {
            if (
                list[i].quality ===
                'medium' &&
                list[i].url
            ) {
                return list[i].url
            }
        }

        for (i = 0; i < list.length; i++) {
            if (list[i].url) {
                return list[i].url
            }
        }

        return item.id ?
            thumbUrl(item.id) :
            ''
    }

    function normalize(item) {
        var id;

        if (!item) {
            return null
        }

        id =
            item.videoId ||
            item.id ||
            getVideoId(
                item.url || ''
            );

        if (!id) {
            return null
        }

        return {
            id: id,
            title:
                item.title ||
                'Без названия',
            author:
                item.uploaderName ||
                item.uploader ||
                item.author ||
                '',
            thumb:
                getThumb({
                    id: id,
                    thumbnail: item.thumbnail,
                    thumbnailUrl: item.thumbnailUrl,
                    videoThumbnails: item.videoThumbnails
                }),
            duration:
                item.duration ||
                item.lengthSeconds ||
                0,
            views:
                item.views ||
                item.viewCount ||
                0,
            uploaded:
                item.uploadedDate ||
                item.publishedText ||
                '',
            isShort:
                item.isShort === true
        }
    }

    function setStatus(id, text) {
        if ($(id)) {
            $(id).innerHTML =
                text || ''
        }
    }

    function setPlayerMessage(
        text,
        visible
    ) {
        $('playerMessage').innerHTML =
            esc(text || '');

        $('playerMessage').style.display =
            visible ?
                'block' :
                'none'
    }

    function showPage(page) {
        var ids = {
            home: 'homePage',
            shorts: 'shortsPage',
            search: 'searchPage',
            player: 'playerPage',
            history: 'historyPage',
            favorites: 'favoritesPage',
            settings: 'settingsPage'
        };

        var names = [
            'home',
            'shorts',
            'search',
            'player',
            'history',
            'favorites',
            'settings'
        ];

        var links =
            document.getElementsByTagName('a');

        var i;

        if (!ids[page]) {
            page = 'home'
        }

        state.page = page;

        for (i = 0; i < names.length; i++) {
            $(ids[names[i]]).className =
                names[i] === page ?
                    'page active' :
                    'page'
        }

        for (i = 0; i < links.length; i++) {

            if (
                links[i].getAttribute(
                    'data-page'
                )
            ) {
                links[i].className =
                    links[i].getAttribute(
                        'data-page'
                    ) === page ?
                        'navItem active' :
                        'navItem'
            }

        }

        if (page === 'history') {
            renderLocal('history')
        }

        if (page === 'favorites') {
            renderLocal('favorites')
        }

        makeCardsFocusable()
    }

    function navigate(page) {
        try {
            window.location.hash = page
        } catch (e) {
            showPage(page)
        }
    }

    function handleHash() {
        var value =
            String(
                window.location.hash ||
                ''
            ).replace(/^#/, '') || 'home';

        if (
            value === 'home' ||
            value === 'shorts' ||
            value === 'search' ||
            value === 'player' ||
            value === 'history' ||
            value === 'favorites' ||
            value === 'settings'
        ) {
            showPage(value)
        } else {
            showPage('home')
        }
    }

    function createCard(
        item,
        mode,
        index
    ) {
        var card =
            document.createElement('div');

        var inner =
            document.createElement('div');

        var wrap =
            document.createElement('div');

        var image =
            document.createElement('img');

        var title =
            document.createElement('div');

        var meta =
            document.createElement('div');

        var info = [];

        card.className = 'card';
        card.tabIndex = 0;

        inner.className =
            'cardInner';

        wrap.className =
            'thumbWrap';

        image.className =
            'thumb';

        image.src =
            item.thumb ||
            thumbUrl(item.id);

        image.alt = '';
        image.width = 320;
        image.height = 180;

        on(
            image,
            'error',
            function () {
                this.style.display =
                    'none'
            }
        );

        wrap.appendChild(
            image
        );

        if (item.isShort) {

            var shortBadge =
                document.createElement(
                    'span'
                );

            shortBadge.className =
                'shortBadge';

            shortBadge.innerHTML =
                'SHORT';

            wrap.appendChild(
                shortBadge
            );

        }

        if (item.duration) {

            var duration =
                document.createElement(
                    'span'
                );

            duration.className =
                'duration';

            duration.innerHTML =
                esc(
                    formatDuration(
                        item.duration
                    )
                );

            wrap.appendChild(
                duration
            );

        }

        title.className =
            'cardTitle';

        title.innerHTML =
            esc(
                item.title
            );

        if (item.author) {
            info.push(
                item.author
            )
        }

        if (item.views) {
            info.push(
                formatViews(
                    item.views
                )
            )
        }

        if (item.uploaded) {
            info.push(
                item.uploaded
            )
        }

        meta.className =
            'cardMeta';

        meta.innerHTML =
            esc(
                info.join(' • ')
            );

        inner.appendChild(
            wrap
        );

        inner.appendChild(
            title
        );

        inner.appendChild(
            meta
        );

        card.appendChild(
            inner
        );

        on(
            card,
            'click',
            function () {
                openVideo(
                    item,
                    true
                )
            }
        );

        on(
            card,
            'keydown',
            function (event) {

                event =
                    event ||
                    window.event;

                var code =
                    event.keyCode ||
                    event.which;

                if (code === 13) {
                    openVideo(
                        item,
                        true
                    );
                    return
                }

                if (
                    code === 37 ||
                    code === 38 ||
                    code === 39 ||
                    code === 40
                ) {
                    remoteMove(
                        event
                    )
                }

            }
        );

        if (mode) {

            var remove =
                document.createElement(
                    'button'
                );

            remove.type = 'button';

            remove.className =
                'removeCard';

            remove.innerHTML = '×';

            on(
                remove,
                'click',
                function (event) {

                    cancel(event);

                    if (mode === 'history') {
                        state.history.splice(
                            index,
                            1
                        )
                    } else {
                        state.favorites.splice(
                            index,
                            1
                        )
                    }

                    saveData();

                    renderLocal(
                        mode
                    )

                }
            );

            card.appendChild(
                remove
            );

        }

        return card
    }

    function renderGrid(
        id,
        list,
        mode
    ) {
        var grid = $(id);
        var i;

        grid.innerHTML = '';

        for (
            i = 0;
            i < list.length;
            i++
        ) {

            if (
                list[i] &&
                list[i].id
            ) {

                grid.appendChild(
                    createCard(
                        list[i],
                        mode,
                        i
                    )
                );

            }

        }

        makeCardsFocusable()
    }

    function renderLocal(
        type
    ) {
        var list =
            type === 'history' ?
                state.history :
                state.favorites;

        var grid =
            type === 'history' ?
                'historyGrid' :
                'favoritesGrid';

        var empty =
            type === 'history' ?
                'historyEmpty' :
                'favoritesEmpty';

        renderGrid(
            grid,
            list,
            type
        );

        $(empty).style.display =
            list.length ?
                'none' :
                'block'
    }

    function addHistory(item) {
        var result = [];
        var i;

        for (
            i = 0;
            i < state.history.length;
            i++
        ) {

            if (
                state.history[i].id !==
                item.id
            ) {

                result.push(
                    state.history[i]
                );

            }

        }

        result.unshift({
            id: item.id,
            title: item.title,
            author: item.author,
            thumb: item.thumb,
            duration: item.duration,
            views: item.views,
            uploaded: item.uploaded,
            isShort: item.isShort
        });

        state.history =
            result.slice(
                0,
                HISTORY_LIMIT
            );

        saveData()
    }

    function isFavorite(id) {
        var i;

        for (
            i = 0;
            i < state.favorites.length;
            i++
        ) {

            if (
                state.favorites[i].id ===
                id
            ) {
                return true
            }

        }

        return false
    }

    function updateFavorite() {

        if (!state.current) {
            return
        }

        $('favoriteButton').innerHTML =
            isFavorite(
                state.current.id
            ) ?
                'Убрать из избранного' :
                'В избранное'
    }

    function toggleFavorite() {

        var result = [];
        var found = false;
        var i;

        if (!state.current) {
            return
        }

        for (
            i = 0;
            i < state.favorites.length;
            i++
        ) {

            if (
                state.favorites[i].id ===
                state.current.id
            ) {

                found = true

            } else {

                result.push(
                    state.favorites[i]
                )

            }

        }

        if (!found) {

            result.unshift({
                id: state.current.id,
                title: state.current.title,
                author: state.current.author,
                thumb: state.current.thumb,
                duration: state.current.duration,
                views: state.current.views,
                uploaded: state.current.uploaded,
                isShort: state.current.isShort
            });

        }

        state.favorites =
            result.slice(
                0,
                FAVORITES_LIMIT
            );

        saveData();

        updateFavorite()
    }

    function buildServerPool() {

        var mode =
            state.settings.serverMode;

        var verified =
            shuffle(
                VERIFIED_SERVERS
            );

        var extra =
            shuffle(
                EXTRA_SERVERS
            );

        var pool = [];
        var working = [];
        var i;

        for (
            i = 0;
            i < verified.length;
            i++
        ) {

            if (
                state.workingServers[
                verified[i]
                ] === true
            ) {

                working.push(
                    verified[i]
                );

            }

        }

        for (
            i = 0;
            i < extra.length;
            i++
        ) {

            if (
                state.workingServers[
                extra[i]
                ] === true
            ) {

                working.push(
                    extra[i]
                );

            }

        }

        working =
            unique(
                working
            );

        if (
            mode === 'verified'
        ) {

            pool =
                verified

        } else if (
            mode === 'extra'
        ) {

            pool =
                extra

        } else if (
            mode === 'random'
        ) {

            pool =
                shuffle(
                    unique(
                        verified.concat(
                            extra
                        )
                    )
                );

        } else {

            if (
                state.currentServer &&
                contains(
                    working,
                    state.currentServer
                )
            ) {

                pool.push(
                    state.currentServer
                )

            }

            pool =
                pool.concat(
                    working
                );

            pool =
                unique(
                    pool
                );

            pool =
                pool.concat(
                    verified
                );

            pool =
                pool.concat(
                    extra
                );

        }

        return unique(pool)
    }

    function updateServerLabel() {

        $('serverLabel').innerHTML =
            esc(
                state.currentServer ||
                'Не выбран'
            )

    }

    function updateServerStats() {

        var officialWorking = 0;
        var extraWorking = 0;
        var i;

        for (
            i = 0;
            i < VERIFIED_SERVERS.length;
            i++
        ) {

            if (
                state.workingServers[
                VERIFIED_SERVERS[i]
                ] === true
            ) {

                officialWorking++

            }

        }

        for (
            i = 0;
            i < EXTRA_SERVERS.length;
            i++
        ) {

            if (
                state.workingServers[
                EXTRA_SERVERS[i]
                ] === true
            ) {

                extraWorking++

            }

        }

        $('serverStats').innerHTML =
            'Официальный пул: ' +
            VERIFIED_SERVERS.length +
            ' • дополнительный: ' +
            EXTRA_SERVERS.length +
            ' • успешно отвечали: ' +
            officialWorking +
            ' + ' +
            extraWorking
    }

    function jsonpRequest(
        target,
        success,
        failure,
        timeout
    ) {

        var head =
            document.getElementsByTagName(
                'head'
            )[0];

        var script =
            document.createElement(
                'script'
            );

        var callbackName =
            'ltcb_' +
            new Date().getTime() +
            '_' +
            randomInt(1000000);

        var done = false;
        var timer = null;

        function cleanup() {

            if (timer) {
                clearTimeout(timer)
            }

            try {
                delete window[
                    callbackName
                ]
            } catch (e) {
                window[
                    callbackName
                ] = undefined
            }

            if (
                script &&
                script.parentNode
            ) {

                script.parentNode.removeChild(
                    script
                );

            }

        }

        function fail() {

            if (done) {
                return
            }

            done = true;

            cleanup();

            if (failure) {
                failure()
            }

        }

        window[
            callbackName
        ] = function (data) {

            var contents;
            var parsed;

            if (done) {
                return
            }

            done = true;

            cleanup();

            try {

                contents =
                    data &&
                        typeof data.contents ===
                        'string' ?
                        data.contents :
                        data;

                parsed =
                    typeof contents ===
                        'string' ?
                        JSON.parse(contents) :
                        contents;

                success(
                    parsed
                );

            } catch (e) {

                if (failure) {
                    failure()
                }

            }

        };

        script.type =
            'text/javascript';

        script.async = true;

        script.src =
            API_PROXY +
            encodeURIComponent(
                target
            ) +
            '&callback=' +
            encodeURIComponent(
                callbackName
            );

        script.onerror =
            fail;

        timer =
            setTimeout(
                fail,
                timeout ||
                10000
            );

        head.appendChild(
            script
        );

    }

    function apiRequest(
        path,
        success,
        failure
    ) {

        var pool =
            buildServerPool();

        var index = 0;

        var max =
            state.settings.serverMode ===
                'random' ?
                Math.min(
                    pool.length,
                    12
                ) :
                Math.min(
                    pool.length,
                    14
                );

        function next() {

            var server;

            if (index >= max) {

                if (failure) {
                    failure()
                }

                return
            }

            server =
                pool[index++];

            jsonpRequest(
                server +
                path,
                function (data) {

                    state.currentServer =
                        server;

                    state.workingServers[
                        server
                    ] = true;

                    saveData();

                    updateServerLabel();

                    updateServerStats();

                    success(
                        data,
                        server
                    )

                },
                function () {

                    state.workingServers[
                        server
                    ] = false;

                    updateServerStats();

                    next()

                },
                9000
            )

        }

        next()
    }

    function compatibleStreams(
        data
    ) {

        var source =
            data &&
                data.videoStreams ?
                data.videoStreams :
                [];

        var streams = [];
        var seen = {};

        var maxHeight =
            effectiveLite() ?
                360 :
                480;

        var i;

        for (
            i = 0;
            i < source.length;
            i++
        ) {

            var stream =
                source[i];

            if (
                !stream ||
                !stream.url
            ) {
                continue
            }

            var height =
                parseInt(
                    stream.height,
                    10
                );

            var mime =
                String(
                    stream.mimeType ||
                    ''
                ).toLowerCase();

            var codec =
                String(
                    stream.codec ||
                    ''
                ).toLowerCase();

            if (
                stream.videoOnly ===
                true
            ) {
                continue
            }

            if (
                mime.indexOf(
                    'video/mp4'
                ) !== 0 &&
                String(
                    stream.format ||
                    ''
                ).toUpperCase() !==
                'MPEG_4'
            ) {
                continue
            }

            if (
                isNaN(height) ||
                height < 144 ||
                height > maxHeight
            ) {
                continue
            }

            if (
                codec.indexOf(
                    'av1'
                ) !== -1 ||
                codec.indexOf(
                    'vp9'
                ) !== -1
            ) {
                continue
            }

            if (seen[String(height)]) {
                continue
            }

            seen[String(height)] = true;

            streams.push(
                stream
            );

        }

        streams.sort(
            function (
                a,
                b
            ) {

                return (
                    parseInt(
                        a.height,
                        10
                    ) -
                    parseInt(
                        b.height,
                        10
                    )
                )

            }
        );

        return streams
    }

    function bestQuality(
        streams
    ) {

        var target =
            360;

        var best = 0;

        var difference =
            999999;

        var i;

        for (
            i = 0;
            i < streams.length;
            i++
        ) {

            var height =
                parseInt(
                    streams[i].height,
                    10
                );

            var diff =
                Math.abs(
                    height - target
                );

            if (
                diff <
                difference
            ) {

                difference =
                    diff;

                best = i

            }

        }

        return best
    }

    function updateQuality() {

        var select =
            $('qualitySelect');

        var i;

        select.innerHTML = '';

        if (
            !state.streams.length
        ) {

            var empty =
                document.createElement(
                    'option'
                );

            empty.value = '';

            empty.innerHTML =
                'Качество';

            select.appendChild(
                empty
            );

            return
        }

        for (
            i = 0;
            i < state.streams.length;
            i++
        ) {

            var option =
                document.createElement(
                    'option'
                );

            option.value =
                String(i);

            option.innerHTML =
                parseInt(
                    state.streams[i].height,
                    10
                ) +
                'p';

            select.appendChild(
                option
            );

        }

        if (
            state.currentStream >= 0
        ) {

            select.value =
                String(
                    state.currentStream
                )

        }

    }

    function setStream(
        index,
        preserve
    ) {

        var stream =
            state.streams[index];

        var video =
            $('videoPlayer');

        var oldTime = 0;

        var playing = false;

        if (
            !stream ||
            !stream.url
        ) {
            return
        }

        try {

            oldTime =
                video.currentTime ||
                0;

            playing =
                !video.paused;

        } catch (e) { }

        state.currentStream =
            index;

        video.src =
            stream.url;

        video.poster =
            state.current.thumb ||
            thumbUrl(
                state.current.id
            );

        updateQuality();

        setPlayerMessage(
            '',
            false
        );

        try {
            video.load()
        } catch (e2) { }

        if (
            preserve &&
            oldTime > 0
        ) {

            setTimeout(
                function () {

                    try {

                        video.currentTime =
                            oldTime;

                        if (
                            playing &&
                            video.play
                        ) {

                            video.play()

                        }

                    } catch (e3) { }

                },
                250
            );

        }

    }

    function processVideo(
        data,
        requestId
    ) {

        var streams;
        var best;
        var related = [];
        var source =
            data.relatedStreams ||
            [];

        var i;

        if (
            requestId !==
            state.requestId
        ) {
            return
        }

        if (data.title) {
            state.current.title =
                data.title
        }

        if (data.uploader) {
            state.current.author =
                data.uploader
        }

        if (data.thumbnailUrl) {
            state.current.thumb =
                data.thumbnailUrl
        }

        if (data.duration) {
            state.current.duration =
                data.duration
        }

        if (data.views) {
            state.current.views =
                data.views
        }

        $('playerTitle').innerHTML =
            esc(
                state.current.title
            );

        var meta = [];

        if (state.current.author) {
            meta.push(
                state.current.author
            )
        }

        if (state.current.views) {
            meta.push(
                formatViews(
                    state.current.views
                )
            )
        }

        if (state.current.duration) {
            meta.push(
                formatDuration(
                    state.current.duration
                )
            )
        }

        if (data.uploadDate) {
            meta.push(
                data.uploadDate
            )
        }

        $('playerMeta').innerHTML =
            esc(
                meta.join(
                    ' • '
                )
            );

        addHistory(
            state.current
        );

        for (
            i = 0;
            i < source.length &&
            related.length < 12;
            i++
        ) {

            var relatedItem =
                normalize(
                    source[i]
                );

            if (relatedItem) {
                related.push(
                    relatedItem
                )
            }

        }

        renderGrid(
            'relatedGrid',
            related,
            ''
        );

        streams =
            compatibleStreams(
                data
            );

        state.streams =
            streams;

        if (
            !streams.length
        ) {

            updateQuality();

            setPlayerMessage(
                'Нет совместимого MP4-потока',
                true
            );

            setStatus(
                'playerInfo',
                'Совместимый лёгкий поток не найден.'
            );

            return
        }

        best =
            bestQuality(
                streams
            );

        state.currentStream =
            best;

        updateQuality();

        setStatus(
            'playerInfo',
            'Сервер: ' +
            state.currentServer +
            ' • качество: ' +
            parseInt(
                streams[best].height,
                10
            ) +
            'p'
        );

        setStream(
            best,
            false
        )

    }

    function openVideo(
        item,
        fromList
    ) {

        var id =
            getVideoId(
                item.id
            );

        var requestId;

        if (!id) {
            return
        }

        if (
            fromList &&
            state.page ===
            'search'
        ) {

            state.pageBeforePlayer =
                'search'

        } else if (
            fromList &&
            state.page ===
            'shorts'
        ) {

            state.pageBeforePlayer =
                'shorts'

        }

        state.current = {
            id: id,
            title:
                item.title ||
                'Загрузка видео...',
            author:
                item.author ||
                '',
            thumb:
                item.thumb ||
                thumbUrl(id),
            duration:
                item.duration ||
                0,
            views:
                item.views ||
                0,
            uploaded:
                item.uploaded ||
                '',
            isShort:
                item.isShort === true
        };

        state.streams = [];

        state.currentStream =
            -1;

        state.requestId++;

        requestId =
            state.requestId;

        showPage(
            'player'
        );

        $('playerTitle').innerHTML =
            esc(
                state.current.title
            );

        $('playerMeta').innerHTML =
            '';

        $('playerInfo').innerHTML =
            'Подключение...';

        $('directInput').value =
            youtubeUrl(id);

        $('relatedGrid').innerHTML =
            '';

        $('qualitySelect').innerHTML =
            '<option value="">Качество</option>';

        $('videoPlayer').poster =
            state.current.thumb;

        $('videoPlayer')
            .removeAttribute(
                'src'
            );

        try {
            $('videoPlayer').load()
        } catch (e) { }

        setPlayerMessage(
            'Получаю видео...',
            true
        );

        updateFavorite();

        addHistory(
            state.current
        );

        apiRequest(
            '/streams/' +
            encodeURIComponent(id),
            function (data) {
                processVideo(
                    data,
                    requestId
                )
            },
            function () {

                if (
                    requestId !==
                    state.requestId
                ) {
                    return
                }

                setPlayerMessage(
                    'Поток недоступен',
                    true
                );

                setStatus(
                    'playerInfo',
                    'Все выбранные серверы недоступны. Смените режим серверов или попробуйте позже.'
                )

            }
        );

    }

    function normalizeList(
        data,
        limit,
        shortOnly,
        normalOnly
    ) {

        var list = [];
        var i;

        if (
            !data ||
            !data.length
        ) {
            return list
        }

        for (
            i = 0;
            i < data.length &&
            list.length < limit;
            i++
        ) {

            var item =
                normalize(
                    data[i]
                );

            if (!item) {
                continue
            }

            if (
                shortOnly &&
                !item.isShort
            ) {
                continue
            }

            if (
                normalOnly &&
                item.isShort
            ) {
                continue
            }

            list.push(
                item
            )

        }

        return list
    }

    function loadHome() {

        setStatus(
            'homeStatus',
            'Загрузка...'
        );

        $('homeGrid').innerHTML =
            '';

        apiRequest(
            '/trending?region=AZ',
            function (data) {

                var list =
                    normalizeList(
                        data,
                        HOME_LIMIT,
                        false,
                        true
                    );

                if (!list.length) {
                    list =
                        normalizeList(
                            data,
                            HOME_LIMIT,
                            false,
                            false
                        )
                }

                renderGrid(
                    'homeGrid',
                    list,
                    ''
                );

                setStatus(
                    'homeStatus',
                    list.length ?
                        'Популярные видео' :
                        'Лента пуста.'
                )

            },
            function () {

                setStatus(
                    'homeStatus',
                    'Лента сейчас недоступна. Нажмите «Обновить».'
                )

            }
        )

    }

    function loadShorts() {

        setStatus(
            'shortsStatus',
            'Загрузка Shorts...'
        );

        $('shortsGrid').innerHTML =
            '';

        apiRequest(
            '/search?q=%23shorts&filter=videos&region=AZ',
            function (data) {

                var list =
                    normalizeList(
                        data,
                        SHORTS_LIMIT,
                        true,
                        false
                    );

                renderGrid(
                    'shortsGrid',
                    list,
                    ''
                );

                setStatus(
                    'shortsStatus',
                    list.length ?
                        'Shorts: ' + list.length :
                        'Shorts не найдены.'
                )

            },
            function () {

                setStatus(
                    'shortsStatus',
                    'Shorts сейчас недоступны. Попробуйте сменить сервер.'
                )

            }
        )

    }

    function search(query) {

        var text =
            trim(query);

        var id =
            getVideoId(text);

        if (!text) {
            return
        }

        if (id) {

            openVideo(
                {
                    id: id,
                    title:
                        'Загрузка видео...',
                    thumb:
                        thumbUrl(id)
                },
                false
            );

            return
        }

        showPage(
            'search'
        );

        $('searchGrid').innerHTML =
            '';

        setStatus(
            'searchStatus',
            'Поиск: ' +
            esc(text)
        );

        apiRequest(
            '/search?q=' +
            encodeURIComponent(text) +
            '&filter=videos&region=AZ',
            function (data) {

                var list =
                    normalizeList(
                        data,
                        SEARCH_LIMIT,
                        false,
                        false
                    );

                renderGrid(
                    'searchGrid',
                    list,
                    ''
                );

                setStatus(
                    'searchStatus',
                    list.length ?
                        'Найдено: ' +
                        list.length :
                        'Ничего не найдено.'
                )

            },
            function () {

                setStatus(
                    'searchStatus',
                    'Поиск недоступен. Попробуйте другой сервер.'
                )

            }
        )

    }

    function directOpen() {

        var value =
            trim(
                $('directInput').value
            );

        var id =
            getVideoId(value);

        if (!id) {

            setStatus(
                'directStatus',
                'Введите ссылку YouTube или ID из 11 символов.'
            );

            return
        }

        setStatus(
            'directStatus',
            ''
        );

        openVideo(
            {
                id: id,
                title:
                    'Загрузка видео...',
                thumb:
                    thumbUrl(id)
            },
            false
        )

    }

    function rotateServer() {

        var pool =
            shuffle(
                unique(
                    VERIFIED_SERVERS.concat(
                        EXTRA_SERVERS
                    )
                )
            );

        if (
            pool.length
        ) {

            state.currentServer =
                pool[0];

            state.workingServers[
                pool[0]
            ] =
                undefined;

        }

        updateServerLabel();
        updateServerStats();

        setStatus(
            'serverStats',
            'Случайный сервер выбран. Следующий запрос его проверит.'
        )

    }

    function makeCardsFocusable() {

        var cards =
            document.getElementsByClassName ?
                document.getElementsByClassName(
                    'card'
                ) :
                [];

        var i;

        for (
            i = 0;
            i < cards.length;
            i++
        ) {

            cards[i].tabIndex =
                0

        }

    }

    function visibleCards() {

        var id;

        if (
            state.page ===
            'home'
        ) {
            id = 'homeGrid'
        } else if (
            state.page ===
            'shorts'
        ) {
            id = 'shortsGrid'
        } else if (
            state.page ===
            'search'
        ) {
            id = 'searchGrid'
        } else if (
            state.page ===
            'history'
        ) {
            id = 'historyGrid'
        } else if (
            state.page ===
            'favorites'
        ) {
            id = 'favoritesGrid'
        } else if (
            state.page ===
            'player'
        ) {
            id = 'relatedGrid'
        } else {
            return []
        }

        var root =
            $(id);

        if (
            !root ||
            !root.getElementsByClassName
        ) {
            return []
        }

        return root.getElementsByClassName(
            'card'
        )
    }

    function getColumns(cards) {

        var i;

        if (
            !cards.length
        ) {
            return 1
        }

        var top =
            cards[0].offsetTop;

        for (
            i = 1;
            i < cards.length;
            i++
        ) {

            if (
                cards[i].offsetTop !==
                top
            ) {
                return i
            }

        }

        return cards.length
    }

    function remoteMove(
        event
    ) {

        if (
            !state.settings.tv
        ) {
            return
        }

        var code =
            event.keyCode ||
            event.which;

        var cards =
            visibleCards();

        var current =
            document.activeElement;

        var index = -1;

        var i;

        var columns;
        var target;

        if (
            !cards.length
        ) {
            return
        }

        for (
            i = 0;
            i < cards.length;
            i++
        ) {

            if (
                cards[i] ===
                current
            ) {

                index = i;
                break

            }

        }

        if (index < 0) {

            cards[0].focus();

            return
        }

        columns =
            getColumns(
                cards
            );

        if (code === 37) {
            target =
                index - 1
        } else if (
            code === 39
        ) {
            target =
                index + 1
        } else if (
            code === 38
        ) {
            target =
                index - columns
        } else if (
            code === 40
        ) {
            target =
                index + columns
        } else {
            return
        }

        if (
            target >= 0 &&
            target < cards.length
        ) {

            cards[target].focus();

            cancel(
                event
            )

        }

    }

    function bind() {

        var links =
            document.getElementsByTagName(
                'a'
            );

        var i;

        for (
            i = 0;
            i < links.length;
            i++
        ) {

            if (
                links[i].getAttribute(
                    'data-page'
                )
            ) {

                (function (link) {

                    on(
                        link,
                        'click',
                        function () {

                            navigate(
                                link.getAttribute(
                                    'data-page'
                                )
                            );

                            return false

                        }
                    );

                })(links[i])

            }

        }

        on(
            $('searchForm'),
            'submit',
            function (event) {

                cancel(event);

                search(
                    $('searchInput').value
                );

                return false

            }
        );

        on(
            $('directHomeForm'),
            'submit',
            function (event) {

                cancel(event);

                var text =
                    trim(
                        $('directHomeInput').value
                    );

                var id =
                    getVideoId(
                        text
                    );

                if (!id) {

                    setStatus(
                        'homeStatus',
                        'Введите ссылку YouTube или ID из 11 символов.'
                    );

                    return false
                }

                openVideo(
                    {
                        id: id,
                        title:
                            'Загрузка видео...',
                        thumb:
                            thumbUrl(id)
                    },
                    false
                );

                return false

            }
        );

        on(
            $('directForm'),
            'submit',
            function (event) {

                cancel(event);

                directOpen();

                return false

            }
        );

        on(
            $('refreshHome'),
            'click',
            loadHome
        );

        on(
            $('refreshShorts'),
            'click',
            loadShorts
        );

        on(
            $('favoriteButton'),
            'click',
            toggleFavorite
        );

        on(
            $('qualitySelect'),
            'change',
            function () {

                var index =
                    parseInt(
                        this.value,
                        10
                    );

                if (
                    !isNaN(index)
                ) {

                    setStream(
                        index,
                        true
                    )

                }

            }
        );

        on(
            $('youtubeButton'),
            'click',
            function () {

                if (
                    state.current
                ) {

                    window.open(
                        youtubeUrl(
                            state.current.id
                        ),
                        '_blank'
                    )

                }

            }
        );

        on(
            $('backButton'),
            'click',
            function () {

                navigate(
                    state.pageBeforePlayer ||
                    'search'
                )

            }
        );

        on(
            $('clearHistory'),
            'click',
            function () {

                state.history = [];

                saveData();

                renderLocal(
                    'history'
                )

            }
        );

        on(
            $('clearFavorites'),
            'click',
            function () {

                state.favorites = [];

                saveData();

                renderLocal(
                    'favorites'
                )

            }
        );

        on(
            $('themeButton'),
            'click',
            function () {

                state.settings.theme =
                    state.settings.theme ===
                        'dark' ?
                        'light' :
                        'dark';

                saveSettings();

                applyPreferences()

            }
        );

        on(
            $('tvButton'),
            'click',
            function () {

                state.settings.tv =
                    !state.settings.tv;

                saveSettings();

                applyPreferences()

            }
        );

        on(
            $('liteMode'),
            'change',
            function () {

                state.settings.lite =
                    this.value;

                saveSettings();

                applyPreferences()

            }
        );

        on(
            $('serverMode'),
            'change',
            function () {

                state.settings.serverMode =
                    this.value;

                state.currentServer =
                    '';

                saveSettings();

                applyPreferences()

            }
        );

        on(
            $('changeServer'),
            'click',
            function () {

                rotateServer()

            }
        );

        on(
            $('videoPlayer'),
            'waiting',
            function () {

                setPlayerMessage(
                    'Буферизация...',
                    true
                )

            }
        );

        on(
            $('videoPlayer'),
            'playing',
            function () {

                setPlayerMessage(
                    '',
                    false
                )

            }
        );

        on(
            $('videoPlayer'),
            'error',
            function () {

                setPlayerMessage(
                    'Ошибка воспроизведения',
                    true
                );

                setStatus(
                    'playerInfo',
                    'Поток несовместим с браузером или сервером.'
                )

            }
        );

        on(
            window,
            'hashchange',
            function () {

                handleHash();

                if (
                    state.page ===
                    'home' &&
                    $('homeGrid').innerHTML ===
                    ''
                ) {

                    loadHome()

                }

                if (
                    state.page ===
                    'shorts' &&
                    $('shortsGrid').innerHTML ===
                    ''
                ) {

                    loadShorts()

                }

            }
        );

    }

    function init() {

        loadSettings();

        if (
            detectTV()
        ) {

            state.settings.tv = true;

            if (
                state.settings.lite ===
                'auto'
            ) {

                state.settings.lite =
                    'on'

            }

        }

        bind();

        applyPreferences();

        handleHash();

        if (
            state.page ===
            'home'
        ) {

            loadHome()

        }

        if (
            state.page ===
            'shorts'
        ) {

            loadShorts()

        }

    }

    init();

})();
