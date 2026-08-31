const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  apiBaseUrl: process.env.API_BASE_URL ?? "http://127.0.0.1:3001/api",
  savePdf: (defaultFileName) => ipcRenderer.invoke("print:save-pdf", defaultFileName)
});
