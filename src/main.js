import { app, BrowserWindow, components, ipcMain, session } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { Client } from '@xhayper/discord-rpc';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = import.meta.dirname;
const inject = readFileSync(path.join(dir, 'script.js'), 'utf8').replace('__PVT_CSS__', () => JSON.stringify(readFileSync(path.join(dir, 'custom.css'), 'utf8')));

app.disableHardwareAcceleration();
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', process.env.PVT_CDP_PORT || '9222');
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|PrimeVideoTauri)\/\S+/g, '');

const START_TIME = Math.floor(Date.now() / 1000);
const makeActivity = () => ({ type: 3, startTimestamp: START_TIME });

const fitActivityText = (text) => {
  let fitted = text;
  if (fitted.length > 128) {
    fitted = '';
    for (const c of text) {
      if (fitted.length + c.length > 127) break;
      fitted += c;
    }
    fitted += '…';
  }
  return fitted.padEnd(2, '⠀');
};

const discord = new Client({ clientId: '739528267039768647' });
let activity = null;
let retry = null;

const sendActivity = () => {
  if (discord.isConnected) discord.user?.setActivity(activity || makeActivity()).catch(() => {});
};

const scheduleConnect = () => {
  retry ??= setTimeout(() => {
    retry = null;
    connectDiscord();
  }, 15000);
};

const connectDiscord = () => {
  discord.login().then(sendActivity).catch(scheduleConnect);
};

discord.on('disconnected', scheduleConnect);

ipcMain.handle('update_activity', (_, { details, status, image, start, end } = {}) => {
  if (details == null) {
    activity = null;
    return sendActivity();
  }
  details = fitActivityText(details);
  activity = { ...makeActivity(), details };
  if (status != null) activity.state = fitActivityText(status);
  if (image != null && Buffer.byteLength(image) <= 256) Object.assign(activity, { largeImageKey: image, largeImageText: details });
  if (start != null && end != null) Object.assign(activity, { startTimestamp: start, endTimestamp: end });
  sendActivity();
});

ipcMain.on('pvt-inject', (e) => {
  e.returnValue = inject;
});

ipcMain.handle('window', (e, command) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (command === 'minimize') win.minimize();
  if (command === 'toggleMaximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (command === 'close') win.close();
  if (command === 'isMaximized') return win.isMaximized();
});

const createWindow = () => {
  const win = new BrowserWindow({
    title: 'Prime Video Tauri',
    width: 1280,
    height: 800,
    minWidth: 990,
    minHeight: 600,
    frame: false,
    backgroundColor: '#2d2d2d',
    webPreferences: { preload: path.join(dir, 'preload.cjs') }
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  for (const event of ['maximize', 'unmaximize']) win.on(event, () => win.webContents.send('resized'));
  win.loadURL('https://www.amazon.co.jp/gp/video/storefront');
};

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  connectDiscord();
  const [, blocker] = await Promise.all([
    components.whenReady().catch(() => {}),
    ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).catch(() => null)
  ]);
  blocker?.enableBlockingInSession(session.defaultSession);
  createWindow();
});
