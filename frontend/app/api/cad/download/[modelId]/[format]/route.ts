import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string; format: string }> }
) {
  const { modelId, format } = await params;

  if (!modelId || !format) {
    return NextResponse.json({ error: "Missing modelId or format parameter" }, { status: 400 });
  }

  const cadBase = process.env.CAD_SERVICE_URL || process.env.NEXT_PUBLIC_CAD_SERVICE_URL;
  const cadUrls = [
    ...(cadBase ? [`${cadBase.replace(/\/+$/, "")}/api/v1/cad/download/${modelId}/${format}`] : []),
    `http://127.0.0.1:8002/api/v1/cad/download/${modelId}/${format}`,
    `http://localhost:8002/api/v1/cad/download/${modelId}/${format}`,
  ];

  let lastError: any = null;

  for (const url of cadUrls) {
    try {
      const upstream = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!upstream.ok) {
        const errorJson = await upstream.json().catch(() => ({}));
        return NextResponse.json(errorJson, { status: upstream.status });
      }

      const blob = await upstream.arrayBuffer();
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentDisposition = upstream.headers.get("content-disposition") || `attachment; filename="${modelId}.${format}"`;

      return new NextResponse(blob, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": contentDisposition,
          "Content-Length": blob.byteLength.toString(),
        },
      });
    } catch (err: any) {
      lastError = err;
    }
  }

  return NextResponse.json(
    {
      error: lastError?.message || "Failed to download CAD export",
    },
    { status: 502 }
  );
}
