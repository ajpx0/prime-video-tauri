(function () {
  if (window.top !== window.self) return;
  var c = __PVT_CSS__;
  function f() {
    if (document.getElementById('pvt-ext-css')) return true;
    var r = document.head || document.documentElement;
    if (!r) return false;
    var s = document.createElement('style');
    s.id = 'pvt-ext-css';
    s.textContent = c;
    r.appendChild(s);
    return true;
  }
  if (!f()) {
    var o = new MutationObserver(function () {
      if (f()) o.disconnect();
    });
    o.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', f, { once: true });
  }
})();

window.__pvtVersion = '2026-05-24-f1kranz6';

Object.defineProperty(window, 'chrome', {
    value: undefined,
    writable: false,
    configurable: false
});

(() => {
    const PRUNE = [
        'cuepointPlaylist',
        'vodPlaybackUrls.result.playbackUrls.cuepoints',
        'vodPlaylistedPlaybackUrls.result.playbackUrls.pauseBehavior',
        'vodPlaylistedPlaybackUrls.result.playbackUrls.pauseAdsResolution',
        'vodPlaylistedPlaybackUrls.result.playbackUrls.intraTitlePlaylist.[-].shouldShowOnScrubBar',
        'ads'
    ].map((p) => p.split('.'));
    const del = (obj, [key, ...rest]) => {
        if (!obj || typeof obj !== 'object') return;
        if (key === '[-]') {
            if (Array.isArray(obj)) obj.forEach((item) => del(item, rest));
        } else if (rest.length) {
            del(obj[key], rest);
        } else {
            delete obj[key];
        }
    };
    const prune = (obj) => {
        try { PRUNE.forEach((path) => del(obj, path)); } catch (_) {}
        return obj;
    };
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        const url = String((args[0] && args[0].url) || args[0] || '');
        const ads = url.includes('/cdp/getVideoAds');
        if (!ads && !url.includes('PlaybackResources?')) return res;
        try {
            const obj = await res.clone().json();
            if (ads && Array.isArray(obj.playlist)) obj.playlist = [];
            const urls = obj.vodPlaylistedPlaybackUrls && obj.vodPlaylistedPlaybackUrls.result && obj.vodPlaylistedPlaybackUrls.result.playbackUrls;
            if (urls && Array.isArray(urls.intraTitlePlaylist)) urls.intraTitlePlaylist = urls.intraTitlePlaylist.filter((item) => item.type === 'Main');
            prune(obj);
            const headers = new Headers(res.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            const out = new Response(JSON.stringify(obj), { status: res.status, statusText: res.statusText, headers });
            ['url', 'redirected', 'type'].forEach((key) => Object.defineProperty(out, key, { value: res[key] }));
            return out;
        } catch (_) {
            return res;
        }
    };
})();

