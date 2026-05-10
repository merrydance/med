import { create } from 'zustand'
import type { AppSettings } from '../types/env'

interface SettingState extends AppSettings {
  isLoaded: boolean
  setField: <K extends keyof AppSettings>(field: K, value: AppSettings[K]) => void
  loadSettings: () => Promise<void>
  saveSettings: (overrides?: Partial<AppSettings>) => Promise<boolean>
}

const defaultSettings: AppSettings = {
  baseUrl: '',
  apiKey: '',
  tavilyKey: '',
  model: 'gpt-5.5',
  customModel: '',
  reasoningEffort: '',
  theme: 'system'
}

export const useSettingStore = create<SettingState>((set, get) => ({
  ...defaultSettings,
  isLoaded: false,

  setField: (field, value) => set({ [field]: value }),

  loadSettings: async () => {
    try {
      if (window.electronAPI) {
        const settings = await window.electronAPI.getSettings()
        set({ ...settings, isLoaded: true })
      } else {
        // Fallback for browser dev mode
        const stored = localStorage.getItem('app-settings')
        if (stored) set({ ...JSON.parse(stored), isLoaded: true })
        else set({ isLoaded: true })
      }
    } catch (e) {
      console.error('Failed to load settings', e)
      set({ isLoaded: true })
    }
  },

  saveSettings: async (overrides = {}) => {
    try {
      const state = get()
      const settingsToSave: AppSettings = {
        baseUrl: state.baseUrl,
        apiKey: state.apiKey,
        tavilyKey: state.tavilyKey,
        model: state.model,
        customModel: state.customModel,
        reasoningEffort: state.reasoningEffort,
        theme: state.theme
      }
      Object.assign(settingsToSave, overrides)
      
      if (window.electronAPI) {
        return await window.electronAPI.saveSettings(settingsToSave)
      } else {
        localStorage.setItem('app-settings', JSON.stringify(settingsToSave))
        return true
      }
    } catch (e) {
      console.error('Failed to save settings', e)
      return false
    }
  }
}))
