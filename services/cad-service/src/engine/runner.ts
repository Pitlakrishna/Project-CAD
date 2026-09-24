import vm from "node:vm";
import ts from "typescript";
import * as replicad from "replicad";
import { config } from "../config.js";
import { initKernel } from "./kernel.js";
import { extractGeometryMetrics, GeometryMetrics } from "./metrics.js";
import { makeBox, makeCone, makeTorus, sketchOnPlane } from "./primitives.js";

// Enhanced replicad namespace with industrial-grade CAD primitives
const enhancedReplicad: Record<string, any> = {
  ...replicad,
  makeBox,
  makeCone,
  makeTorus,
  sketchOnPlane,
  makeBaseBox: (replicad as any).makeBaseBox || makeBox,
  makeCylinder: (replicad as any).makeCylinder,
  makeSphere: (replicad as any).makeSphere,
  draw: (replicad as any).draw,
  drawCircle: (replicad as any).drawCircle,
  drawRectangle: (replicad as any).drawRectangle,
  drawRoundedRectangle: (replicad as any).drawRoundedRectangle,
};

export interface ExecutionResult {
  shape: any;
  metrics: GeometryMetrics;
  executionTimeMs: number;
}

/**
 * Strips markdown fences and transpiles TypeScript / ES Module syntax into CommonJS.
 */
function normalizeScript(rawScript: string): string {
  let script = rawScript.trim().replace(/\r\n/g, "\n");

  // Extract from markdown code fence if present
  const codeBlockMatch = script.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    script = codeBlockMatch[1].trim();
  } else {
    // Strip partial or unmatched fences
    script = script.replace(/^```[a-zA-Z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  // Use TypeScript's native compiler to reliably transpile TS types & ESM exports into clean CommonJS
  try {
    const transpiled = ts.transpileModule(script, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        allowJs: true,
      },
    });
    return transpiled.outputText;
  } catch (tsErr) {
    console.warn("[cad-runner] TypeScript transpile fallback:", tsErr);
    return script;
  }
}

/**
 * Executes a Replicad script inside a sandboxed VM with timeout protection.
 */
export async function executeReplicadScript(
  rawScript: string,
  parameters: Record<string, any> = {}
): Promise<ExecutionResult> {
  // Ensure OpenCASCADE WASM kernel is ready
  await initKernel();

  const startTime = Date.now();
  const transformedScript = normalizeScript(rawScript);

  // Create sandbox environment
  const sandboxModule = { exports: {} as any };
  const sandboxExports: Record<string, any> = {};

  const sandbox: Record<string, any> = {
    // Inject entire replicad library namespace + polyfills
    replicad: enhancedReplicad,
    ...enhancedReplicad,
    makeBox,
    makeCone,
    makeTorus,
    sketchOnPlane,
    require: (modName: string) => {
      if (modName === "replicad" || modName === "@replicad/replicad") {
        return enhancedReplicad;
      }
      throw new Error(`Unauthorized module import: '${modName}'`);
    },
    // Standard JS math & types
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Date,
    console: {
      log: (...args: any[]) => console.log("[cad-script]", ...args),
      warn: (...args: any[]) => console.warn("[cad-script]", ...args),
      error: (...args: any[]) => console.error("[cad-script]", ...args),
    },
    module: sandboxModule,
    exports: sandboxExports,
    params: parameters,
    parameters,
  };

  const context = vm.createContext(sandbox);

  let evaluatedResult: any;
  try {
    const scriptObj = new vm.Script(transformedScript, {
      filename: "replicad_model.js",
    });

    evaluatedResult = scriptObj.runInContext(context, {
      timeout: config.executionTimeoutMs,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("Script execution timed out")) {
      throw new Error(`Execution timeout: Script exceeded ${config.executionTimeoutMs}ms limit`);
    }
    throw new Error(`Script compilation/execution error: ${msg}`);
  }

  // Determine the shape from exports.default, module.exports, main function, or evaluatedResult
  let finalShape: any =
    sandboxExports.default ||
    sandboxModule.exports?.default ||
    sandboxModule.exports ||
    sandboxExports.main ||
    sandbox.main ||
    evaluatedResult;

  // If defaultParams was exported and user didn't specify some parameters, merge them
  const defaultParams = sandboxExports.defaultParams || sandboxModule.exports?.defaultParams || {};
  const mergedParameters = { ...defaultParams, ...parameters };

  // Make parameters available both in params object and as global identifiers in the sandbox
  Object.assign(sandbox, mergedParameters);
  sandbox.params = mergedParameters;
  sandbox.parameters = mergedParameters;

  try {
    if (typeof finalShape === "function") {
      // If exported a function (like `main(params)`), call it with merged parameters
      finalShape = finalShape(mergedParameters);
    } else if (typeof sandbox.main === "function") {
      finalShape = sandbox.main(mergedParameters);
    } else if (typeof evaluatedResult === "function") {
      finalShape = evaluatedResult(mergedParameters);
    }

    // If shape is a Promise, await it
    if (finalShape && typeof finalShape.then === "function") {
      finalShape = await finalShape;
    }
  } catch (evalErr: any) {
    const msg = evalErr?.message || String(evalErr);
    console.error("[cad-runner] Error executing shape function:", msg);
    throw new Error(`Shape evaluation error: ${msg}`);
  }

  // Handle assemblies or arrays of shapes (e.g. [{ name, shape, color, material }])
  if (Array.isArray(finalShape)) {
    if (finalShape.length === 0) {
      throw new Error("Script returned an empty array of shapes");
    }
    // Extract actual solids if array contains part objects ({ shape, name, ... })
    const shapes = finalShape
      .map((item) => (item && typeof item === "object" && item.shape ? item.shape : item))
      .filter((s) => s && (s.wrapped || s.boundingBox || typeof s.blobSTEP === "function"));

    if (shapes.length === 0) {
      throw new Error("No valid 3D solids found in returned assembly array");
    }

    if (shapes.length > 1 && typeof shapes[0]?.fuse === "function") {
      let combined = shapes[0];
      for (let i = 1; i < shapes.length; i++) {
        if (shapes[i]) {
          try {
            const shapeToFuse = typeof shapes[i].clone === "function" ? shapes[i].clone() : shapes[i];
            combined = combined.fuse(shapeToFuse);
          } catch {
            // If fuse fails, fallback to keeping current combined shape
          }
        }
      }
      finalShape = combined;
    } else {
      finalShape = shapes[0];
    }
  } else if (finalShape && typeof finalShape === "object" && finalShape.shape) {
    // Single part object { name, shape, ... }
    finalShape = finalShape.shape;
  }

  if (!finalShape) {
    throw new Error("Script did not return a valid 3D solid or shape");
  }

  const executionTimeMs = Date.now() - startTime;

  let metrics: GeometryMetrics;
  try {
    metrics = extractGeometryMetrics(finalShape);
  } catch (metricsErr: any) {
    console.warn("[cad-runner] Warning: Metrics extraction failed, using fallback defaults:", metricsErr);
    metrics = {
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0], dimensions: { width: 0, depth: 0, height: 0 } },
      volume: 0,
      vertexCount: 0,
      triangleCount: 0,
    };
  }

  return {
    shape: finalShape,
    metrics,
    executionTimeMs,
  };
}
