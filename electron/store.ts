import { app } from 'electron'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(app.getPath('userData'), 'leetcode-tracker')
const DB_PATH = path.join(DB_DIR, 'leetcode.db')

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

let db: SqlJsDatabase

function saveToDisk(): void {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

export async function initStore(): Promise<void> {
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
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
  saveToDisk()

  const result = db.exec('SELECT COUNT(*) as count FROM problems')
  const count = result.length > 0 ? result[0].values[0][0] as number : 0
  if (count === 0) {
    seedData()
  }
}

function seedData(): void {
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

  const stmts = db.prepare('INSERT INTO problems (id, leetcodeNumber, title, difficulty, category, url, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const progStmt = db.prepare('INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

  db.run('BEGIN')
  hot100.forEach((p, i) => {
    const id = i + 1
    const slug = slugMap[p.title] || p.title.toLowerCase().replace(/\s+/g, '-')
    stmts.run([id, p.leetcodeNumber, p.title, p.difficulty, p.category, `https://leetcode.cn/problems/${slug}`, 0])
    progStmt.run([id, id, 'not_started', null, null, 0, 0, 0])
  })
  db.run("INSERT OR IGNORE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, 5, 2, 1, '09:00')")
  db.run('COMMIT')
  stmts.free()
  progStmt.free()
  saveToDisk()
}

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

function queryAll(sql: string): Record<string, unknown>[] {
  const result = db.exec(sql)
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
}

function queryOne(sql: string): Record<string, unknown> | null {
  const rows = queryAll(sql)
  return rows.length > 0 ? rows[0] : null
}

export function readData(): AppData {
  const problems = queryAll('SELECT * FROM problems ORDER BY id') as unknown as ProblemData[]
  const progress = queryAll('SELECT * FROM progress ORDER BY id') as unknown as ProgressData[]
  const reviewLogs = queryAll('SELECT * FROM review_logs ORDER BY id') as unknown as ReviewLogData[]
  const settingsRow = queryOne('SELECT * FROM settings WHERE id = 1') as { dailyTotal: number; dailyNew: number; autoLaunch: number; reminderTime: string } | null
  const settings: SettingsData = settingsRow
    ? { dailyTotal: settingsRow.dailyTotal, dailyNew: settingsRow.dailyNew, autoLaunch: settingsRow.autoLaunch === 1, reminderTime: settingsRow.reminderTime }
    : { dailyTotal: 5, dailyNew: 2, autoLaunch: true, reminderTime: '09:00' }
  return { problems, progress, reviewLogs, settings }
}

export function writeData(data: AppData): void {
  db.run('BEGIN')
  db.run('DELETE FROM review_logs')
  db.run('DELETE FROM progress')
  db.run('DELETE FROM problems')
  db.run('DELETE FROM settings')

  const insP = db.prepare('INSERT INTO problems (id, leetcodeNumber, title, difficulty, category, url, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const insPr = db.prepare('INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const insL = db.prepare('INSERT INTO review_logs (id, problemId, date, oldLevel, newLevel, reviewedAt) VALUES (?, ?, ?, ?, ?, ?)')

  for (const p of data.problems) insP.run([p.id, p.leetcodeNumber, p.title, p.difficulty, p.category, p.url, p.isCustom ? 1 : 0])
  for (const p of data.progress) insPr.run([p.id, p.problemId, p.level, p.lastReviewedAt, p.nextReviewAt, p.reviewCount, p.todayReviewCount, p.consecutiveMastered])
  for (const l of data.reviewLogs) insL.run([l.id, l.problemId, l.date, l.oldLevel, l.newLevel, l.reviewedAt])
  db.run('INSERT OR REPLACE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, ?, ?, ?, ?)', [
    data.settings.dailyTotal, data.settings.dailyNew, data.settings.autoLaunch ? 1 : 0, data.settings.reminderTime
  ])
  db.run('COMMIT')
  insP.free(); insPr.free(); insL.free()
  saveToDisk()
}

export function readSettings(): SettingsData {
  return readData().settings
}

export function writeSettings(settings: SettingsData): void {
  db.run('INSERT OR REPLACE INTO settings (id, dailyTotal, dailyNew, autoLaunch, reminderTime) VALUES (1, ?, ?, ?, ?)', [
    settings.dailyTotal, settings.dailyNew, settings.autoLaunch ? 1 : 0, settings.reminderTime
  ])
  saveToDisk()
}
