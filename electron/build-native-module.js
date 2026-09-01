const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const tempBuildDir = 'C:\\better_sqlite_build';
const srcModule = path.join(__dirname, 'node_modules/better-sqlite3');
const destModule = tempBuildDir;

try {
  console.log("Cleaning temp build folder...");
  fs.rmSync(tempBuildDir, { recursive: true, force: true });
  fs.mkdirSync(tempBuildDir, { recursive: true });

  console.log("Copying better-sqlite3 files to temp folder...");
  fs.cpSync(srcModule, destModule, { recursive: true });
} catch (copyErr) {
  console.error("Setup/Copy failed:", copyErr.message, copyErr.stack);
  process.exit(1);
}

console.log("Running rebuild in temp folder...");
const pythonPath = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\VC\\SecurityIssueAnalysis\\python\\python.exe';
try {
  // Execute rebuild directly in the temp module folder
  cp.execSync('npx @electron/rebuild -v 33.2.1 --force --build-from-source', {
    cwd: tempBuildDir,
    env: { ...process.env, PYTHON: pythonPath },
    stdio: 'inherit'
  });
  console.log("Rebuild inside temp folder finished successfully!");
} catch (err) {
  console.error("Rebuild failed inside temp folder:", err.message);
  process.exit(1);
}

// Locate compiled binary in temp folder and copy back
const tempBinary = path.join(tempBuildDir, 'build/Release/better_sqlite3.node');
if (fs.existsSync(tempBinary)) {
  const destDir = path.join(srcModule, 'build/Release');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(tempBinary, path.join(destDir, 'better_sqlite3.node'));
  
  // Overwrite win32-x64.node prebuilt fallback too
  const prebuiltDir = path.join(srcModule, 'prebuilds');
  fs.mkdirSync(prebuiltDir, { recursive: true });
  fs.copyFileSync(tempBinary, path.join(prebuiltDir, 'win32-x64.node'));
  
  console.log("Native binaries copied back successfully!");
  
  // Cleanup temp build directory
  try {
    fs.rmSync(tempBuildDir, { recursive: true, force: true });
    console.log("Temp build directory cleaned up.");
  } catch (cleanErr) {
    console.warn("Failed to cleanup temp build directory:", cleanErr.message);
  }
} else {
  console.error("Compiled binary not found in temp folder!");
  process.exit(1);
}
