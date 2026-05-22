# Browser + Electron + SQLite 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Electron 从"窗口壳"改造为"后台服务器"，浏览器走 IndexedDB，Electron 走 SQLite，双向同步。

**Architecture:** 3 个 Subagent 并行执行 —— Agent A 装依赖 + 改配置，Agent B 写 Electron 后端（store + server + main + preload），Agent C 写前端适配层（api.ts + 5 个组件改造）。互不冲突，完成后统一验证。

**Tech Stack:** Express, better-sqlite3, cors, concurrently

---

## 并行设计

```
Agent A (依赖+配置)      Agent B (Electron 后端)       Agent C (前端适配)
npm install +            electron/store.ts (重写)      src/api.ts (新建)
package.json (更新)      electron/server.ts (新建)     src/App.tsx (修改)
                         electron/main.ts (修改)       src/components/SettingsPanel.tsx (修改)
                         electron/preload.ts (修改)    src/components/RatingModal.tsx (修改)
                                                      src/components/AddProblemModal.tsx (修改)
                                                      src/components/ProblemList.tsx (修改)
```

三个 Agent 修改的文件完全不重叠，可同时执行。唯一共享的是 API 接口约定（已在规范中定义）。

---

### Task 1: 安装依赖 + 更新 package.json (Agent A)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装新依赖**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && npm install express cors better-sqlite3 && npm install -D concurrently
```

- [ ] **Step 2: 更新 package.json scripts**

将 `package.json` 中 scripts 字段替换为：

```json
"scripts": {
  "start": "concurrently \"vite --open\" \"electron .\"",
  "build": "tsc && vite build",
  "prod": "tsc && vite build && electron ."
}
```

完整 `package.json`：

```json
{
  "name": "leetcode-tracker",
  "version": "1.0.0",
  "description": "LeetCode Hot 100 刷题辅助工具",
  "main": "dist-electron/main.js",
  "scripts": {
    "start": "concurrently \"vite --open\" \"electron .\"",
    "build": "tsc && vite build",
    "prod": "tsc && vite build && electron ."
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "dexie": "^4.0.8",
    "express": "^4.21.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "concurrently": "^9.0.0",
    "electron": "^31.1.0",
    "electron-builder": "^24.13.3",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vite-plugin-electron": "^0.28.7",
    "vite-plugin-electron-renderer": "^0.14.5"
  }
}
```

- [ ] **Step 3: 验证依赖安装成功**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && node -e "require('better-sqlite3'); require('express'); require('cors'); console.log('OK')"
```

Expected: `OK`

---

### Task 2: Electron 后端 (Agent B)

**Files:**
- Rewrite: `electron/store.ts`
- Create: `electron/server.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

#### Part 2a: 重写 electron/store.ts

将 JSON 文件读写全部替换为 SQLite：

```typescript
import { app } from 'electron'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(app.getPath('userData'), 'leetcode-tracker')
const DB_PATH = path.join(DB_DIR, 'leetcode.db')

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY,
    leetcodeNumber INTEGER,
    title TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    category TEXT NOT NULL,
    url TEXT,
    isCustom INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY,
    problemId INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'not_started',
    lastReviewedAt TEXT,
    nextReviewAt TEXT,
    reviewCount INTEGER DEFAULT 0,
    todayReviewCount INTEGER DEFAULT 0,
    consecutiveMastered INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS review_logs (
    id INTEGER PRIMARY KEY,
    problemId INTEGER NOT NULL,
    date TEXT NOT NULL,
    oldLevel TEXT NOT NULL,
    newLevel TEXT NOT NULL,
    reviewedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    dailyTotal INTEGER DEFAULT 5,
    dailyNew INTEGER DEFAULT 2,
    autoLaunch INTEGER DEFAULT 1,
    reminderTime TEXT DEFAULT '09:00'
  );
