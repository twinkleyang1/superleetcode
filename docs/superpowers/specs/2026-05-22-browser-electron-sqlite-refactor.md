# 浏览器 + Electron 后台 + SQLite 架构重构

## 背景

当前架构是 React 跑在 Electron 窗口里，数据用 IndexedDB + JSON 文件双重存储。用户想要：

1. **浏览器优先** — 在 Chrome 里打开，不走 Electron 窗口
2. **本地磁盘存储** — 数据存磁盘，清浏览器缓存不会丢失
3. **Electron 后台服务** — 保留系统托盘、开机自启、Windows 通知
4. **浏览器控制 Electron** — 网页里的设置能传到 Electron（自启、提醒等）

## 架构

```
浏览器 (Chrome)                     Electron (后台)
┌─────────────────────┐    HTTP    ┌──────────────────────┐
│ React + Vite         │◄─────────►│ Express :3456         │
│ Dexie.js (IndexedDB) │           │ better-sqlite3        │
│ - 主存储，快速读写     │           │ - 磁盘持久存储         │
│ - 随时可用            │           │ - 系统托盘            │
└─────────────────────┘           │ - 开机自启            │
                                   │ - 定时通知            │
                                   └──────────────────────┘
```

**核心原则**：组件不改数据访问方式，继续用 `db.*`（Dexie/IndexedDB）。只在 App.tsx 加一层薄薄的同步逻辑——Electron 在线时自动双向同步。

## 数据流

### 启动时
1. `npm start` → Vite 打开浏览器 + Electron 后台启动
2. 浏览器调用 `GET /api/data` → 拿到 SQLite 全量数据
3. 浏览器执行 `syncFromJSON(data)` → 写入 IndexedDB（复用现有函数）
4. 正常渲染页面

### 使用中
1. 用户操作 → 组件写入 IndexedDB（`db.*`）— 毫秒级响应
2. 写入后自动 `exportToJSON()` → `POST /api/data` → 写 SQLite 磁盘
3. 每 30 秒自动保存一次做兜底

### 如果只开了浏览器（Electron 没启动）
1. API 调用静默失败，不报错
2. 直接用 IndexedDB 数据，所有功能正常
3. 数据暂存 IndexedDB，下次 `npm start` 时自动同步

### 冲突处理
最后写入生效。单用户单设备，实际不会出现冲突。

## API 路由

| 方法 | 路径 | 请求体 | 响应 | 用途 |
|------|------|--------|------|------|
| GET | /api/data | — | AppData 全量 | 从 SQLite 拉数据到浏览器 |
| POST | /api/data | AppData 全量 | { success: true } | 浏览器数据推到 SQLite |
| GET | /api/settings | — | Settings | 读取设置 |
| PUT | /api/settings | Settings | { success: true } | 更新设置 + 开机自启 |
| POST | /api/quit | — | { success: true } | 退出 Electron |

## 文件改动

### 新增文件
- `electron/server.ts` — Express 服务器 + API 路由 + SQLite 操作
- `src/api.ts` — fetch 封装，浏览器调用 Electron API 的客户端

### 修改文件
| 文件 | 改动 |
|------|------|
| `electron/main.ts` | 去掉 BrowserWindow。启动时开启 Express 服务器。保留托盘、自启、通知、提醒定时器。 |
| `electron/store.ts` | JSON 文件读写改成 SQLite（better-sqlite3）。接口保持不变（readData/writeData/readSettings/writeSettings）。加数据库初始化和建表。首次启动自动填充 100 题。 |
| `electron/preload.ts` | 精简，去掉大部分 IPC 处理。只留通知推送监听。 |
| `src/App.tsx` | `window.electronAPI.getData()` 替换为 `api.getData()`。`window.electronAPI.saveData()` 替换为 `api.saveData()`。保留 IndexedDB 初始化逻辑。Electron 不在时静默失败。 |
| `src/components/SettingsPanel.tsx` | `window.electronAPI.saveSettings()` / `setAutoLaunch()` / `quitApp()` 替换为 `api.updateSettings()` / `api.quit()`。保留 `db.settings.put()`。 |
| `src/components/RatingModal.tsx` | IndexedDB 写入后加 `api.saveData(data)`（Electron 不在则静默失败）。 |
| `src/components/AddProblemModal.tsx` | 同上。 |
| `src/components/ProblemList.tsx` | 同上。 |
| `package.json` | 加 `express`、`cors`、`better-sqlite3`。更新 scripts。 |

### 不改的文件
- `src/db.ts` — IndexedDB 结构不变
- `src/types.ts` — 类型不变
- `src/seed.ts` — `initializeData()`、`syncFromJSON()`、`exportToJSON()` 不变
- `src/spacedRepetition.ts` — 纯函数，不变
- `src/predictions.ts` — 纯函数，不变
- `src/components/` 下除 SettingsPanel 外的所有组件 — 仍然用 `db.*`
- `src/charts/` 下所有图表 — 纯展示组件
- `data/hot100.ts` — 静态数据
- `vite.config.ts` — 不变

## SQLite 表结构

与 IndexedDB 结构一致：

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

## 复用现有函数

`src/seed.ts` 里的 `syncFromJSON()` 和 `exportToJSON()` 是 IndexedDB 和 AppData 之间的桥梁。SQLite 层也用同样的 AppData 格式，所以这两个函数完全不用改：

- `syncFromJSON(appData)` — 清空 IndexedDB，批量写入 AppData
- `exportToJSON()` — 读取 IndexedDB 全部数据，返回 AppData

Express API 路由里调用对应的 SQLite 版本来读写。

## npm 命令

```json
{
  "start": "concurrently \"vite --open\" \"electron .\"",
  "build": "tsc && vite build",
  "prod": "tsc && vite build && electron ."
}
```

`npm start` 一条命令搞定一切：启动 Vite → 打开浏览器 + 启动 Electron 后台（Express + SQLite + 托盘 + 通知）。用户无需额外操作，日常使用就是这个命令。

## 验证步骤

1. `npm start` → 浏览器打开 + Electron 托盘出现，应用加载 100 道题
2. 评价一道题 → 刷新页面数据还在，同时 SQLite 文件已更新
3. 清除浏览器 IndexedDB → 刷新页面 → 数据自动从 SQLite 恢复到 IndexedDB
4. 设置面板：改开机自启开关 → `PUT /api/settings` → Electron 响应
5. 设置面板：点"退出程序" → `POST /api/quit` → Electron 退出，浏览器仍正常使用
6. 托盘：右键 → 显示待复习数量，可退出
7. 通知：到设定时间 → Windows 系统通知弹出
