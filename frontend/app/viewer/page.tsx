"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fetchCadScene, generateModelGeometry } from "../../lib/api";
import { CadSceneResponse } from "../../lib/types";
import { loadSessions } from "../../lib/storage";

const StudioViewer3D = dynamic(
  () => import("../../components/StudioViewer3D").then((m) => m.StudioViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0f1115] text-white">
        <div className="w-12 h-12 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin mb-3" />
        <span className="text-xs text-zinc-400 font-mono">Initializing 3D Studio Engine...</span>
      </div>
    ),
  }
);

function ViewerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modelId = searchParams.get("modelId");

  const [sceneData, setSceneData] = useState<CadSceneResponse | null>(null);
  const [userPrompt, setUserPrompt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [recovering, setRecovering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) {
      setError("No modelId provided in the URL.");
      setLoading(false);
      return;
    }
    let isCancelled = false;

    async function loadScene() {
      try {
        setLoading(true);
        setError(null);

        let data: CadSceneResponse | null = null;
        try {
          data = await fetchCadScene(modelId!);
        } catch (fetchErr) {
          console.warn("[3D Studio] Direct fetch failed:", fetchErr);
        }

        if (!data || data.status !== "success" || !data.parts || data.parts.length === 0) {
          const sessions = loadSessions();
          let matchedScript: string | null = null;
          let matchedParams: Record<string, any> = {};
          let matchedPrompt: string | undefined = undefined;

          for (const session of sessions) {
            for (const msg of session.messages) {
              if (
                msg.geometry?.modelId === modelId ||
                msg.geometry?.modelId?.startsWith(modelId!)
              ) {
                if (msg.cadResponse?.replicad_code) {
                  matchedScript = msg.cadResponse.replicad_code;
                  matchedParams = msg.cadResponse.parameters || {};
                  matchedPrompt = msg.userPrompt;
                  break;
                }
              }
            }
            if (matchedScript) break;
          }

          if (matchedScript) {
            if (!isCancelled) setRecovering(true);
            const regenerated = await generateModelGeometry(matchedScript, matchedParams);
            if (regenerated && regenerated.status === "success") {
              const activeId = regenerated.modelId || modelId;
              data = await fetchCadScene(activeId!);
              if (matchedPrompt && !isCancelled) {
                setUserPrompt(matchedPrompt);
              }
            }
          }
        }

        if (!isCancelled) {
          if (data && data.status === "success" && data.parts && data.parts.length > 0) {
            setSceneData(data);
          } else {
            setError("CAD model scene could not be found or has expired from the server cache.");
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err?.message || "Failed to load 3D CAD scene from server.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setRecovering(false);
        }
      }
    }

    loadScene();
    return () => {
      isCancelled = true;
    };
  }, [modelId]);

  if (loading || recovering) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0f1115] text-white">
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
          <div className="w-16 h-16 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
          {recovering ? "Auto-Compiling 3D OpenCASCADE Geometry..." : "Loading 3D Studio & Mesh..."}
        </h2>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          Model ID: #{modelId ? modelId.slice(0, 8) : "..."}
        </p>
      </div>
    );
  }

  if (error || !sceneData) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0f1115] text-white p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-white mb-2">3D Scene Unavailable</h2>
        <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6 font-mono">
          {error || "The requested CAD model geometry is not currently cached in memory."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          Return to CAD Assistant
        </button>
      </div>
    );
  }

  return (
    <StudioViewer3D
      sceneData={sceneData}
      userPrompt={userPrompt}
      onBackToChat={() => router.push("/")}
    />
  );
}

export default function GenericViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen flex items-center justify-center bg-[#0f1115] text-white">
          <div className="w-8 h-8 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
      }
    >
      <ViewerContent />
    </Suspense>
  );
}
