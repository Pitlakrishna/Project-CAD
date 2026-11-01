import { AppSettings, CadGenerationResponse, CadGeometryResponse, CadSceneResponse, ChatHistoryMessage, ProviderType } from "./types";

export function getProviderParams(settings: AppSettings, providerOverride?: ProviderType) {
  const provider = providerOverride || settings.selectedProvider;
  let apiKey: string | undefined = undefined;
  let chatModel: string | undefined = undefined;
  let cadModel: string | undefined = undefined;
  let baseUrl: string | undefined = undefined;

  if (provider === "anthropic") {
    apiKey = settings.anthropicApiKey || undefined;
    chatModel = settings.anthropicChatModel || undefined;
    cadModel = settings.anthropicCadModel || undefined;
  } else if (provider === "openai") {
    apiKey = settings.openaiApiKey || undefined;
    chatModel = settings.openaiChatModel || undefined;
    cadModel = settings.openaiCadModel || undefined;
    baseUrl = settings.openaiBaseUrl || undefined;
  } else if (provider === "gemini") {
    apiKey = settings.geminiApiKey || undefined;
    chatModel = settings.geminiChatModel || undefined;
    cadModel = settings.geminiCadModel || undefined;
  } else if (provider === "groq") {
    apiKey = settings.groqApiKey || undefined;
    chatModel = settings.groqChatModel || undefined;
    cadModel = settings.groqCadModel || undefined;
    baseUrl = undefined; // Backend configures default Groq API endpoint
  } else if (provider === "deepseek") {
    apiKey = settings.deepseekApiKey || undefined;
    chatModel = settings.deepseekChatModel || undefined;
    cadModel = settings.deepseekCadModel || undefined;
    baseUrl = settings.deepseekBaseUrl || undefined;
  } else if (provider === "ollama") {
    chatModel = settings.ollamaModel || undefined;
    cadModel = settings.ollamaModel || undefined;
    baseUrl = settings.ollamaBaseUrl || undefined;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Provider": provider,
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
    if (provider === "openai") headers["X-OpenAI-API-Key"] = apiKey;
    if (provider === "anthropic") headers["X-Anthropic-API-Key"] = apiKey;
    if (provider === "gemini") headers["X-Gemini-API-Key"] = apiKey;
    if (provider === "groq") headers["X-Groq-API-Key"] = apiKey;
    if (provider === "deepseek") headers["X-DeepSeek-API-Key"] = apiKey;
  }

  if (chatModel) {
    headers["X-Chat-Model"] = chatModel;
  }
  if (cadModel) {
    headers["X-CAD-Model"] = cadModel;
  }
  if (baseUrl) {
    headers["X-Base-URL"] = baseUrl;
  }

  return { provider, apiKey, chatModel, cadModel, baseUrl, headers };
}

export async function generateCad(
  prompt: string,
  settings: AppSettings,
  constraints?: Record<string, any>,
  history?: ChatHistoryMessage[],
  enableSearch?: boolean,
  engineMode?: "auto" | "cad" | "threejs"
): Promise<CadGenerationResponse> {
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const endpoint = `${backendUrl}/api/v1/llm/generate`;

  const { provider, apiKey, chatModel, cadModel, baseUrl, headers } = getProviderParams(settings);

  const payload: Record<string, any> = {
    prompt,
    history: history && history.length > 0 ? history : undefined,
    provider,
    chat_model: chatModel,
    cad_model: cadModel,
    api_key: apiKey,
    base_url: baseUrl,
    temperature: settings.temperature,
    constraints: constraints || {},
    enable_search: enableSearch ?? undefined,
    engine_mode: engineMode || "auto",
  };

  try {
    const response = await robustFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = `Server error ${response.status}`;
      try {
        const errorJson = await response.json();
        errorMsg = parseDetailMessage(errorJson.detail, errorMsg);
      } catch {
        // fallback to status text
      }
      throw new Error(formatErrorMessage(errorMsg, provider));
    }

    return await response.json();
  } catch (err: any) {
    throw err;
  }
}

