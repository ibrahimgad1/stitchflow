const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  apiBaseUrl: ipcRenderer.sendSync("get-api-url"),
  savePdf: (defaultFileName) => ipcRenderer.invoke("print:save-pdf", defaultFileName)
});
