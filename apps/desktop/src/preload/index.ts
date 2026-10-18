import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "./api";

// The only privileged surface the renderer gets: read/write the encrypted session token.
const api: DesktopApi = {
  auth: {
    getToken: () => ipcRenderer.invoke("auth:get-token"),
    setToken: (token) => ipcRenderer.invoke("auth:set-token", token),
    clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  },
};

contextBridge.exposeInMainWorld("projectzero", api);
