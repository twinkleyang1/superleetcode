# SuperLeetCode

LeetCode Hot 100 刷题辅助工具，带间隔重复（Spaced Repetition）和智能复习提醒。

## 架构

```
浏览器 (Chrome)  →  localhost:3456  →  Electron (后台进程)
   ↑                    ↑                    ├── Express 静态+API 服务
  你在浏览器里操作      同端口托管页面和API     ├── SQLite 持久化存储
                                              ├── Windows 托盘图标
                                              ├── 开机自启
                                              └── 定时通知提醒
```

- **前端**：React + Vite + IndexedDB（浏览器内快速读写）
- **后端**：Electron + Express（`localhost:3456`）
- **存储**：sql.js（纯 JS/WebAssembly 的 SQLite，无需编译、持久化到本地文件）
- **同步**：浏览器 IndexedDB ↔ SQLite 自动双向同步，清浏览器缓存不丢数据

## 快速开始

```bash
# 安装依赖
npm install

# 启动（构建前端 + 启动 Electron）
npm start
```

浏览器自动打开 `http://localhost:3456`，即可开始刷题。
关掉终端不影响运行，Electron 在后台持续工作。

## 开发模式

```bash
npm run dev
```

Vite 热更新 + Electron 同时启动，修改代码即时生效。

## 功能

- **100 道 LeetCode Hot 100** 预置，按类别分组
- **间隔重复**：5 个等级（not_started → forgotten → partial → hesitant → mastered），自动计算下次复习时间
- **每日复习队列**：今日到期的题目高亮提醒
- **数据统计**：刷题进度、掌握趋势图表
- **自定义题目**：可添加 Hot 100 之外的题
- **Windows 托盘**：右下角蓝图标，双击打开页面，右键显示待复习数
- **定时通知**：到达设定时间弹出 Windows 提醒
- **开机自启**：可在设置面板开关
- **设置面板**：每日题量、每日新题数、提醒时间、自启开关、退出程序

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Dexie |
| 后端 | Electron 31, Express, sql.js |
| 存储 | IndexedDB (浏览器) + SQLite (本地持久化) |

## License

MIT
