import { useState, lazy, Suspense } from 'react'
import Dashboard from './Dashboard'
import ProblemList from './ProblemList'
import ReviewQueue from './ReviewQueue'
const History = lazy(() => import('./History'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))

interface Props {
  activeTab: string
  setActiveTab: (tab: string) => void
}

const TABS = [
  { id: 'dashboard', label: '仪表盘' },
  { id: 'problems', label: '题目列表' },
  { id: 'review', label: '今日复习' },
  { id: 'history', label: '刷题日历' }
]

export default function Layout({ activeTab, setActiveTab }: Props) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-slate-400 hover:text-slate-200 text-sm"
        >
          设置
        </button>
      </header>

      <main className="p-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'problems' && <ProblemList />}
        {activeTab === 'review' && <ReviewQueue />}
        <Suspense fallback={<div className="text-slate-400 text-center py-12">加载中...</div>}>
          {activeTab === 'history' && <History />}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </Suspense>
    </div>
  )
}
