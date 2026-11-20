import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  version: appVersion(),
  deepseek: {
    status: () => ipcRenderer.invoke('deepseek:status'),
    saveKey: (key: string) => ipcRenderer.invoke('deepseek:save-key', key),
    chat: (messages: { role: 'user' | 'assistant'; content: string }[], taskContext: string, notionPageIds: string[]) =>
      ipcRenderer.invoke('deepseek:chat', messages, taskContext, notionPageIds),
    onStream: (listener: (event: { kind: 'chunk' | 'error' | 'done' | 'status'; value?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { kind: 'chunk' | 'error' | 'done' | 'status'; value?: string }) => listener(payload)
      ipcRenderer.on('deepseek:stream', handler)
      return () => ipcRenderer.removeListener('deepseek:stream', handler)
    },
  },
  notion: {
    status: () => ipcRenderer.invoke('notion:status'),
    saveToken: (token: string) => ipcRenderer.invoke('notion:save-token', token),
    testConnection: () => ipcRenderer.invoke('notion:test-connection'),
    searchPages: (query: string) => ipcRenderer.invoke('notion:search-pages', query),
    addPage: (input: string) => ipcRenderer.invoke('notion:add-page', input),
  },
})

function appVersion(): string {
  return process.env.npm_package_version ?? '0.1.0'
}
