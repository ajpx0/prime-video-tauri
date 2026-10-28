const { contextBridge, ipcRenderer, webFrame } = require('electron');

const call = (command) => () => ipcRenderer.invoke('window', command);

const appWindow = {
  minimize: call('minimize'),
  toggleMaximize: call('toggleMaximize'),
  close: call('close'),
  isMaximized: call('isMaximized'),
  onResized: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('resized', listener);
    return Promise.resolve(() => ipcRenderer.removeListener('resized', listener));
  }
};

contextBridge.exposeInMainWorld('__TAURI__', {
  window: { getCurrentWindow: () => appWindow },
  core: { invoke: (command, args) => ipcRenderer.invoke(command, args) }
});

webFrame.executeJavaScript(ipcRenderer.sendSync('pvt-inject'));
