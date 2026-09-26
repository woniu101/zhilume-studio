const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("zhilumeDesktop", {
  readSession: () => ipcRenderer.invoke("session:read"),
  writeSession: (value) => ipcRenderer.invoke("session:write", value),
  media: {
    begin: () => ipcRenderer.invoke("media:begin"),
    append: (id, bytes) => ipcRenderer.invoke("media:append", id, bytes),
    run: (id, operation, params) => ipcRenderer.invoke("media:run", id, operation, params),
    read: (id, offset) => ipcRenderer.invoke("media:read", id, offset),
    dispose: id => ipcRenderer.invoke("media:dispose", id),
    onProgress: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("media:progress", listener);
      return () => ipcRenderer.removeListener("media:progress", listener);
    },
  },
});