(() => {
    if (window.top !== window.self) return;
    const isNavExpectedPath = () => {
        const p = location.pathname;
        return p.startsWith('/gp/video') || p === '/';
    };
    const apply = () => {
        const root = document.documentElement;
        if (!root) return false;
        if (isNavExpectedPath()) root.classList.add('pvt-has-nav');
        try { root.classList.toggle('pvt-win-controls', localStorage.getItem('pvt-mac-controls') !== 'on'); } catch (_) {}
        return true;
    };
    if (!apply()) {
        const observer = new MutationObserver(() => {
            if (apply()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
    }
})();

(() => {
  if (window.top !== window.self) return;
  const ICONS = {
    back: '',
    minimize: '',
    maximize: '',
    restore: '',
    close: ''
  };

  const buildControls = () => {
    const container = document.createElement('div');
    container.id = 'pvt-window-controls';
    container.innerHTML = [
      '<button type="button" class="pvt-wc-btn pvt-wc-close" aria-label="閉じる" title="閉じる">' + ICONS.close + '</button>',
      '<button type="button" class="pvt-wc-btn pvt-wc-min" aria-label="最小化" title="最小化">' + ICONS.minimize + '</button>',
      '<button type="button" class="pvt-wc-btn pvt-wc-max" aria-label="最大化" title="最大化">' + ICONS.maximize + '</button>'
    ].join('');
    return container;
  };

  const buildBackButton = () => {
    const container = document.createElement('div');
    container.id = 'pvt-back-button';
    container.innerHTML = '<button type="button" class="pvt-bb-btn" aria-label="戻る" title="戻る">' + ICONS.back + '</button>';
    return container;
  };

  const buildTitleBar = () => {
    const bar = document.createElement('div');
    bar.id = 'pvt-titlebar-bg';
    return bar;
  };

  const buildPlayerDragBar = (id) => {
    const bar = document.createElement('div');
    bar.id = id;
    return bar;
  };

  const isNavExpectedPath = () => {
    const p = location.pathname;
    return p.startsWith('/gp/video') || p === '/';
  };

  const findVisiblePlayer = () => {
    const players = document.querySelectorAll('.atvwebplayersdk-player-container');
    for (const player of players) {
      const rect = player.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return player;
    }
    return null;
  };

  const findPlayerTopbar = (player) => {
    if (!player) return null;
    const title = player.querySelector('.atvwebplayersdk-title-text') || player.querySelector('.atvwebplayersdk-episode-info') || player.querySelector('#atvwebplayersdk-close-player-button');
    const settings = player.querySelector('#atvwebplayersdk-settings-button');
    if (!title || !settings) return null;
    let node = title.parentElement;
    while (node && node !== player && !node.contains(settings)) node = node.parentElement;
    return node && node !== player ? node : null;
  };

  const updatePlayerTopbar = (player) => {
    const topbar = findPlayerTopbar(player);
    document.querySelectorAll('.pvt-player-topbar').forEach((node) => {
      if (node !== topbar) node.classList.remove('pvt-player-topbar');
    });
    if (topbar) topbar.classList.add('pvt-player-topbar');
  };

  const SETTING_DEFAULTS = { 'pvt-rich-presence': true, 'pvt-mac-controls': false };

  const isSettingOn = (key) => {
    try {
      const value = localStorage.getItem(key);
      return value ? value === 'on' : SETTING_DEFAULTS[key];
    } catch (_) { return SETTING_DEFAULTS[key]; }
  };

  const updateTitleBarVisibility = () => {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle('pvt-win-controls', !isSettingOn('pvt-mac-controls'));
    const pvNav = document.querySelector('nav[data-testid="pv-navigation-bar"]');
    const hasNav = !!pvNav || isNavExpectedPath();
    root.classList.toggle('pvt-has-nav', hasNav);
    const player = findVisiblePlayer();
    root.classList.toggle('pvt-in-player', !!player);
    updatePlayerTopbar(player);
  };

  let appWindow = null;
  let unlistenResize = null;

  const getAppWindow = () => {
    if (appWindow) return appWindow;
    const w = window.__TAURI__ && window.__TAURI__.window;
    if (!w) return null;
    appWindow = w.getCurrentWindow();
    return appWindow;
  };

  const mount = async () => {
    const root = document.body || document.documentElement;
    if (!root) return;

    if (!document.getElementById('pvt-titlebar-bg')) {
      root.appendChild(buildTitleBar());
    }
    if (!document.getElementById('pvt-player-dragbar')) {
      root.appendChild(buildPlayerDragBar('pvt-player-dragbar'));
    }
    updateTitleBarVisibility();

    if (!document.getElementById('pvt-back-button')) {
      const backContainer = buildBackButton();
      root.appendChild(backContainer);
      const backBtn = backContainer.querySelector('.pvt-bb-btn');
      backBtn.addEventListener('click', () => {
        try { window.history.back(); } catch (_) {}
      });
    }

    if (document.getElementById('pvt-window-controls')) return;
    const container = buildControls();
    root.appendChild(container);

    const win = getAppWindow();
    if (!win) return;

    const minBtn = container.querySelector('.pvt-wc-min');
    const maxBtn = container.querySelector('.pvt-wc-max');
    const closeBtn = container.querySelector('.pvt-wc-close');

    const updateMaxIcon = async () => {
      try {
        const maxed = await win.isMaximized();
        maxBtn.innerHTML = maxed ? ICONS.restore : ICONS.maximize;
        const label = maxed ? '元に戻す' : '最大化';
        maxBtn.setAttribute('aria-label', label);
        maxBtn.title = label;
      } catch (_) {}
    };

    minBtn.addEventListener('click', () => {
      win.minimize().catch(() => {});
    });
    maxBtn.addEventListener('click', async () => {
      try { await win.toggleMaximize(); } catch (_) {}
      updateMaxIcon();
    });
    closeBtn.addEventListener('click', () => {
      win.close().catch(() => {});
    });

    updateMaxIcon();
    try {
      if (typeof unlistenResize === 'function') unlistenResize();
      unlistenResize = await win.onResized(() => updateMaxIcon());
    } catch (_) {}
  };

  const ensureMounted = () => {
    if (document.getElementById('pvt-window-controls') && document.getElementById('pvt-back-button')) return;
    mount();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMounted, { once: true });
  } else {
    ensureMounted();
  }

  const startObserving = () => {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      if (!document.getElementById('pvt-window-controls') || !document.getElementById('pvt-back-button')) ensureMounted();
    });
    observer.observe(document.body, { childList: true });
  };
  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true });
  }

  const SIGNIN_URL = 'https://www.amazon.co.jp/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.co.jp%2Fgp%2Fvideo%2Fstorefront%3Fref_%3Dnav_signin&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=jpflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0';
  const SIGNOUT_URL = 'https://www.amazon.co.jp/gp/flex/sign-out.html?path=%2Fgp%2Fvideo%2Fstorefront&useRedirectOnSuccess=1&signIn=1&action=sign-out&ref_=nav_AccountFlyout_signout';

  const isLoggedIn = () => document.cookie.split(';').some((c) => /^\s*x-acbjp\s*=/.test(c));

  const ensureLoginItem = (container) => {
    if (!container || container.querySelector('[data-pvt-login]')) return;
    const list = container.querySelector('ul');
    if (!list) return;
    const sample = list.querySelector('li');
    if (!sample) return;
    const newItem = sample.cloneNode(true);
    const link = newItem.querySelector('a');
    if (!link) return;
    const loggedIn = isLoggedIn();
    const label = loggedIn ? 'ログアウト' : 'ログイン';
    const url = loggedIn ? SIGNOUT_URL : SIGNIN_URL;
    link.setAttribute('data-pvt-login', 'true');
    link.setAttribute('aria-label', label);
    link.setAttribute('href', url);
    link.removeAttribute('data-testid');
    const labelSpan = link.querySelector('span');
    if (labelSpan) labelSpan.textContent = label;
    list.prepend(newItem);
  };

  const ensureToggleItem = (container, key, label) => {
    if (!container || container.querySelector(`[data-pvt-toggle="${key}"]`)) return;
    const list = container.querySelector('ul');
    if (!list) return;
    const sample = list.querySelector('li');
    if (!sample) return;
    const newItem = sample.cloneNode(true);
    const link = newItem.querySelector('a');
    if (!link) return;
    link.setAttribute('data-pvt-toggle', key);
    link.setAttribute('role', 'checkbox');
    link.setAttribute('aria-label', label);
    link.setAttribute('aria-checked', String(isSettingOn(key)));
    link.removeAttribute('href');
    link.removeAttribute('data-testid');
    link.removeAttribute('data-pvt-login');
    const labelSpan = link.querySelector('span');
    if (labelSpan) labelSpan.textContent = label;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      try { localStorage.setItem(key, isSettingOn(key) ? 'off' : 'on'); } catch (_) {}
      document.querySelectorAll(`[data-pvt-toggle="${key}"]`).forEach((node) => node.setAttribute('aria-checked', String(isSettingOn(key))));
      window.dispatchEvent(new Event(key));
    });
    list.appendChild(newItem);
  };

  const scanAccountDropdowns = () => {
    document.querySelectorAll('[data-testid="pv-nav-account-and-profiles-dropdown-section-container"]').forEach((container) => {
      ensureLoginItem(container);
      ensureToggleItem(container, 'pvt-rich-presence', 'Rich Presence');
      ensureToggleItem(container, 'pvt-mac-controls', 'macOS風コントロール');
    });
  };

  window.addEventListener('pvt-mac-controls', updateTitleBarVisibility);

  const startDropdownObserver = () => {
    const root = document.body || document.documentElement;
    if (!root) return;
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        scanAccountDropdowns();
        updateTitleBarVisibility();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    scanAccountDropdowns();
    updateTitleBarVisibility();
  };
  if (document.body) {
    startDropdownObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startDropdownObserver, { once: true });
  }
})();

