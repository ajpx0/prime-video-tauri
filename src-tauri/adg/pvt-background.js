const pvtOpen = async (url) => {
  const href = new URL(url, chrome.runtime.getURL('/')).href;
  const tabs = await chrome.tabs.query({});
  const host = tabs.find((tab) => /^https?:/.test(tab.url || ''));
  if (!host) return;
  await chrome.scripting.executeScript({
    target: { tabId: host.id },
    world: 'MAIN',
    func: (target) => window.__TAURI__ && window.__TAURI__.core.invoke('open_extension_page', { url: target }),
    args: [href]
  });
};

const pvtFirstUrl = (url) => (Array.isArray(url) ? url[0] : url);

chrome.tabs.create = async (props) => {
  const url = props && pvtFirstUrl(props.url);
  if (url) await pvtOpen(url);
  return null;
};

chrome.windows.create = async (data) => {
  const url = data && pvtFirstUrl(data.url);
  if (url) await pvtOpen(url);
  return null;
};

const pvtTabsUpdate = chrome.tabs.update.bind(chrome.tabs);
chrome.tabs.update = async (...args) => {
  const [tabId, info] = typeof args[0] === 'number' ? args : [undefined, args[0]];
  if (info && info.active && tabId !== undefined) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && tab.url && tab.url.startsWith(chrome.runtime.getURL('/'))) await pvtOpen(tab.url);
  }
  return pvtTabsUpdate(...args);
};

chrome.runtime.openOptionsPage = async () => {
  await pvtOpen(chrome.runtime.getURL('pages/options.html'));
};

importScripts('pages/background.js');
