import { NextRequest, NextResponse } from "next/server";
import { fetchCadUpstream } from "../../../../../lib/cadProxy";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params;

  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId parameter" }, { status: 400 });
  }

  try {
    const upstream = await fetchCadUpstream(`/api/v1/cad/scene/${modelId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect to CAD service kernel";
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
