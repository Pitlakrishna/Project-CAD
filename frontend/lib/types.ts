export type ProviderType = "openai" | "anthropic" | "gemini" | "groq" | "ollama" | "deepseek";

export interface PartVisualSchema {
  name: string;
  color: string;
  material: "metal" | "plastic" | "glass" | "wood" | "rubber" | "ceramic" | "matte" | "custom" | string;
  opacity: number;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  transparent: boolean;
}

export interface ParameterDefinition {
  name: string;
  default_value: number | string | boolean;
  param_type: string;
  min_value?: number;
  max_value?: number;
  step?: number;
  description?: string;
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface GroundingMetadata {
  search_queries?: string[];
  sources?: GroundingSource[];
}

export interface CadGenerationResponse {
  prompt_id: string;
  replicad_code: string;
  raw_explanation?: string;
  raw_thoughts?: string;
  parameters: Record<string, any>;
  parameter_definitions: ParameterDefinition[];
  parts: PartVisualSchema[];
  materials_used: string[];
  has_glass: boolean;
  provider: string;
  model: string;
  token_usage: number;
  cached: boolean;
  latency_ms?: number;
  grounding_metadata?: GroundingMetadata;
}



export interface CadGeometryMetrics {
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    dimensions: {
      width: number;
      depth: number;
      height: number;
    };
  };
  volume: number;
  vertexCount: number;
  triangleCount: number;
  faceCount?: number;
}

export interface CadGeometryResponse {
  status: "success" | "error";
  modelId: string;
  metrics: CadGeometryMetrics;
  cached: boolean;
  executionTimeMs: number;
  availableExports: string[];
}

export interface FileArtifact {
  id: string;
  filename: string;
  type: "docx" | "xlsx" | "pptx" | "pdf" | "csv" | "md" | "txt" | string;
  title: string;
  data: any; // Structured JSON object or raw string
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  cadResponse?: CadGenerationResponse;
  geometry?: CadGeometryResponse;
  userPrompt?: string;
  error?: string;
  thoughts?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  artifacts?: FileArtifact[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface AppSettings {
  selectedProvider: ProviderType;
  backendUrl: string;
  openaiApiKey: string;
  openaiModel?: string;
  openaiChatModel: string;
  openaiCadModel: string;
  openaiBaseUrl: string;
  anthropicApiKey: string;
  anthropicModel?: string;
  anthropicChatModel: string;
  anthropicCadModel: string;
  geminiApiKey: string;
  geminiModel?: string;
  geminiChatModel: string;
  geminiCadModel: string;
  groqApiKey: string;
  groqModel?: string;
  groqChatModel: string;
  groqCadModel: string;
  deepseekApiKey: string;
  deepseekModel?: string;
  deepseekChatModel: string;
  deepseekCadModel: string;
  deepseekBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  temperature: number;
}
