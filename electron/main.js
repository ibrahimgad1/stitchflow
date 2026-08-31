const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  window.loadURL(devUrl);
}

ipcMain.handle("print:save-pdf", async (event, defaultFileName) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const safeDefaultFileName =
    typeof defaultFileName === "string" && defaultFileName.trim()
      ? defaultFileName.replace(/[<>:"/\\|?*]+/g, "-")
      : "document.pdf";

  const result = await dialog.showSaveDialog(senderWindow ?? undefined, {
    title: "Save PDF",
    defaultPath: safeDefaultFileName.endsWith(".pdf")
      ? safeDefaultFileName
      : `${safeDefaultFileName}.pdf`,
    filters: [{ name: "PDF documents", extensions: ["pdf"] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const pdf = await event.sender.printToPDF({
    printBackground: true,
    pageSize: "A4"
  });
  await fs.writeFile(result.filePath, pdf);

  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
