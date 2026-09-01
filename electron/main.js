const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const fsNode = require("node:fs");

// Redirect console logs to a persistent file in AppData
try {
  const logDir = app.getPath("userData");
  fsNode.mkdirSync(logDir, { recursive: true });
  const logStream = fsNode.createWriteStream(path.join(logDir, "app-main.log"), { flags: "a" });
  
  console.log = (...args) => {
    logStream.write(`[INFO] ${new Date().toISOString()} - ${args.join(" ")}\n`);
  };
  console.error = (...args) => {
    logStream.write(`[ERROR] ${new Date().toISOString()} - ${args.join(" ")}\n`);
  };
  
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err.message, err.stack);
  });
  
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });

  console.log("=== Electron Main Process Started ===");
  try {
    console.log("Directly requiring better-sqlite3 for verification...");
    const Database = require("better-sqlite3");
    console.log("better-sqlite3 required successfully inside main.js!");
    
    console.log("Directly instantiating Database inside AppData...");
    const testDbPath = path.join(app.getPath("userData"), "test.db");
    const testDb = new Database(testDbPath);
    testDb.pragma("journal_mode = WAL");
    console.log("Database instantiated and WAL set successfully!");
    testDb.close();

    console.log("Directly importing better-sqlite3 as ESM for verification...");
    (async () => {
      try {
        const dbModule = await import("better-sqlite3");
        console.log("better-sqlite3 imported as ESM successfully!");
      } catch (esmErr) {
        console.error("Direct better-sqlite3 ESM import failed:", esmErr.message, esmErr.stack);
      }
    })();
  } catch (dbErr) {
    console.error("Direct better-sqlite3 require failed:", dbErr.message, dbErr.stack);
  }
} catch (err) {
  // Silent fallback
}

let apiBaseUrl = "http://127.0.0.1:3001/api";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

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

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
    window.loadURL(devUrl);
  }
}

ipcMain.on("get-api-url", (event) => {
  event.returnValue = apiBaseUrl;
});

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

app.whenReady().then(async () => {
  console.log("app.whenReady triggered!");
  try {
    const port = await findFreePort();
    console.log(`Port found: ${port}`);
    const isPackaged = app.isPackaged;
    const dbPath = isPackaged
      ? path.join(app.getPath("userData"), "app.db")
      : path.resolve(path.join(__dirname, "../backend/data/app.dev.db"));
    console.log(`Resolved database path: ${dbPath}`);

    // Ensure database folder exists
    const fsNode = require("node:fs");
    fsNode.mkdirSync(path.dirname(dbPath), { recursive: true });
    console.log("Database folder verified/created.");

    process.env.PORT = String(port);
    process.env.DATABASE_PATH = dbPath;
    process.env.NODE_ENV = isPackaged ? "production" : "development";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "clothing-factory-desktop-secure-secret-token";

    apiBaseUrl = `http://127.0.0.1:${port}/api`;

    // Load backend Express server
    const backendServerPath = isPackaged
      ? path.join(__dirname, "backend/dist/server.js")
      : path.join(__dirname, "../backend/dist/server.js");
    console.log(`Importing backend from path: ${backendServerPath}`);
    const { pathToFileURL } = require("node:url");
    
    if (isPackaged) {
      console.log("Importing backend config/env.js...");
      await import(pathToFileURL(path.join(__dirname, "backend/dist/config/env.js")).href);
      console.log("backend config/env.js imported successfully!");

      console.log("Importing backend database/connection.js...");
      await import(pathToFileURL(path.join(__dirname, "backend/dist/database/connection.js")).href);
      console.log("backend database/connection.js imported successfully!");

      console.log("Importing backend database/migrate.js...");
      await import(pathToFileURL(path.join(__dirname, "backend/dist/database/migrate.js")).href);
      console.log("backend database/migrate.js imported successfully!");

      console.log("Importing backend services/backup.js...");
      await import(pathToFileURL(path.join(__dirname, "backend/dist/services/backup.js")).href);
      console.log("backend services/backup.js imported successfully!");

      console.log("Importing backend app.js...");
      await import(pathToFileURL(path.join(__dirname, "backend/dist/app.js")).href);
      console.log("backend app.js imported successfully!");
    }

    await import(pathToFileURL(backendServerPath).href);
    console.log("Backend server imported successfully!");
  } catch (err) {
    console.error("Failed to initialize backend server:", err);
  }

  console.log("Creating window...");
  createWindow();
});

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
