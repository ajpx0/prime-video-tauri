(function () {
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

Object.defineProperty(window, 'EmbeddedBrowserWebView', {
    value: undefined,
    writable: false,
    configurable: false
});
Object.defineProperty(window, 'chrome', {
    value: undefined,
    writable: false,
    configurable: false
});

(() => {
    const isNavExpectedPath = () => {
        const p = location.pathname;
        return p.startsWith('/gp/video') || p === '/';
    };
    const apply = () => {
        const root = document.documentElement;
        if (!root) return false;
        if (isNavExpectedPath()) root.classList.add('pvt-has-nav');
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
      '<button type="button" class="pvt-wc-btn pvt-wc-min" aria-label="最小化" title="最小化">' + ICONS.minimize + '</button>',
      '<button type="button" class="pvt-wc-btn pvt-wc-max" aria-label="最大化" title="最大化">' + ICONS.maximize + '</button>',
      '<button type="button" class="pvt-wc-btn pvt-wc-close" aria-label="閉じる" title="閉じる">' + ICONS.close + '</button>'
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
    const title = player.querySelector('.atvwebplayersdk-title-text') || player.querySelector('.atvwebplayersdk-episode-info');
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

  const updateTitleBarVisibility = () => {
    const root = document.documentElement;
    if (!root) return;
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

  const scanAccountDropdowns = () => {
    document.querySelectorAll('[data-testid="pv-nav-account-and-profiles-dropdown-section-container"]').forEach(ensureLoginItem);
  };

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