(() => {
  if (window.top !== window.self) return;
  let meta = null;
  let last = null;

  const findVideo = () => [...document.querySelectorAll('[id^="dv-web-player"] video')].find((v) => (v.currentSrc || '').startsWith('blob:') && v.getBoundingClientRect().width > 0);

  const report = () => {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (!core) return;
    const root = document.documentElement;
    const video = findVideo();
    const args = {};
    let enabled = true;
    try { enabled = localStorage.getItem('pvt-rich-presence') !== 'off'; } catch (_) {}
    if (enabled && root && root.classList.contains('pvt-in-player') && meta && video) {
      const c = meta.catalog;
      const isEpisode = !!c.seriesTitle;
      args.details = isEpisode ? c.seriesTitle : c.title;
      args.status = isEpisode ? c.title : null;
      args.image = (meta.images && (meta.images.boxartImage || meta.images.coverImage)) || null;
      if (!video.paused && isFinite(video.duration)) {
        const now = Date.now() / 1000;
        args.start = Math.round(now - video.currentTime);
        args.end = Math.round(now + video.duration - video.currentTime);
      }
    }
    const key = JSON.stringify(args);
    if (key === last) return;
    last = key;
    core.invoke('update_activity', args).catch(() => {});
  };

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = originalFetch.apply(this, args);
    const url = String((args[0] && args[0].url) || args[0] || '');
    if (url.includes('playerChromeResources')) {
      promise.then((res) => res.clone().json()).then((json) => {
        const m = json && json.resources && json.resources.catalogMetadataV2;
        if (m && m.catalog) {
          meta = m;
          report();
        }
      }).catch(() => {});
    }
    return promise;
  };

  ['play', 'pause', 'seeked', 'ended', 'durationchange'].forEach((type) => document.addEventListener(type, report, true));
  window.addEventListener('pvt-rich-presence', report);

  const watchRoot = () => {
    new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    report();
  };
  if (document.documentElement) {
    watchRoot();
  } else {
    document.addEventListener('DOMContentLoaded', watchRoot, { once: true });
  }
})();
