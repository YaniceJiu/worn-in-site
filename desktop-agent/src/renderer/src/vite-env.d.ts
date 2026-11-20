/// <reference types="vite/client" />

interface Window {
  desktop: {
    platform: string
    version: string
    deepseek: {
      status: () => Promise<{ configured: boolean; encryptionAvailable: boolean }>
      saveKey: (key: string) => Promise<{ configured: boolean }>
      chat: (messages: { role: 'user' | 'assistant'; content: string }[], taskContext: string, notionPageIds: string[]) => Promise<void>
      onStream: (listener: (event: { kind: 'chunk' | 'error' | 'done' | 'status'; value?: string }) => void) => () => void
    }
    notion: {
      status: () => Promise<{ configured: boolean; encryptionAvailable: boolean }>
      saveToken: (token: string) => Promise<{ configured: boolean }>
      testConnection: () => Promise<{ connected: boolean; name: string }>
      searchPages: (query: string) => Promise<{ id: string; title: string; url: string; lastEditedTime: string }[]>
      addPage: (input: string) => Promise<{ id: string; title: string; url: string; lastEditedTime: string }>
    }
  }
}