export async function refineCad(
  prompt: string,
  previousCode: string,
  previousParameters: Record<string, any>,
  settings: AppSettings,
  history?: ChatHistoryMessage[],
  enableSearch?: boolean,
  engineMode?: "auto" | "cad" | "threejs"
): Promise<CadGenerationResponse> {
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const endpoint = `${backendUrl}/api/v1/llm/refine`;

  const { provider, apiKey, chatModel, cadModel, baseUrl, headers } = getProviderParams(settings);

  const payload: Record<string, any> = {
    prompt,
    history: history && history.length > 0 ? history : undefined,
    previous_code: previousCode,
    previous_parameters: previousParameters,
    provider,
    chat_model: chatModel,
    cad_model: cadModel,
    api_key: apiKey,
    base_url: baseUrl,
    enable_search: enableSearch ?? undefined,
    engine_mode: engineMode || "auto",
  };

  try {
    const response = await robustFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = `Server error ${response.status}`;
      try {
        const errorJson = await response.json();
        errorMsg = parseDetailMessage(errorJson.detail, errorMsg);
      } catch {
        // fallback
      }
      throw new Error(formatErrorMessage(errorMsg, provider));
    }

    return await response.json();
  } catch (err: any) {
    throw err;
  }
}

export async function verifyProviderCredentials(
  settings: AppSettings,
  providerOverride?: ProviderType
): Promise<{ ok: boolean; message: string }> {
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const endpoint = `${backendUrl}/api/v1/llm/verify-key`;

  const { provider, apiKey, chatModel, baseUrl, headers } = getProviderParams(settings, providerOverride);

  const payload = {
    provider,
    api_key: apiKey,
    model: chatModel,
    base_url: baseUrl,
  };

  try {
    const response = await robustFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = `Server error ${response.status}`;
      try {
        const errorJson = await response.json();
        errorMsg = errorJson.detail || errorMsg;
      } catch {
        // fallback
      }
      return { ok: false, message: errorMsg };
    }

    const data = await response.json();
    return {
      ok: Boolean(data.valid),
      message: data.message || (data.valid ? "Credentials verified successfully!" : "Credential verification failed."),
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message?.includes("Failed to fetch")
        ? `Unable to reach CAD service at ${backendUrl}. Check backend connection.`
        : err.message || "Failed to verify credentials",
    };
  }
}

export async function checkBackendHealth(backendUrl: string): Promise<{ ok: boolean; message: string; data?: any }> {
  const cleanUrl = backendUrl.replace(/\/+$/, "");
  try {
    const res = await robustFetch(`${cleanUrl}/api/v1/llm/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, message: `Connected! Provider: ${data.provider}, Status: ${data.status}`, data };
    }
    return { ok: false, message: `Server returned HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, message: e.message || "Failed to reach backend service" };
  }
}

function parseDetailMessage(detail: any, defaultMsg: string): string {
  if (!detail) return defaultMsg;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg || (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
  }
  if (typeof detail === "object" && detail.msg) return detail.msg;
  return defaultMsg;
}

