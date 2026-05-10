import type { ChatMessage } from './chat';

export interface AppSettings {
  baseUrl: string;
  apiKey: string;
  tavilyKey: string;
  model: string;
  customModel: string;
  reasoningEffort: string;
  theme?: 'light' | 'dark' | 'system';
}

export interface FileReadResult {
  name: string;
  text: string;
  pages: number;
}

export interface DocumentContextChunk {
  index: number;
  text: string;
  start: number;
  end: number;
  score: number;
}

export interface DocumentContextResult {
  mode: 'empty' | 'full' | 'rag';
  context: string;
  chunks: DocumentContextChunk[];
  totalChunks: number;
  originalChars: number;
  selectedChars: number;
}

export interface DbChatRow {
  id: string;
  title: string;
  model: string;
  reasoningEffort: string;
  createdAt: number;
  updatedAt: number;
}

export interface DbChatMessage extends ChatMessage {
  chatId: string;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  messages: ChatCompletionMessage[];
  settings?: Pick<AppSettings, 'model' | 'customModel' | 'reasoningEffort'>;
}

export interface ConnectionTestResult {
  ok: boolean;
  type: 'ok' | 'missing-key' | 'http-error' | 'network-error';
  status?: number;
  message: string;
}

export interface ElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;
  testConnection: () => Promise<ConnectionTestResult>;
  
  openFileDialog: () => Promise<string | null>;
  readFile: (path: string) => Promise<FileReadResult>;
  selectDocumentContext: (payload: {
    name: string;
    text: string;
    query: string;
  }) => Promise<DocumentContextResult>;

  // Database CRUD
  dbGetChats: () => Promise<DbChatRow[]>;
  dbGetMessages: (chatId: string) => Promise<DbChatMessage[]>;
  dbCreateChat: (chat: DbChatRow) => Promise<DbChatRow>;
  dbInsertMessage: (msg: DbChatMessage) => Promise<DbChatMessage>;
  dbUpdateChatTitle: (chatId: string, title: string) => Promise<void>;
  dbUpdateChatModelConfig: (chatId: string, config: Pick<DbChatRow, 'model' | 'reasoningEffort'>) => Promise<void>;
  dbTouchChat: (chatId: string) => Promise<void>;
  dbDeleteChat: (chatId: string) => Promise<void>;

  chat: (params: ChatCompletionParams) => Promise<void>;
  onChatDelta: (callback: (chunk: string) => void) => void;
  onChatComplete: (callback: () => void) => void;
  onChatError: (callback: (errorMsg: string) => void) => void;

  searchTavily: (query: string) => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
