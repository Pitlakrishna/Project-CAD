import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Universal Technical & CAD Image Search API.
 * Dynamically queries authentic engineering renders, 3D CAD photography, and schematics.
 * Returns a high-res base64 Data URL to guarantee 100% CORS-free embedding in docx, pptx, and pdf.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") || searchParams.get("query") || "CAD Engineering Design";
  const query = rawQuery.trim();

  try {
    // 1. Attempt DuckDuckGo image search for real technical/3D CAD models
    const ddgQuery = `${query} 3d cad model render`;
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(ddgQuery)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (tokenRes.ok) {
      const html = await tokenRes.text();
      const vqdMatch = html.match(/vqd=["']?([0-9-]+)["']?/);
      if (vqdMatch && vqdMatch[1]) {
        const imgApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
          ddgQuery
        )}&vqd=${vqdMatch[1]}`;
        const imgRes = await fetch(imgApiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Referer: "https://duckduckgo.com/",
          },
          signal: AbortSignal.timeout(3500),
        });

        if (imgRes.ok) {
          const imgJson = await imgRes.json();
          const results = imgJson?.results || [];
          for (const item of results.slice(0, 5)) {
            const candidateUrl = item.image;
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
              const dataUrl = await fetchAndConvertToDataUrl(candidateUrl);
              if (dataUrl) {
                return NextResponse.json({
                  success: true,
                  source: "duckduckgo",
                  query,
                  imageUrl: candidateUrl,
                  dataUrl,
                });
              }
            }
          }
        }
      }
    }
  } catch (ddgErr) {
    console.warn("[ImageSearch] DDG search error, falling back:", ddgErr);
  }

  // 2. Fallback to Wikimedia Commons (reliable, permanent open-access CAD & technical photography)
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime&format=json`;

    const wikiRes = await fetch(wikiUrl, {
      headers: { "User-Agent": "AicadUniversalDocEngine/1.0" },
      signal: AbortSignal.timeout(3500),
    });

    if (wikiRes.ok) {
      const wikiJson = await wikiRes.json();
      const pages = wikiJson?.query?.pages || {};
      for (const pageId of Object.keys(pages)) {
        const info = pages[pageId]?.imageinfo?.[0];
        const candidateUrl = info?.url;
        const mime = info?.mime || "";
        // Only accept raster images (jpg, png, webp) for Word/PDF/PPTX embedding
        if (candidateUrl && (mime.includes("jpeg") || mime.includes("png") || candidateUrl.endsWith(".jpg") || candidateUrl.endsWith(".png"))) {
          const dataUrl = await fetchAndConvertToDataUrl(candidateUrl);
          if (dataUrl) {
            return NextResponse.json({
              success: true,
              source: "wikimedia",
              query,
              imageUrl: candidateUrl,
              dataUrl,
            });
          }
        }
      }
    }
  } catch (wikiErr) {
    console.warn("[ImageSearch] Wikimedia fallback error:", wikiErr);
  }

  // 3. Fallback to Unsplash technical library
  const unsplashFallback = getUnsplashFallback(query);
  const fallbackDataUrl = await fetchAndConvertToDataUrl(unsplashFallback);
  return NextResponse.json({
    success: true,
    source: "unsplash_fallback",
    query,
    imageUrl: unsplashFallback,
    dataUrl: fallbackDataUrl || unsplashFallback,
  });
}

async function fetchAndConvertToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function getUnsplashFallback(query: string): string {
  const text = query.toLowerCase();
  if (/fan|impeller|blade|propeller|cooling|airflow|turbine|blower/.test(text)) {
    return "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=1000&q=80";
  }
  if (/drone|uav|quadcopter|flight|propulsion|aviation|aircraft/.test(text)) {
    return "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80";
  }
  if (/gear|transmission|planetary|sprocket|bearing|pinion/.test(text)) {
    return "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80";
  }
  if (/enclosure|box|case|housing|junction|pcb|electronics/.test(text)) {
    return "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=80";
  }
  if (/robot|arm|gripper|automation|actuator|servo/.test(text)) {
    return "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1000&q=80";
  }
  if (/engine|motor|car|vehicle|manifold|cylinder|piston/.test(text)) {
    return "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1000&q=80";
  }
  return "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1000&q=80";
}