`)

// --- Seed data on first launch ---
const problemCount = (db.prepare('SELECT COUNT(*) as count FROM problems').get() as { count: number }).count
if (problemCount === 0) {
  const insertProblem = db.prepare(
    'INSERT INTO problems (id, leetcodeNumber, title, difficulty, category, url, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertProgress = db.prepare(
    'INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const hot100: { leetcodeNumber: number; title: string; difficulty: string; category: string }[] = [
    { leetcodeNumber: 1, title: '两数之和', difficulty: 'easy', category: '哈希' },
    { leetcodeNumber: 49, title: '字母异位词分组', difficulty: 'medium', category: '哈希' },
    { leetcodeNumber: 128, title: '最长连续序列', difficulty: 'medium', category: '哈希' },
    { leetcodeNumber: 283, title: '移动零', difficulty: 'easy', category: '双指针' },
    { leetcodeNumber: 11, title: '盛最多水的容器', difficulty: 'medium', category: '双指针' },
    { leetcodeNumber: 15, title: '三数之和', difficulty: 'medium', category: '双指针' },
    { leetcodeNumber: 42, title: '接雨水', difficulty: 'hard', category: '双指针' },
    { leetcodeNumber: 3, title: '无重复字符的最长子串', difficulty: 'medium', category: '滑动窗口' },
    { leetcodeNumber: 438, title: '找到字符串中所有字母异位词', difficulty: 'medium', category: '滑动窗口' },
    { leetcodeNumber: 560, title: '和为 K 的子数组', difficulty: 'medium', category: '滑动窗口' },
    { leetcodeNumber: 239, title: '滑动窗口最大值', difficulty: 'hard', category: '滑动窗口' },
    { leetcodeNumber: 76, title: '最小覆盖子串', difficulty: 'hard', category: '滑动窗口' },
    { leetcodeNumber: 53, title: '最大子数组和', difficulty: 'medium', category: '普通数组' },
    { leetcodeNumber: 56, title: '合并区间', difficulty: 'medium', category: '普通数组' },
    { leetcodeNumber: 189, title: '轮转数组', difficulty: 'medium', category: '普通数组' },
    { leetcodeNumber: 238, title: '除自身以外数组的乘积', difficulty: 'medium', category: '普通数组' },
    { leetcodeNumber: 41, title: '缺失的第一个正数', difficulty: 'hard', category: '普通数组' },
    { leetcodeNumber: 73, title: '矩阵置零', difficulty: 'medium', category: '矩阵' },
    { leetcodeNumber: 54, title: '螺旋矩阵', difficulty: 'medium', category: '矩阵' },
    { leetcodeNumber: 48, title: '旋转图像', difficulty: 'medium', category: '矩阵' },
    { leetcodeNumber: 240, title: '搜索二维矩阵 II', difficulty: 'medium', category: '矩阵' },
    { leetcodeNumber: 160, title: '相交链表', difficulty: 'easy', category: '链表' },
    { leetcodeNumber: 206, title: '反转链表', difficulty: 'easy', category: '链表' },
    { leetcodeNumber: 234, title: '回文链表', difficulty: 'easy', category: '链表' },
    { leetcodeNumber: 141, title: '环形链表', difficulty: 'easy', category: '链表' },
    { leetcodeNumber: 142, title: '环形链表 II', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 21, title: '合并两个有序链表', difficulty: 'easy', category: '链表' },
    { leetcodeNumber: 2, title: '两数相加', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 19, title: '删除链表的倒数第 N 个结点', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 24, title: '两两交换链表中的节点', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 25, title: 'K 个一组翻转链表', difficulty: 'hard', category: '链表' },
    { leetcodeNumber: 138, title: '随机链表的复制', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 148, title: '排序链表', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 23, title: '合并 K 个升序链表', difficulty: 'hard', category: '链表' },
    { leetcodeNumber: 146, title: 'LRU 缓存', difficulty: 'medium', category: '链表' },
    { leetcodeNumber: 94, title: '二叉树的中序遍历', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 104, title: '二叉树的最大深度', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 226, title: '翻转二叉树', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 101, title: '对称二叉树', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 543, title: '二叉树的直径', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 102, title: '二叉树的层序遍历', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 108, title: '将有序数组转换为二叉搜索树', difficulty: 'easy', category: '二叉树' },
    { leetcodeNumber: 98, title: '验证二叉搜索树', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 230, title: '二叉搜索树中第 K 小的元素', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 199, title: '二叉树的右视图', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 114, title: '二叉树展开为链表', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 105, title: '从前序与中序遍历序列构造二叉树', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 437, title: '路径总和 III', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 236, title: '二叉树的最近公共祖先', difficulty: 'medium', category: '二叉树' },
    { leetcodeNumber: 124, title: '二叉树中的最大路径和', difficulty: 'hard', category: '二叉树' },
    { leetcodeNumber: 200, title: '岛屿数量', difficulty: 'medium', category: '图论' },
    { leetcodeNumber: 994, title: '腐烂的橘子', difficulty: 'medium', category: '图论' },
    { leetcodeNumber: 207, title: '课程表', difficulty: 'medium', category: '图论' },
    { leetcodeNumber: 208, title: '实现 Trie (前缀树)', difficulty: 'medium', category: '图论' },
    { leetcodeNumber: 46, title: '全排列', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 78, title: '子集', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 17, title: '电话号码的字母组合', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 39, title: '组合总和', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 22, title: '括号生成', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 79, title: '单词搜索', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 131, title: '分割回文串', difficulty: 'medium', category: '回溯' },
    { leetcodeNumber: 51, title: 'N 皇后', difficulty: 'hard', category: '回溯' },
    { leetcodeNumber: 35, title: '搜索插入位置', difficulty: 'easy', category: '二分查找' },
    { leetcodeNumber: 74, title: '搜索二维矩阵', difficulty: 'medium', category: '二分查找' },
    { leetcodeNumber: 34, title: '在排序数组中查找元素的区间', difficulty: 'medium', category: '二分查找' },
    { leetcodeNumber: 33, title: '搜索旋转排序数组', difficulty: 'medium', category: '二分查找' },
    { leetcodeNumber: 153, title: '寻找旋转排序数组中的最小值', difficulty: 'medium', category: '二分查找' },
    { leetcodeNumber: 4, title: '寻找两个正序数组的中位数', difficulty: 'hard', category: '二分查找' },
    { leetcodeNumber: 20, title: '有效的括号', difficulty: 'easy', category: '栈' },
    { leetcodeNumber: 155, title: '最小栈', difficulty: 'medium', category: '栈' },
    { leetcodeNumber: 394, title: '字符串解码', difficulty: 'medium', category: '栈' },
    { leetcodeNumber: 739, title: '每日温度', difficulty: 'medium', category: '栈' },
    { leetcodeNumber: 84, title: '柱状图中最大的矩形', difficulty: 'hard', category: '栈' },
    { leetcodeNumber: 215, title: '数组中的第 K 个最大元素', difficulty: 'medium', category: '堆' },
    { leetcodeNumber: 347, title: '前 K 个高频元素', difficulty: 'medium', category: '堆' },
    { leetcodeNumber: 295, title: '数据流的中位数', difficulty: 'hard', category: '堆' },
    { leetcodeNumber: 121, title: '买卖股票的最佳时机', difficulty: 'easy', category: '贪心' },
    { leetcodeNumber: 55, title: '跳跃游戏', difficulty: 'medium', category: '贪心' },
    { leetcodeNumber: 45, title: '跳跃游戏 II', difficulty: 'medium', category: '贪心' },
    { leetcodeNumber: 763, title: '划分字母区间', difficulty: 'medium', category: '贪心' },
    { leetcodeNumber: 70, title: '爬楼梯', difficulty: 'easy', category: '动态规划' },
    { leetcodeNumber: 118, title: '杨辉三角', difficulty: 'easy', category: '动态规划' },
    { leetcodeNumber: 198, title: '打家劫舍', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 279, title: '完全平方数', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 322, title: '零钱兑换', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 139, title: '单词拆分', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 300, title: '最长递增子序列', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 152, title: '乘积最大子数组', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 416, title: '分割等和子集', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 32, title: '最长有效括号', difficulty: 'hard', category: '动态规划' },
    { leetcodeNumber: 62, title: '不同路径', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 64, title: '最小路径和', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 5, title: '最长回文子串', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 1143, title: '最长公共子序列', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 72, title: '编辑距离', difficulty: 'medium', category: '动态规划' },
    { leetcodeNumber: 136, title: '只出现一次的数字', difficulty: 'easy', category: '技巧' },
    { leetcodeNumber: 169, title: '多数元素', difficulty: 'easy', category: '技巧' },
    { leetcodeNumber: 75, title: '颜色分类', difficulty: 'medium', category: '技巧' },
    { leetcodeNumber: 31, title: '下一个排列', difficulty: 'medium', category: '技巧' },
    { leetcodeNumber: 287, title: '寻找重复数', difficulty: 'medium', category: '技巧' },
  ]

  const slugMap: Record<string, string> = {
    '两数之和': 'two-sum', '字母异位词分组': 'group-anagrams', '最长连续序列': 'longest-consecutive-sequence',
    '移动零': 'move-zeroes', '盛最多水的容器': 'container-with-most-water', '三数之和': '3sum',
    '接雨水': 'trapping-rain-water', '无重复字符的最长子串': 'longest-substring-without-repeating-characters',
    '找到字符串中所有字母异位词': 'find-all-anagrams-in-a-string', '和为 K 的子数组': 'subarray-sum-equals-k',
    '滑动窗口最大值': 'sliding-window-maximum', '最小覆盖子串': 'minimum-window-substring',
    '最大子数组和': 'maximum-subarray', '合并区间': 'merge-intervals', '轮转数组': 'rotate-array',
    '除自身以外数组的乘积': 'product-of-array-except-self', '缺失的第一个正数': 'first-missing-positive',
    '矩阵置零': 'set-matrix-zeroes', '螺旋矩阵': 'spiral-matrix', '旋转图像': 'rotate-image',
    '搜索二维矩阵 II': 'search-a-2d-matrix-ii', '相交链表': 'intersection-of-two-linked-lists',
    '反转链表': 'reverse-linked-list', '回文链表': 'palindrome-linked-list', '环形链表': 'linked-list-cycle',
    '环形链表 II': 'linked-list-cycle-ii', '合并两个有序链表': 'merge-two-sorted-lists', '两数相加': 'add-two-numbers',
    '删除链表的倒数第 N 个结点': 'remove-nth-node-from-end-of-list', '两两交换链表中的节点': 'swap-nodes-in-pairs',
    'K 个一组翻转链表': 'reverse-nodes-in-k-group', '随机链表的复制': 'copy-list-with-random-pointer',
    '排序链表': 'sort-list', '合并 K 个升序链表': 'merge-k-sorted-lists', 'LRU 缓存': 'lru-cache',
    '二叉树的中序遍历': 'binary-tree-inorder-traversal', '二叉树的最大深度': 'maximum-depth-of-binary-tree',
    '翻转二叉树': 'invert-binary-tree', '对称二叉树': 'symmetric-tree', '二叉树的直径': 'diameter-of-binary-tree',
    '二叉树的层序遍历': 'binary-tree-level-order-traversal', '将有序数组转换为二叉搜索树': 'convert-sorted-array-to-binary-search-tree',
    '验证二叉搜索树': 'validate-binary-search-tree', '二叉搜索树中第 K 小的元素': 'kth-smallest-element-in-a-bst',
    '二叉树的右视图': 'binary-tree-right-side-view', '二叉树展开为链表': 'flatten-binary-tree-to-linked-list',
    '从前序与中序遍历序列构造二叉树': 'construct-binary-tree-from-preorder-and-inorder-traversal',
    '路径总和 III': 'path-sum-iii', '二叉树的最近公共祖先': 'lowest-common-ancestor-of-a-binary-tree',
    '二叉树中的最大路径和': 'binary-tree-maximum-path-sum', '岛屿数量': 'number-of-islands',
    '腐烂的橘子': 'rotting-oranges', '课程表': 'course-schedule', '实现 Trie (前缀树)': 'implement-trie-prefix-tree',
    '全排列': 'permutations', '子集': 'subsets', '电话号码的字母组合': 'letter-combinations-of-a-phone-number',
    '组合总和': 'combination-sum', '括号生成': 'generate-parentheses', '单词搜索': 'word-search',
    '分割回文串': 'palindrome-partitioning', 'N 皇后': 'n-queens', '搜索插入位置': 'search-insert-position',
    '搜索二维矩阵': 'search-a-2d-matrix', '在排序数组中查找元素的区间': 'find-first-and-last-position-of-element-in-sorted-array',
    '搜索旋转排序数组': 'search-in-rotated-sorted-array', '寻找旋转排序数组中的最小值': 'find-minimum-in-rotated-sorted-array',
    '寻找两个正序数组的中位数': 'median-of-two-sorted-arrays', '有效的括号': 'valid-parentheses',
    '最小栈': 'min-stack', '字符串解码': 'decode-string', '每日温度': 'daily-temperatures',
    '柱状图中最大的矩形': 'largest-rectangle-in-histogram', '数组中的第 K 个最大元素': 'kth-largest-element-in-an-array',
    '前 K 个高频元素': 'top-k-frequent-elements', '数据流的中位数': 'find-median-from-data-stream',
    '买卖股票的最佳时机': 'best-time-to-buy-and-sell-stock', '跳跃游戏': 'jump-game', '跳跃游戏 II': 'jump-game-ii',
    '划分字母区间': 'partition-labels', '爬楼梯': 'climbing-stairs', '杨辉三角': 'pascals-triangle',
    '打家劫舍': 'house-robber', '完全平方数': 'perfect-squares', '零钱兑换': 'coin-change',
    '单词拆分': 'word-break', '最长递增子序列': 'longest-increasing-subsequence',
    '乘积最大子数组': 'maximum-product-subarray', '分割等和子集': 'partition-equal-subset-sum',
    '最长有效括号': 'longest-valid-parentheses', '不同路径': 'unique-paths', '最小路径和': 'minimum-path-sum',
    '最长回文子串': 'longest-palindromic-substring', '最长公共子序列': 'longest-common-subsequence',
    '编辑距离': 'edit-distance', '只出现一次的数字': 'single-number', '多数元素': 'majority-element',
    '颜色分类': 'sort-colors', '下一个排列': 'next-permutation', '寻找重复数': 'find-the-duplicate-number',
  }

  const seedAll = db.transaction(() => {
    hot100.forEach((p, i) => {
      const id = i + 1
      const slug = slugMap[p.title] || p.title.toLowerCase().replace(/\s+/g, '-')
      insertProblem.run(id, p.leetcodeNumber, p.title, p.difficulty, p.category, `https://leetcode.cn/problems/${slug}`, 0)
      insertProgress.run(id, id, 'not_started', null, null, 0, 0, 0)
    })
    db.prepare('INSERT OR IGNORE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, 5, 2, 1, ?)').run('09:00')
  })
  seedAll()
}

