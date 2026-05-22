import { AppData, Settings } from './types'

const BASE = window.location.origin + '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
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
