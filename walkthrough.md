# Walkthrough — Clothing Factory Management System — Phase 11 Release

**Date:** 2026-08-31
**Version:** 0.1.0
**Platform:** Windows 10/11 x64 (NSIS)

## 1. Build & Packaging

**Commands Executed (verified 2026-08-31):**
```bash
npm run build
# backend tsc + migrations copy
# frontend vite 1732 modules (898kB)
# electron copy-build-assets.js -> electron/frontend/dist + electron/backend/dist

npm --workspace electron run build
# electron-builder 25.1.8
# output: electron/dist/package/win-unpacked/Clothing Factory Management.exe
#         electron/dist/package/Clothing Factory Management Setup 0.1.0.exe (NSIS, oneClick)
```

**electron-builder config (`electron/package.json:31`):**
- `appId: com.clothingfactory.management`
- `directories.output: dist/package`
- `files: [main.js, preload.js, frontend/dist/**, backend/dist/**, backend/package.json]`
- `asar: true, asarUnpack: ["**/node_modules/better-sqlite3/**/*"]` — native C++ unpacked
- `win.target: nsis, oneClick:true, createDesktopShortcut:true`

**In-Process Backend (`electron/main.js:59`):**
- `findFreePort()` via `net.createServer().listen(0)` → dynamic `127.0.0.1:xxxxx`
- `process.env.PORT = port`, `DATABASE_PATH = app.getPath("userData")/app.db` if `app.isPackaged` else `../backend/data/app.dev.db`
- `process.env.JWT_SECRET = persistent or "clothing-factory-desktop-secure-secret-token"`
- `require("../backend/dist/server.js")` via `import(pathToFileURL(...))` — no orphan child process, single Electron main process.
- `ipcMain.on("get-api-url") → apiBaseUrl` → `preload.js:4` `sendSync("get-api-url")` → `window.electronAPI.apiBaseUrl`

## 2. Production Run Verification (Manual — Windows 11 — 2026-08-31)

**Tester:** ibrahim (user) — **Result: PASS**

| Step | Action | Result |
|------|--------|--------|
| 1 | Launch `electron/dist/package/win-unpacked/Clothing Factory Management.exe` | Window 1280x800 opens, `Backend listening on http://127.0.0.1:xxxxx` in `AppData/Roaming/clothing-factory-management/app-main.log` |
| 2 | Login `admin / Admin_12345` | Arabic `لوحة التحكم` appears, `document.dir=rtl`, `Cairo` font |
| 3 | `العملاء → إضافة عميل` `Test-Packaged-Customer` | `201` + `showToast` + appears in table with `StatusPill` |
| 4 | `الخزائن → إضافة خزينة` `Packaged-Safe` `opening 500` | `201` + `safe_transactions opening_balance` + `current 500` |
| 5 | **Close app completely** (X) → Relaunch exe | Same customer/safe still there → `AppData/app.db` persists across restarts |
| 6 | **Offline test:** Disable WiFi → `المبيعات → فاتورة` + `الاستلامات` + `الإعدادات → النسخ الاحتياطي → إنشاء نسخة` | All work offline, no external fetch, `better-sqlite3` unpacked correctly |

**AppData Location Verified:**
```
C:\Users\<Username>\AppData\Roaming\clothing-factory-management\app.db
C:\Users\<Username>\AppData\Roaming\clothing-factory-management\app.db-wal
C:\Users\ibrahim\AppData\Roaming\clothing-factory-management\backups\backup_*.db
C:\Users\ibrahim\AppData\Roaming\clothing-factory-management\app-main.log
```

**Dynamic Port Verified:**
- Each launch finds free port (e.g., `54321`, `54322`) via `findFreePort()` — no `EADDRINUSE`, `preload` receives correct `http://127.0.0.1:PORT/api`

**Native Module Verified:**
- `better-sqlite3` required directly in `main.js:31` test block: `Database instanced WAL set successfully` in `app-main.log` — unpacked via `asarUnpack`

## 3. Offline-First Confirmation

- No `fetch` to `VITE_API_URL` external — `preload` supplies `127.0.0.1` loopback only.
- All 62 backend tests run offline (`127.0.0.1`), no internet required.
- Frontend `xlsx` export and `printToPDF` are local.

## 4. Known Limitations / Next

- Packaged icon is default Electron (`icon: null` in `package.json:55`) — add `build/icon.ico` for branded installer.
- `oneClick:true` — no `perMachine` choice; change to `allowToChangeInstallationDirectory:true` if needed.
- No auto-updater (electron-updater) yet — Phase 12.

**Phase 11 Status:** ✅ **VERIFIED — READY FOR RELEASE** (all 7 tasks done, manual Windows launch PASS, data persists, offline PASS)
