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
  engine_mode?: "auto" | "cad" | "threejs" | "hybrid" | string;
  replicad_code: string;
  threejs_code?: string;
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
  tool_calls?: ToolCallResult[];
}

export interface PhysicalMaterial {
  id: string;
  name: string;
  category: "metal" | "plastic" | "glass" | "rubber" | "composite" | "ceramic";
  density: number; // kg/m³
  youngsModulus: number; // GPa
  yieldStrength: number; // MPa
  ultimateStrength?: number; // MPa
  thermalConductivity?: number; // W/(m·K)
  costPerKg: number; // USD / kg
  standard: string; // ASTM / ISO
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  ior?: number;
}

export interface PartPhysicsMetric {
  name: string;
  material: string;
  materialName: string;
  densityKgM3: number;
  volumeMm3: number;
  massKg: number;
  surfaceAreaMm2: number;
  costUsd: number;
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
  surfaceAreaMm2?: number;
  massKg?: number;
  centerOfMass?: [number, number, number];
  momentsOfInertia?: {
    Ixx: number;
    Iyy: number;
    Izz: number;
  };
  material?: string;
  materialName?: string;
  estimatedCostUsd?: number;
  vertexCount: number;
  triangleCount: number;
  faceCount?: number;
  parts?: PartPhysicsMetric[];
}

export interface CadGeometryResponse {
  status: "success" | "error";
  modelId: string;
  engine_mode?: "auto" | "cad" | "threejs" | "hybrid" | string;
  threejs_code?: string;
  metrics: CadGeometryMetrics;
  cached: boolean;
  executionTimeMs: number;
  availableExports: string[];
}

export interface CadScenePart {
  name: string;
  color: string;
  material: string;
  opacity: number;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  transparent: boolean;
  stlBase64: string;
}

export interface CadSceneResponse {
  status: "success" | "error";
  modelId: string;
  engine_mode?: "auto" | "cad" | "threejs" | "hybrid" | string;
  threejs_code?: string;
  metrics: CadGeometryMetrics;
  parts: CadScenePart[];
  availableExports: string[];
}

export interface DocumentTheme {
  primary: string;
  accent: string;
  font: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface DocumentSection {
  heading: string;
  content?: string;
  bullets?: string[];
  table?: TableData;
}

export interface Signoff {
  role: string;
  responsibility?: string;
  criteria?: string;
  status?: string;
}

export interface DocxArtifactData {
  title: string;
  doc_id?: string;
  theme?: DocumentTheme;
  image_query?: string;
  executive_summary?: string;
  sections: DocumentSection[];
  signoffs?: Signoff[];
}

export interface SpreadsheetSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface XlsxArtifactData {
  title: string;
  theme?: DocumentTheme;
  sheets: SpreadsheetSheet[];
}

export interface PresentationSlide {
  title: string;
  bullets?: string[];
  table?: TableData;
  notes?: string;
}

export interface PptxArtifactData {
  title: string;
  theme?: DocumentTheme;
  image_query?: string;
  slides: PresentationSlide[];
}

export type PdfArtifactData = DocxArtifactData;

export interface CsvArtifactData {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
}

export type ArtifactData =
  | DocxArtifactData
  | XlsxArtifactData
  | PptxArtifactData
  | PdfArtifactData
  | CsvArtifactData
  | Record<string, unknown>
  | string;

export interface ToolCallResult {
  tool_name: string;
  filename: string;
  artifact_type: "docx" | "xlsx" | "pptx" | "pdf" | "csv" | "md" | "txt" | string;
  title: string;
  data: ArtifactData;
}

export interface FileArtifact {
  id: string;
  filename: string;
  type: "docx" | "xlsx" | "pptx" | "pdf" | "csv" | "md" | "txt" | string;
  title: string;
  data: ArtifactData;
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
  cadError?: string;
  thoughts?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  artifacts?: FileArtifact[];
  toolCalls?: ToolCallResult[];
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

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}
