const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("zhilumeDesktop", {
  readSession: () => ipcRenderer.invoke("session:read"),
  writeSession: (value) => ipcRenderer.invoke("session:write", value),
  media: {
    rememberSource: (file, assetId, base) => {
      const path = webUtils.getPathForFile(file);
      return path ? ipcRenderer.invoke('media:remember', assetId, path, base) : Promise.resolve();
    },
    create: (assetId, operation, params) => ipcRenderer.invoke('media:create', assetId, operation, params),
    createSource: assetId => ipcRenderer.invoke('media:create-source', assetId),
    readImage: id => ipcRenderer.invoke('media:read-image', id),
    run: id => ipcRenderer.invoke('media:run', id),
    retrySync: id => ipcRenderer.invoke('media:retry-sync', id),
    cancel: id => ipcRenderer.invoke('media:cancel', id),
    dispose: id => ipcRenderer.invoke("media:dispose", id),
    onProgress: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("media:progress", listener);
      return () => ipcRenderer.removeListener("media:progress", listener);
    },
  },
});
