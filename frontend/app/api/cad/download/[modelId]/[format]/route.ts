import { NextRequest, NextResponse } from "next/server";
import { fetchCadUpstream } from "../../../../../../lib/cadProxy";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ modelId: string; format: string }> }
) {
  const { modelId, format } = await params;

  if (!modelId || !format) {
    return NextResponse.json({ error: "Missing modelId or format parameter" }, { status: 400 });
  }

  try {
    const upstream = await fetchCadUpstream(`/api/v1/cad/download/${modelId}/${format}`, {
      method: "GET",
    });

    if (!upstream.ok) {
      const errorJson = await upstream.json().catch(() => ({}));
      return NextResponse.json(errorJson, { status: upstream.status });
    }

    const blob = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentDisposition =
      upstream.headers.get("content-disposition") || `attachment; filename="${modelId}.${format}"`;

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": blob.byteLength.toString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to download CAD export";
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
