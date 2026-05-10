export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  reasoningEffort: string;
  createdAt: number;
  updatedAt: number;
  messages?: ChatMessage[];
}