// --- Exported interfaces (same as before) ---

export interface AppData {
  problems: ProblemData[]
  progress: ProgressData[]
  reviewLogs: ReviewLogData[]
  settings: SettingsData
}

export interface ProblemData {
  id: number; leetcodeNumber: number; title: string; difficulty: 'easy' | 'medium' | 'hard'
  category: string; url: string; isCustom: boolean
}

export interface ProgressData {
  id: number; problemId: number; level: 'not_started' | 'forgotten' | 'partial' | 'hesitant' | 'mastered'
  lastReviewedAt: string | null; nextReviewAt: string | null; reviewCount: number; todayReviewCount: number; consecutiveMastered: number
}

export interface ReviewLogData {
  id: number; problemId: number; date: string; oldLevel: string; newLevel: string; reviewedAt: string
}

export interface SettingsData {
  dailyTotal: number; dailyNew: number; autoLaunch: boolean; reminderTime: string
}

// --- Read/Write functions (same signatures as before) ---

export function readData(): AppData {
  const problems = db.prepare('SELECT * FROM problems ORDER BY id').all() as ProblemData[]
  const progress = db.prepare('SELECT * FROM progress ORDER BY id').all() as ProgressData[]
  const reviewLogs = db.prepare('SELECT * FROM review_logs ORDER BY id').all() as ReviewLogData[]
  const settingsRow = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { dailyTotal: number; dailyNew: number; autoLaunch: number; reminderTime: string } | undefined
  const settings: SettingsData = settingsRow
    ? { dailyTotal: settingsRow.dailyTotal, dailyNew: settingsRow.dailyNew, autoLaunch: settingsRow.autoLaunch === 1, reminderTime: settingsRow.reminderTime }
    : { dailyTotal: 5, dailyNew: 2, autoLaunch: true, reminderTime: '09:00' }
  return { problems, progress, reviewLogs, settings }
}

