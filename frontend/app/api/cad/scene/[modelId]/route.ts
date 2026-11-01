import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params;

  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId parameter" }, { status: 400 });
  }

  const cadBase = process.env.CAD_SERVICE_URL || process.env.NEXT_PUBLIC_CAD_SERVICE_URL;
  const cadUrls = [
    ...(cadBase ? [`${cadBase.replace(/\/+$/, "")}/api/v1/cad/scene/${modelId}`] : []),
    `http://127.0.0.1:8002/api/v1/cad/scene/${modelId}`,
    `http://localhost:8002/api/v1/cad/scene/${modelId}`,
  ];

  let lastError: any = null;

  for (const url of cadUrls) {
    try {
      const upstream = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
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
}
