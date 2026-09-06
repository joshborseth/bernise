const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

contextBridge.exposeInMainWorld("berniseDesktop", {
  getLaunchState: () => ipcRenderer.invoke("bernise:get-launch-state"),
  browseProject: () => ipcRenderer.invoke("bernise:browse-project"),
  openProject: (path: string) => ipcRenderer.invoke("bernise:open-project", path),
});
