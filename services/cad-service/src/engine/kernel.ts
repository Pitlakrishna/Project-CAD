import path from "node:path";
import { createRequire } from "node:module";
import { setOC } from "replicad";

// Polyfill require, __dirname, and __filename for Emscripten runtime in Node ESM
const require = createRequire(import.meta.url);
const opencascadePkg = path.dirname(require.resolve("replicad-opencascadejs/package.json"));
const opencascadeSrcDir = path.join(opencascadePkg, "src");

if (typeof (globalThis as any).require === "undefined") {
  (globalThis as any).require = require;
}
if (typeof (globalThis as any).__dirname === "undefined") {
  (globalThis as any).__dirname = opencascadeSrcDir;
}
if (typeof (globalThis as any).__filename === "undefined") {
  (globalThis as any).__filename = path.join(opencascadeSrcDir, "replicad_single.js");
}

let isInitialized = false;
let initPromise: Promise<any> | null = null;
let ocInstance: any = null;

/**
 * Initializes the OpenCASCADE WebAssembly CAD kernel singleton.
 * Pre-warms the engine so subsequent geometric evaluations run immediately.
 */
export async function initKernel(): Promise<any> {
  if (isInitialized && ocInstance) {
    return ocInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.log("[cad-engine] Initializing OpenCASCADE WebAssembly kernel...");
    const startTime = Date.now();

    // Dynamically import opencascadejs after Emscripten globals are polyfilled
    // @ts-ignore
    const opencascadeModule: any = await import("replicad-opencascadejs");
    const ocFactory: any = opencascadeModule.default || opencascadeModule;
    ocInstance = await ocFactory();
    setOC(ocInstance);

    // Clean up temporary __dirname on globalThis
    delete (globalThis as any).__dirname;
    delete (globalThis as any).__filename;

    isInitialized = true;
    const elapsed = Date.now() - startTime;
    console.log(`[cad-engine] OpenCASCADE kernel successfully initialized in ${elapsed}ms`);
    return ocInstance;
  })();

  return initPromise;
}

/**
 * Returns the underlying OpenCASCADE WebAssembly instance.
 */
export function getKernelInstance(): any {
  return ocInstance;
}

/**
 * Check if the OpenCASCADE kernel is warm and ready.
 */
export function isKernelReady(): boolean {
  return isInitialized;
}