export function formatErrorMessage(errText: string, provider?: string): string {
  const clean = (errText || "").trim();
  const lower = clean.toLowerCase();

  // 1. Context Window Limit Exceeded detection across all providers
  if (
    lower.includes("context window limit") ||
    lower.includes("reduce the length") ||
    lower.includes("context_length") ||
    lower.includes("context length") ||
    lower.includes("maximum context length") ||
    lower.includes("prompt is too long") ||
    lower.includes("prompt_too_long") ||
    lower.includes("too many tokens") ||
    lower.includes("input is too long") ||
    lower.includes("string too long") ||
    lower.includes("exceeds the context window") ||
    lower.includes("context window") ||
    lower.includes("payload size exceeds") ||
    lower.includes("exceeds the maximum allowed tokens") ||
    lower.includes("token count exceeds") ||
    (lower.includes("param") && lower.includes("messages")) ||
    lower.includes("messages or completion")
  ) {
    if (lower.includes("how to resolve")) {
      return clean;
    }
    const provName = provider ? provider.toUpperCase() : "LLM";
    return (
      `Context Window Limit Exceeded (${provName}): The conversation history, 3D CAD model, or prompt exceeds the provider's token limit.\n\n` +
      "How to resolve:\n" +
      "1. Click New Chat (+) in the sidebar to start fresh and reset the context window.\n" +
      "2. Switch to Google Gemini in Settings (⚙️) for a 1,000,000+ token free context window.\n" +
      "3. If using Groq, upgrade to Pay-As-You-Go in the GroqCloud Console for 128k context, or shorten earlier turns."
    );
  }

  // 2. Model terms acceptance required
  if (
    lower.includes("terms acceptance") ||
    lower.includes("model_terms_required") ||
    lower.includes("accept the terms") ||
    lower.includes("requires terms")
  ) {
    return "Model terms required: The selected model requires terms acceptance in the provider's console. Please accept the terms or switch to another model in Settings (⚙️).";
  }

  // 3. Rate limit / Quota exceeded error detection across all providers
  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("credit balance") ||
    lower.includes("insufficient_quota")
  ) {
    return "Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings.";
  }

  // 2. Authentication error
  if (
    lower.includes("api_key") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return "Authentication failed: Invalid or missing API key. Please check your credentials in Settings.";
  }

  // 3. Upstream timeout / Deadline exceeded error
  if (
    lower.includes("504") ||
    lower.includes("deadline_exceeded") ||
    lower.includes("deadline expired") ||
    lower.includes("deadline") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return `Upstream service timeout: The ${provider ? provider.toUpperCase() : "AI"} service took longer than expected to complete. Please retry or select another provider in Settings.`;
  }

  // 3. Network error
  if (
    !clean ||
    lower === "network error" ||
    lower.includes("failed to fetch") ||
    lower.includes("cannot connect")
  ) {
    return `Network error: Unable to connect to ${provider ? provider.toUpperCase() : "AI"} service. Please check your internet connection and API key.`;
  }

  return clean;
}


async function robustFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err: any) {
    // If localhost failed (common Windows IPv6 resolution issue where uvicorn binds to 127.0.0.1), fallback
    if (url.includes("localhost:8000")) {
      try {
        const fallbackUrl = url.replace("localhost:8000", "127.0.0.1:8000");
        return await fetch(fallbackUrl, options);
      } catch { }
    } else if (url.includes("127.0.0.1:8000")) {
      try {
        const fallbackUrl = url.replace("127.0.0.1:8000", "localhost:8000");
        return await fetch(fallbackUrl, options);
      } catch { }
    }
    throw new Error(
      `Cannot connect to backend server at ${url}. Please verify that the backend is running.`
    );
  }
}

