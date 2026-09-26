const {
  app,
  BrowserWindow,
  protocol,
  net,
  shell,
  ipcMain,
  safeStorage,
  dialog,
} = require("electron");
const { join, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} = require("node:fs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
if (process.env.ZHILUME_USER_DATA)
  app.setPath("userData", resolve(process.env.ZHILUME_USER_DATA));
if (!app.requestSingleInstanceLock()) app.quit();
let window;
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
app.whenReady().then(() => {
  const executable = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
  const disposeMedia = require('./media.cjs').installMedia(ipcMain, executable);
  app.on('before-quit', () => { void disposeMedia(); });
  app.setAppUserModelId("app.zhilume.studio");
  const root = resolve(__dirname, "../dist");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.host !== "zhilume-studio")
      return new Response("Not found", { status: 404 });
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + sep))
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(path).href);
  });
  const credentials = join(app.getPath("userData"), "session.encrypted");
  ipcMain.handle("session:read", () => {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(credentials))
      return null;
    try {
      return JSON.parse(safeStorage.decryptString(readFileSync(credentials)));
    } catch {
      return null;
    }
  });
  ipcMain.handle("session:write", (_event, value) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (!value) {
      if (existsSync(credentials)) unlinkSync(credentials);
      return true;
    }
    if (
      typeof value.base !== "string" ||
      typeof value.token !== "string" ||
      value.token.length > 2000
    )
      throw new Error("Invalid session");
    writeFileSync(
      credentials,
      safeStorage.encryptString(JSON.stringify(value)),
    );
    return true;
  });
  window = new BrowserWindow({
    icon: join(__dirname, "../assets/icon.ico"),
    width: 1440,
    height: 960,
    minWidth: 850,
    minHeight: 620,
    backgroundColor: "#141414",
    title: "Zhilume Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://zhilume-studio/")) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    // Normally the renderer persists a local draft and allows closing. Only an
    // active upload or failed local persistence reaches this explicit choice.
    const answer = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["继续编辑", "仍然关闭"],
      defaultId: 0,
      cancelId: 0,
      title: "关闭 Studio",
      message: "当前仍有上传，或草稿未能写入本机。",
      detail:
        "关闭会中断上传；尚未保存的修改可能丢失。可返回画布导出草稿后再关闭。",
    });
    if (answer === 1) event.preventDefault();
  });
  window.loadURL("app://zhilume-studio/");
});
app.on("window-all-closed", () => app.quit());
