export interface BaseEvent<T = unknown> {
  eventId: string;
  eventType: string;
  timestamp: string; // ISO 8601
  tenantId?: string;
  payload: T;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  createdAt: string;
}

export interface LlmCodeGeneratedEvent {
  promptId: string;
  userId: string;
  codeSnippet: string;
  tokenUsage: number;
}

export interface CadExportReadyEvent {
  exportId: string;
  modelId: string;
  userId: string;
  format: 'step' | 'stl' | 'dxf';
  downloadUrl: string;
}