async function streamSseHelper(
  endpoint: string,
  payload: Record<string, any>,
  headers: Record<string, string>,
  onThought: (chunk: string) => void,
  onToken: (chunk: string) => void,
  onReset?: () => void
): Promise<CadGenerationResponse> {
  const requestHeaders = {
    ...headers,
    Accept: "text/event-stream",
  };

  const response = await robustFetch(endpoint, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = `Server error ${response.status}`;
    try {
      const errorJson = await response.json();
      errorMsg = parseDetailMessage(errorJson.detail, errorMsg);
    } catch { }
    throw new Error(formatErrorMessage(errorMsg, payload.provider));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported by your browser or server");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: CadGenerationResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      try {
        const data = JSON.parse(jsonStr);
        if (data.type === "reset") {
          onReset?.();
        } else if (data.type === "thought" && data.content) {
          onThought(data.content);
        } else if (data.type === "token" && data.content) {
          onToken(data.content);
        } else if (data.type === "done" && data.metadata) {
          finalResult = data.metadata as CadGenerationResponse;
        } else if (data.type === "error" && data.error) {
          throw new Error(formatErrorMessage(data.error, payload.provider));
        }
      } catch (e: any) {
        if (e.message && !e.message.includes("JSON")) throw e;
      }
    }
  }

  // Process any remaining text in buffer after stream ends
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const data = JSON.parse(jsonStr);
        if (data.type === "reset") {
          onReset?.();
        } else if (data.type === "thought" && data.content) {
          onThought(data.content);
        } else if (data.type === "token" && data.content) {
          onToken(data.content);
        } else if (data.type === "done" && data.metadata) {
          finalResult = data.metadata as CadGenerationResponse;
        }
      } catch { }
    }
  }

  if (!finalResult) {
    // Graceful fallback so partial/streamed text is preserved even if connection closed
    finalResult = {
      prompt_id: "stream-" + Date.now(),
      replicad_code: "",
      raw_explanation: "",
      parameters: {},
      parameter_definitions: [],
      parts: [],
      materials_used: [],
      has_glass: false,
      provider: payload.provider || "llm",
      model: payload.model || "default",
      token_usage: 0,
      cached: false,
    };
  }

  return finalResult;
}

export async function generateCadStream(
  prompt: string,
  settings: AppSettings,
  onThought: (chunk: string) => void,
  onToken: (chunk: string) => void,
  onReset?: () => void,
  constraints?: Record<string, any>,
  history?: ChatHistoryMessage[],
  enableSearch?: boolean,
  engineMode?: "auto" | "cad" | "threejs"
): Promise<CadGenerationResponse> {
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const endpoint = `${backendUrl}/api/v1/llm/generate/stream`;
  const { provider, apiKey, chatModel, cadModel, baseUrl, headers } = getProviderParams(settings);

  const payload: Record<string, any> = {
    prompt,
    history: history && history.length > 0 ? history : undefined,
    provider,
    chat_model: chatModel,
    cad_model: cadModel,
    api_key: apiKey,
    base_url: baseUrl,
    temperature: settings.temperature,
    constraints: constraints || {},
    enable_search: enableSearch ?? undefined,
    engine_mode: engineMode || "auto",
  };

  return streamSseHelper(endpoint, payload, headers, onThought, onToken, onReset);
}

export async function refineCadStream(
  prompt: string,
  previousCode: string,
  previousParameters: Record<string, any>,
  settings: AppSettings,
  onThought: (chunk: string) => void,
  onToken: (chunk: string) => void,
  onReset?: () => void,
  history?: ChatHistoryMessage[],
  enableSearch?: boolean,
  engineMode?: "auto" | "cad" | "threejs"
): Promise<CadGenerationResponse> {
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const endpoint = `${backendUrl}/api/v1/llm/refine/stream`;
  const { provider, apiKey, chatModel, cadModel, baseUrl, headers } = getProviderParams(settings);

  const payload: Record<string, any> = {
    prompt,
    history: history && history.length > 0 ? history : undefined,
    previous_code: previousCode,
    previous_parameters: previousParameters,
    provider,
    chat_model: chatModel,
    cad_model: cadModel,
    api_key: apiKey,
    base_url: baseUrl,
    enable_search: enableSearch ?? undefined,
    engine_mode: engineMode || "auto",
  };

  return streamSseHelper(endpoint, payload, headers, onThought, onToken, onReset);
}

export function getCadDownloadUrl(
  modelId: string,
  format: "step" | "stl" | "dxf",
  baseUrl: string = "http://localhost:8002"
): string {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  return `${cleanUrl}/api/v1/cad/download/${modelId}/${format}`;
}

