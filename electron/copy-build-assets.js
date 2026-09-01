const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const srcFrontend = path.join(rootDir, "frontend/dist");
const srcBackend = path.join(rootDir, "backend/dist");
const srcBackendPkg = path.join(rootDir, "backend/package.json");

const destFrontend = path.join(__dirname, "frontend/dist");
const destBackend = path.join(__dirname, "backend/dist");
const destBackendPkg = path.join(__dirname, "backend/package.json");

console.log("Cleaning previous build copies in electron folder...");
fs.rmSync(path.join(__dirname, "frontend"), { recursive: true, force: true });
fs.rmSync(path.join(__dirname, "backend"), { recursive: true, force: true });

console.log("Copying production assets recursively...");
fs.mkdirSync(destFrontend, { recursive: true });
fs.mkdirSync(destBackend, { recursive: true });

fs.cpSync(srcFrontend, destFrontend, { recursive: true });
fs.cpSync(srcBackend, destBackend, { recursive: true });
fs.copyFileSync(srcBackendPkg, destBackendPkg);

console.log("Production assets copied successfully!");
