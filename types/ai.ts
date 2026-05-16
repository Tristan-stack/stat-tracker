export type AiChatRole = 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiSuggestedFilters {
  entryMcapMin?: number;
  entryMcapMax?: number;
  minHighPercent?: number;
  maxLossPercent?: number;
  recentWindowDays?: 7 | 14 | 30;
  avoidStatuses?: string[];
}

export interface AiStrategyPayload {
  recommendedStrategy: string;
  suggestedFilters: AiSuggestedFilters;
  riskNotes: string[];
  trendShiftWarning: string | null;
  validUntil: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface RuggerAiChatRequest {
  ruggerId: string;
  messages: AiChatMessage[];
}

export interface RuggerAiChatResponse {
  answer: string;
  strategy: AiStrategyPayload;
  context: {
    tokenCount: number;
    generatedAt: string;
    source: 'gemini' | 'fallback';
  };
}
