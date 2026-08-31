const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001/api";
const outputDir = path.join(__dirname, "..", "visual_test_output");

async function waitFor(webContents, expression, timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const result = await webContents.executeJavaScript(expression);
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for: ${expression}`);
}

async function capture(window, name) {
  const image = await window.webContents.capturePage();
  const filePath = path.join(outputDir, `${name}.png`);
  await fs.writeFile(filePath, image.toPNG());
  return filePath;
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true });

  const window = new BrowserWindow({
    width: 1366,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await window.loadURL(appUrl);
  await waitFor(window.webContents, "Boolean(document.querySelector('.login-card'))");

  const loginResult = await window.webContents.executeJavaScript(`
    fetch("${apiUrl}/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Admin_12345" })
    }).then((response) => response.json())
  `);

  if (!loginResult.token) {
    throw new Error("Could not log in with seeded admin account.");
  }

  await window.webContents.executeJavaScript(`
    localStorage.setItem("app.language", "ar");
    localStorage.setItem("auth.token", ${JSON.stringify(loginResult.token)});
    location.hash = "/";
    location.reload();
  `);

  await waitFor(window.webContents, "document.documentElement.dir === 'rtl'");
  await waitFor(window.webContents, "Boolean(document.querySelector('.app-shell'))");
  const dashboardScreenshot = await capture(window, "dashboard-ar");

  await window.webContents.executeJavaScript(`location.hash = "/stock-reports"`);
  await waitFor(window.webContents, "location.hash.includes('/stock-reports') && Boolean(document.querySelector('table'))");
  const stockScreenshot = await capture(window, "stock-reports-ar");

  const invoiceList = await window.webContents.executeJavaScript(`
    fetch("${apiUrl}/sales-invoices?page=1&pageSize=1", {
      headers: { Authorization: "Bearer " + localStorage.getItem("auth.token") }
    }).then((response) => response.json()).catch(() => ({ data: [] }))
  `);
  const firstInvoice = invoiceList.data?.[0];
  let printScreenshot = null;
  let pdfPath = null;

  if (firstInvoice?.id) {
    await window.webContents.executeJavaScript(`location.hash = "/sales-invoices/${firstInvoice.id}/print"`);
    await waitFor(window.webContents, "location.hash.includes('/print') && Boolean(document.querySelector('.invoice-sheet'))");
    printScreenshot = await capture(window, "sales-invoice-print-ar");

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4"
    });
    pdfPath = path.join(outputDir, `sales-invoice-${firstInvoice.invoiceNumber || firstInvoice.id}.pdf`);
    await fs.writeFile(pdfPath, pdf);
  }

  const result = {
    dir: await window.webContents.executeJavaScript("document.documentElement.dir"),
    lang: await window.webContents.executeJavaScript("document.documentElement.lang"),
    dashboardScreenshot,
    stockScreenshot,
    printScreenshot,
    pdfPath
  };

  console.log(JSON.stringify(result, null, 2));
  window.close();
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exitCode = 1;
  });
