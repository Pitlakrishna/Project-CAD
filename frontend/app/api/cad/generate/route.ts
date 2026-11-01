import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const cadBase = process.env.CAD_SERVICE_URL || process.env.NEXT_PUBLIC_CAD_SERVICE_URL;
    const cadUrls = [
      ...(cadBase ? [`${cadBase.replace(/\/+$/, "")}/api/v1/cad/generate`] : []),
      "http://127.0.0.1:8002/api/v1/cad/generate",
      "http://localhost:8002/api/v1/cad/generate",
    ];

    let lastError: any = null;

    for (const url of cadUrls) {
      try {
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const data = await upstream.json().catch(() => ({}));
        return NextResponse.json(data, { status: upstream.status });
      } catch (err: any) {
        lastError = err;
      }
    }

    return NextResponse.json(
      {
        error: lastError?.message || "Failed to connect to CAD service kernel",
      },
      { status: 502 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid request payload" },
      { status: 400 }
    );
  }
}
