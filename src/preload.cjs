const { contextBridge, ipcRenderer, webFrame } = require('electron');

const appWindow = {
  minimize: () => ipcRenderer.invoke('window', 'minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window', 'toggleMaximize'),
  close: () => ipcRenderer.invoke('window', 'close'),
  isMaximized: () => ipcRenderer.invoke('window', 'isMaximized'),
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
