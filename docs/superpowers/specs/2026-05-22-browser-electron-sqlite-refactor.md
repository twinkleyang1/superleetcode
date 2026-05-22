# Browser + Electron + SQLite Architecture Refactor

## Context

Current architecture runs React inside an Electron BrowserWindow with IndexedDB + JSON file dual storage. User wants:

1. **Browser-first UI** — open in Chrome, not Electron window
2. **Durable local storage** — data on disk, won't be lost by clearing browser cache
3. **Electron background services** — system tray, auto-launch, Windows notifications
4. **Browser controls Electron** — settings changes in browser propagate to Electron

## Architecture

```
Browser (Chrome)                    Electron (background)
┌─────────────────────┐    HTTP    ┌──────────────────────┐
│ React + Vite         │◄─────────►│ Express :3456         │
│ Dexie.js (IndexedDB) │           │ better-sqlite3        │
│ - Primary data store │           │ - Durable disk store  │
│ - Always available   │           │ - System tray         │
└─────────────────────┘           │ - Auto-launch         │
                                   │ - Notifications       │
                                   └──────────────────────┘
```

**Key principle**: Components do NOT change their data access pattern. They continue using `db.*` (Dexie/IndexedDB). A thin sync layer in App.tsx handles bidirectional sync with Electron when available.

## Data Flow

### Startup (Electron running)
1. Browser: `GET /api/data` → receive full SQLite dataset
2. Browser: `syncFromJSON(data)` → populate IndexedDB (existing function)
3. App renders normally with IndexedDB data

### Startup (no Electron)
1. Browser: API call fails silently
2. App uses existing IndexedDB data
3. All functionality works normally

### During use (Electron running)
1. User performs action → component writes to IndexedDB via `db.*`
2. After write: `exportToJSON()` → `POST /api/data` → SQLite updated
3. Auto-save: every 30s, `exportToJSON()` → `POST /api/data`

### During use (no Electron)
1. User performs action → component writes to IndexedDB
2. API call skipped (no Electron)
3. Data stays in IndexedDB until Electron next starts

### Conflict resolution
Last-write-wins. Single user, single device — conflicts won't happen in practice.

## API Routes

| Method | Path | Request | Response | Purpose |
|--------|------|---------|----------|---------|
| GET | /api/data | — | AppData (full) | Pull SQLite into IndexedDB |
| POST | /api/data | AppData (full) | { success: true } | Push IndexedDB into SQLite |
| GET | /api/settings | — | Settings | Read settings |
| PUT | /api/settings | Settings | { success: true } | Update settings + autoLaunch |
| POST | /api/quit | — | { success: true } | Quit Electron |

## File Changes

### New files
- `electron/server.ts` — Express server with all API routes + SQLite queries
- `src/api.ts` — fetch wrapper for talking to Electron API

### Modified files
| File | Changes |
|------|---------|
| `electron/main.ts` | Remove BrowserWindow creation. Start Express server on startup. Keep tray, auto-launch, notifications, reminder timer. Add `shell.openExternal` for opening browser. |
| `electron/store.ts` | Replace JSON fs read/write with SQLite (better-sqlite3). Same readData/writeData/readSettings/writeSettings interface. Add database initialization (CREATE TABLE). Call initializeData (seed) if problems table is empty. |
| `electron/preload.ts` | Remove most IPC handlers. Keep only `onNotificationReminder` listener for push notifications to renderer. |
| `src/App.tsx` | Replace `window.electronAPI.getData()` with `api.getData()`. Replace `window.electronAPI.saveData()` with `api.saveData()`. Keep IndexedDB initialization flow. Add silent failure when Electron unavailable. |
| `src/components/SettingsPanel.tsx` | Replace `window.electronAPI.saveSettings()` / `setAutoLaunch()` / `quitApp()` with `api.updateSettings()` / `api.quit()`. Keep `db.settings.put()` for local save. |
| `src/components/RatingModal.tsx` | Add `api.saveData(data)` call after IndexedDB write (silent fail if no Electron). |
| `src/components/AddProblemModal.tsx` | Same — add `api.saveData(data)` after write. |
| `src/components/ProblemList.tsx` | Same — add `api.saveData(data)` after level update. |
| `package.json` | Add `express`, `cors`, `better-sqlite3`. Update scripts. |

### Unchanged files
- `src/db.ts` — IndexedDB schema unchanged
- `src/types.ts` — types unchanged
- `src/seed.ts` — `initializeData()`, `syncFromJSON()`, `exportToJSON()` unchanged
- `src/spacedRepetition.ts` — pure function, unchanged
- `src/predictions.ts` — pure function, unchanged
- All components in `src/components/` (except SettingsPanel) — still use `db.*`
- All charts in `src/charts/` — pure components
- `data/hot100.ts` — static data
- `vite.config.ts` — unchanged

## SQLite Schema

Mirrors IndexedDB schema exactly:

```sql
CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  leetcodeNumber INTEGER,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  category TEXT NOT NULL,
  url TEXT,
  isCustom INTEGER DEFAULT 0
);

CREATE TABLE progress (
  id INTEGER PRIMARY KEY,
  problemId INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'not_started',
  lastReviewedAt TEXT,
  nextReviewAt TEXT,
  reviewCount INTEGER DEFAULT 0,
  todayReviewCount INTEGER DEFAULT 0,
  consecutiveMastered INTEGER DEFAULT 0
);

CREATE TABLE review_logs (
  id INTEGER PRIMARY KEY,
  problemId INTEGER NOT NULL,
  date TEXT NOT NULL,
  oldLevel TEXT NOT NULL,
  newLevel TEXT NOT NULL,
  reviewedAt TEXT NOT NULL
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  dailyTotal INTEGER DEFAULT 5,
  dailyNew INTEGER DEFAULT 2,
  autoLaunch INTEGER DEFAULT 1,
  reminderTime TEXT DEFAULT '09:00'
);
```

## syncFromJSON / exportToJSON Reuse

These existing functions in `src/seed.ts` bridge between AppData format and IndexedDB. The SQLite layer uses the same `AppData` interface, so these functions require zero changes:

- `syncFromJSON(appData)` — clears IndexedDB, bulk-adds from AppData
- `exportToJSON()` — reads all IndexedDB tables, returns AppData

Express API routes call the SQLite equivalents of these functions.

## npm Scripts

```json
{
  "dev": "vite --open",
  "start": "vite --open",
  "electron": "electron .",
  "build": "tsc && vite build",
  "prod": "tsc && vite build && electron ."
}
```

`npm start` runs Vite (opens browser) and the user starts Electron separately with `npm run electron`. Or use a combined script with `concurrently`.

## Verification

1. `npm start` → browser opens, app loads with seeded 100 problems
2. Rate a problem → data persists in IndexedDB after page refresh
3. `npm run electron` → Electron starts, tray icon appears, Express server on :3456
4. Rate a problem → `POST /api/data` succeeds, SQLite file updated
5. Close Electron, clear browser IndexedDB → restart Electron, refresh browser → data restored from SQLite
6. Settings panel: change auto-launch → `PUT /api/settings` → Electron updates
7. Settings panel: click "退出程序" → `POST /api/quit` → Electron quits
8. Tray: right-click → shows review count, "退出" works
9. Notifications: at configured time, Windows notification fires
