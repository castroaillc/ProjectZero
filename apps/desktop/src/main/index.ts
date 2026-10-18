import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import { join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { clearToken, readToken, writeToken } from "./token-store";

// Packaged builds serve the renderer from app://projectzero rather than file://, so requests
// carry a real Origin (file:// sends "null", which Better Auth rejects as a CSRF risk).
const APP_ORIGIN = "app://projectzero";
const API_ORIGIN = new URL(__API_URL__).origin;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Lets e2e tests run against an isolated profile (session token, storage).
if (process.env.PROJECTZERO_USER_DATA_DIR)
  app.setPath("userData", process.env.PROJECTZERO_USER_DATA_DIR);

// In development electron-vite serves the renderer and sets this.
const devServerUrl = process.env.ELECTRON_RENDERER_URL;

function serveRenderer() {
  const root = join(import.meta.dirname, "../renderer");
  const csp = [
    "default-src 'self'",
    `connect-src 'self' ${API_ORIGIN}`,
    "img-src 'self' data:",
    "style-src 'self'",
  ].join("; ");

  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const file = normalize(join(root, pathname === "/" ? "index.html" : pathname));
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith(".html")) headers.set("content-security-policy", csp);
    return new Response(res.body, { status: res.status, headers });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 480,
    minHeight: 480,
    show: false,
    title: "ProjectZero",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(devServerUrl ?? `${APP_ORIGIN}/`);
}

ipcMain.handle("auth:get-token", () => readToken());
ipcMain.handle("auth:set-token", (_event, token: unknown) => {
  if (typeof token === "string" && token) writeToken(token);
});
ipcMain.handle("auth:clear-token", () => clearToken());

void app.whenReady().then(() => {
  if (!devServerUrl) serveRenderer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
