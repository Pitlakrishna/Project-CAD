import { NextRequest, NextResponse } from "next/server";
import { fetchCadUpstream } from "../../../../lib/cadProxy";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const upstream = await fetchCadUpstream("/api/v1/cad/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error("Failed to connect to CAD export service");
    const status = error.name === "SyntaxError" ? 400 : 502;
    return NextResponse.json(
      { error: error.message },
      { status }
    );
  }
}