export function writeData(data: AppData): void {
  const writeAll = db.transaction(() => {
    db.prepare('DELETE FROM review_logs').run()
    db.prepare('DELETE FROM progress').run()
    db.prepare('DELETE FROM problems').run()
    db.prepare('DELETE FROM settings').run()

    const insP = db.prepare('INSERT INTO problems (id, leetcodeNumber, title, difficulty, category, url, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insPr = db.prepare('INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const insL = db.prepare('INSERT INTO review_logs (id, problemId, date, oldLevel, newLevel, reviewedAt) VALUES (?, ?, ?, ?, ?, ?)')

    for (const p of data.problems) insP.run(p.id, p.leetcodeNumber, p.title, p.difficulty, p.category, p.url, p.isCustom ? 1 : 0)
    for (const p of data.progress) insPr.run(p.id, p.problemId, p.level, p.lastReviewedAt, p.nextReviewAt, p.reviewCount, p.todayReviewCount, p.consecutiveMastered)
    for (const l of data.reviewLogs) insL.run(l.id, l.problemId, l.date, l.oldLevel, l.newLevel, l.reviewedAt)
    db.prepare('INSERT OR REPLACE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, ?, ?, ?, ?)').run(
      data.settings.dailyTotal, data.settings.dailyNew, data.settings.autoLaunch ? 1 : 0, data.settings.reminderTime
    )
  })
  writeAll()
}

export function readSettings(): SettingsData {
  return readData().settings
}

export function writeSettings(settings: SettingsData): void {
  db.prepare('INSERT OR REPLACE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, ?, ?, ?, ?)').run(
    settings.dailyTotal, settings.dailyNew, settings.autoLaunch ? 1 : 0, settings.reminderTime
  )
}
```

- [ ] **Step 2b: 创建 electron/server.ts**

```typescript
import express from 'express'
import cors from 'cors'
import { readData, writeData, readSettings, writeSettings, SettingsData } from './store'

export function createServer(): express.Express {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  // GET /api/data — full data export from SQLite
  app.get('/api/data', (_req, res) => {
    try {
      const data = readData()
      res.json(data)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // POST /api/data — full data import to SQLite
  app.post('/api/data', (req, res) => {
    try {
      writeData(req.body)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/settings — read settings
  app.get('/api/settings', (_req, res) => {
    try {
      const settings = readSettings()
      res.json(settings)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // PUT /api/settings — update settings
  app.put('/api/settings', (req, res) => {
    try {
      const s: SettingsData = req.body
      writeSettings(s)
      // Also update auto-launch
      const { app } = require('electron')
      app.setLoginItemSettings({
        openAtLogin: s.autoLaunch,
        path: app.getPath('exe')
      })
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // POST /api/quit — quit Electron
  app.post('/api/quit', (_req, res) => {
    res.json({ success: true })
    const { app } = require('electron')
    app.quit()
  })

  return app
}
```

- [ ] **Step 2c: 修改 electron/main.ts**

完整替换为以下内容（核心变化：去掉 BrowserWindow，加入 Express 服务器启动，保留托盘/通知/自启）：

```typescript
import { app, Tray, Menu, nativeImage, Notification, shell } from 'electron'
import path from 'path'
import { readData, readSettings, writeSettings } from './store'
import { createServer } from './server'

let tray: Tray | null = null
let isQuitting = false
let server: any = null

function createTray() {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 59
    buffer[i + 1] = 130
    buffer[i + 2] = 246
    buffer[i + 3] = 255
  }
  const icon = nativeImage.createFromBuffer(buffer, { width: size, height: size })
  tray = new Tray(icon)
  tray.setToolTip('LeetCode Tracker - 右键退出')

  const updateMenu = () => {
    const data = readData()
    const needsReview = data.progress.filter(p => {
      if (p.level === 'forgotten' || p.level === 'not_started') return true
      if (!p.nextReviewAt) return false
      return new Date(p.nextReviewAt) <= new Date()
    }).length

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开网页',
        click: () => shell.openExternal('http://localhost:5173')
      },
      {
        label: `今日待复习: ${needsReview} 道`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          if (server) server.close()
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(contextMenu)
  }

  updateMenu()
  setInterval(updateMenu, 60000)

  tray.on('double-click', () => shell.openExternal('http://localhost:5173'))
}

function setupReminder() {
  const checkReminder = () => {
    const now = new Date()
    const settings = readSettings()
    const [h, m] = settings.reminderTime.split(':').map(Number)
    if (now.getHours() === h && now.getMinutes() === m) {
      const data = readData()
      const needsReview = data.progress.filter(p => {
        if (p.level === 'forgotten' || p.level === 'not_started') return true
        if (!p.nextReviewAt) return false
        return new Date(p.nextReviewAt) <= new Date()
      }).length

      if (needsReview > 0 && Notification.isSupported()) {
        new Notification({
          title: 'LeetCode Tracker',
          body: `今日待复习 ${needsReview} 道，新题目标 ${settings.dailyNew} 道`
        }).show()
      }
    }
  }
  setInterval(checkReminder, 60000)
}

function startServer() {
  const app = createServer()
  server = app.listen(3456, '127.0.0.1', () => {
    console.log('Express server running on http://localhost:3456')
  })
}

app.whenReady().then(() => {
  startServer()
  createTray()
  setupReminder()

  const settings = readSettings()
  app.setLoginItemSettings({
    openAtLogin: settings.autoLaunch,
    path: app.getPath('exe')
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (server) server.close()
})
```

- [ ] **Step 2d: 修改 electron/preload.ts**

精简掉大部分 IPC，只保留通知推送：

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onNotificationReminder: (callback: () => void) => {
    ipcRenderer.on('review-reminder', callback)
    return () => ipcRenderer.removeListener('review-reminder', callback)
  }
})
```

- [ ] **Step 2e: 提交 Electron 后端改动**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && git add electron/store.ts electron/server.ts electron/main.ts electron/preload.ts && git commit -m "feat: replace JSON with SQLite, add Express server, remove BrowserWindow"
```

---

### Task 3: 前端适配层 (Agent C)

**Files:**
- Create: `src/api.ts`
- Modify: `src/App.tsx`, `src/components/SettingsPanel.tsx`, `src/components/RatingModal.tsx`, `src/components/AddProblemModal.tsx`, `src/components/ProblemList.tsx`

#### Part 3a: 创建 src/api.ts

```typescript
import { AppData, Settings } from './types'

const BASE = 'http://localhost:3456/api'

async function request<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null // Electron not running — silent fail
  }
}

export const api = {
  getData: () => request<AppData>('/data'),

  saveData: (data: AppData) =>
    request<{ success: boolean }>('/data', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSettings: () => request<Settings>('/settings'),

  updateSettings: (settings: Settings) =>
    request<{ success: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  quit: () =>
    request<{ success: boolean }>('/quit', { method: 'POST' }),
}
```

#### Part 3b: 修改 src/App.tsx

替换 `window.electronAPI.*` 调用为 `api.*`：

```typescript
import { useEffect, useState } from 'react'
import { db } from './db'
import { initializeData, syncFromJSON, exportToJSON } from './seed'
import { resetTodayReviewCounts } from './spacedRepetition'
import { AppData } from './types'
import { api } from './api'
import Layout from './components/Layout'

function App() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    async function load() {
      await initializeData()

      // Try to sync from Electron SQLite if available
      try {
        const data = await api.getData()
        if (data && data.problems.length > 0) {
          await syncFromJSON(data)
        }
      } catch {
        // Electron not running, use IndexedDB data
      }

      // Reset todayReviewCount for new day
      const progressList = await db.progress.toArray()
      const reset = resetTodayReviewCounts(progressList)
      for (const p of reset) {
        await db.progress.update(p.id, { todayReviewCount: p.todayReviewCount })
      }

      setLoading(false)
    }
    load()
  }, [])

  // Auto-save to Electron SQLite every 30 seconds when data changes
  useEffect(() => {
    if (loading) return
    const interval = setInterval(async () => {
      const data = await exportToJSON()
      await api.saveData(data)
    }, 30000)
    return () => clearInterval(interval)
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-lg">加载中...</p>
      </div>
    )
  }

  return <Layout activeTab={activeTab} setActiveTab={setActiveTab} />
}

export default App
```

注意：不再需要 `declare global { interface Window { electronAPI?: ... } }`，类型声明可以完全移除。

#### Part 3c: 修改 src/components/SettingsPanel.tsx

将 `window.electronAPI.*` 调用替换为 `api.*`：

关键改动在 `save()` 函数：

```typescript
async function save() {
  await db.settings.put(settings)
  try {
    await api.updateSettings(settings)
    const data = await exportToJSON()
    await api.saveData(data)
  } catch {
    // Electron not running — silent fail
  }
  onClose()
}
```

`handleQuit()` 函数：

```typescript
function handleQuit() {
  api.quit()
}
```

去掉 `window.electronAPI` 条件判断（因为 Settings 面板里的退出按钮在纯浏览器模式下也能点，api.quit() 会静默失败）：

```typescript
<div>
  <button onClick={handleQuit} className="w-full bg-red-800 hover:bg-red-700 text-red-200 text-sm py-2 rounded-lg">
    退出程序
  </button>
  <p className="text-xs text-slate-500 mt-1">关闭窗口只会最小化到托盘，在这里才能真正退出</p>
</div>
```

完整文件改动：去掉 `{window.electronAPI && (` 条件包裹，始终显示退出按钮；`save()` 和 `handleQuit()` 改用 `api.*`。

#### Part 3d: 修改 src/components/RatingModal.tsx

将 `window.electronAPI.saveData(data)` 替换为 `api.saveData(data)`：

在 `handleRate` 函数末尾：

```typescript
// 替换这段：
if (window.electronAPI) {
  const data = await exportToJSON()
  await window.electronAPI.saveData(data)
}

// 改为：
const data = await exportToJSON()
await api.saveData(data)
```

无需 import 改动（api 已在文件顶部导入）。

#### Part 3e: 修改 src/components/AddProblemModal.tsx

同样替换 `window.electronAPI.saveData(data)` 为 `api.saveData(data)`：

在 `handleSubmit` 函数末尾：

```typescript
// 替换这段：
if (window.electronAPI) {
  const data = await exportToJSON()
  await window.electronAPI.saveData(data)
}

// 改为：
const data = await exportToJSON()
await api.saveData(data)
```

#### Part 3f: 修改 src/components/ProblemList.tsx

同样替换 `window.electronAPI.saveData(data)` 为 `api.saveData(data)`：

在 `updateLevel` 函数末尾：

```typescript
// 替换这段：
if (window.electronAPI) {
  const data = await exportToJSON()
  await window.electronAPI.saveData(data)
}

// 改为：
const data = await exportToJSON()
await api.saveData(data)
```

#### Part 3g: 提交前端改动

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && git add src/api.ts src/App.tsx src/components/SettingsPanel.tsx src/components/RatingModal.tsx src/components/AddProblemModal.tsx src/components/ProblemList.tsx && git commit -m "feat: add api client, replace electronAPI with REST calls"
```

---

### Task 4: 构建验证

- [ ] **Step 4a: TypeScript 类型检查**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 4b: Vite 构建**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && npx vite build 2>&1
```

Expected: Build succeeds (dist/ + dist-electron/ 生成).

- [ ] **Step 4c: 启动测试**

```bash
cd "D:/Lucifer/工作/实习/Leetcode" && npm start
```

Expected:
1. 浏览器自动打开 `http://localhost:5173`
2. 页面加载 100 道题
3. Windows 托盘出现蓝色图标
4. 评价一道题 → 刷新页面数据还在
5. 浏览器 DevTools Network 面板可看到 `/api/data` 请求成功

- [ ] **Step 4d: SQLite 持久化验证**

```bash
# 检查 SQLite 文件是否存在
ls "%APPDATA%/leetcode-tracker/leetcode.db" 2>/dev/null || echo "File not found"
```

Expected: `leetcode.db` 文件存在。

---

## 验证清单

- [ ] `npm start` → 浏览器打开 + 托盘出现 + 100 题加载
- [ ] 评价题目 → 刷新后数据保留
- [ ] 浏览器 DevTools → Network → `GET /api/data` 200 OK
- [ ] 清除 IndexedDB → 刷新 → 数据从 SQLite 恢复
- [ ] 设置面板 → 改自启开关 → `PUT /api/settings` 200 OK
- [ ] 设置面板 → 退出程序 → `POST /api/quit` → Electron 退出，浏览器仍可用
- [ ] 托盘右键 → 显示待复习数 + 退出
- [ ] 到设定时间 → Windows 通知弹出