export async function downloadCadFileBlob(
  modelId: string,
  format: "step" | "stl" | "dxf",
  cadResponse?: CadGenerationResponse | null,
  baseUrl: string = "http://localhost:8002"
): Promise<Blob> {
  const isBrowser = typeof window !== "undefined";
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const urlsToTry: string[] = [];

  if (isBrowser) {
    urlsToTry.push(`/api/cad/download/${modelId}/${format}`);
  }
  urlsToTry.push(`${cleanUrl}/api/v1/cad/download/${modelId}/${format}`);
  if (cleanUrl.includes("localhost:8002")) {
    urlsToTry.push(cleanUrl.replace("localhost:8002", "127.0.0.1:8002") + `/api/v1/cad/download/${modelId}/${format}`);
  }

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res && res.ok) {
        return await res.blob();
      }
    } catch {
      // try next
    }
  }


  // Fallback: If in-memory cache expired on cad-service, re-export on the fly
  if (cadResponse?.replicad_code) {
    const tryExport = async (targetHost: string) => {
      const exportRes = await fetch(`${targetHost}/api/v1/cad/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: cadResponse.replicad_code,
          parameters: cadResponse.parameters || {},
          format,
        }),
      });
      if (!exportRes.ok) return null;
      const data = await exportRes.json();
      if (!data.downloadUrl) return null;
      const retryRes = await fetch(`${targetHost}${data.downloadUrl}`);
      if (retryRes.ok) {
        return await retryRes.blob();
      }
      return null;
    };

    let blob = await tryExport(cleanUrl).catch(() => null);
    if (!blob && cleanUrl.includes("localhost:8002")) {
      blob = await tryExport("http://127.0.0.1:8002").catch(() => null);
    }
    if (blob) return blob;
  }

  throw new Error(`Failed to download ${format.toUpperCase()} file`);
}


export async function generateModelGeometry(
  script: string,
  parameters: Record<string, any> = {},
  cadServiceUrl?: string
): Promise<CadGeometryResponse | null> {
  const isBrowser = typeof window !== "undefined";
  const urlsToTry: string[] = [];

  if (cadServiceUrl) {
    const clean = cadServiceUrl.replace(/\/+$/, "");
    urlsToTry.push(`${clean}/api/v1/cad/generate`);
    if (clean.includes("localhost:8002")) {
      urlsToTry.push(clean.replace("localhost:8002", "127.0.0.1:8002") + "/api/v1/cad/generate");
    }
  }

  if (isBrowser) {
    urlsToTry.unshift("/api/cad/generate");
  }
  if (!cadServiceUrl) {
    urlsToTry.push("http://127.0.0.1:8002/api/v1/cad/generate");
    urlsToTry.push("http://localhost:8002/api/v1/cad/generate");
  }

  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, parameters }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return (await res.json()) as CadGeometryResponse;
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = new Error(errData.error || `CAD service error (${res.status})`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export async function fetchCadScene(
  modelId: string,
  cadServiceUrl?: string
): Promise<CadSceneResponse | null> {
  const isBrowser = typeof window !== "undefined";
  const urlsToTry: string[] = [];

  if (cadServiceUrl) {
    const clean = cadServiceUrl.replace(/\/+$/, "");
    urlsToTry.push(`${clean}/api/v1/cad/scene/${modelId}`);
    if (clean.includes("localhost:8002")) {
      urlsToTry.push(clean.replace("localhost:8002", "127.0.0.1:8002") + `/api/v1/cad/scene/${modelId}`);
    }
  }

  if (isBrowser) {
    urlsToTry.unshift(`/api/cad/scene/${modelId}`);
  }
  if (!cadServiceUrl) {
    urlsToTry.push(`http://127.0.0.1:8002/api/v1/cad/scene/${modelId}`);
    urlsToTry.push(`http://localhost:8002/api/v1/cad/scene/${modelId}`);
  }

  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return (await res.json()) as CadSceneResponse;
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = new Error(errData.error || `CAD service error (${res.status})`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}



