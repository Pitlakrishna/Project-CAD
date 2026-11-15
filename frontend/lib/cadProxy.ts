/**
 * Shared upstream proxy helper for Next.js CAD API routes.
 * Resolves CAD_SERVICE_URL / NEXT_PUBLIC_CAD_SERVICE_URL in production and falls back to local ports in dev.
 */

export function getCadUpstreamUrls(path: string): string[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cadBase = process.env.CAD_SERVICE_URL || process.env.NEXT_PUBLIC_CAD_SERVICE_URL;

  if (cadBase && cadBase.trim()) {
    let clean = cadBase.trim().replace(/\/+$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      const isLocal = clean.startsWith("localhost") || clean.startsWith("127.0.0.1");
      clean = `${isLocal ? "http://" : "https://"}${clean}`;
    }
    return [`${clean}${normalizedPath}`];
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CAD_SERVICE_URL environment variable is not configured for production.");
  }

  return [
    `http://127.0.0.1:8002${normalizedPath}`,
    `http://localhost:8002${normalizedPath}`,
  ];
}

export async function fetchCadUpstream(path: string, init: RequestInit = {}): Promise<Response> {
  const urls = getCadUpstreamUrls(path);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
        signal: init.signal ?? AbortSignal.timeout(50000),
      });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to connect to CAD service kernel");
}

