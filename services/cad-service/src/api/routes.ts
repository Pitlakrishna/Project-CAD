import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { isKernelReady } from "../engine/kernel.js";
import { executeReplicadScript } from "../engine/runner.js";
import { modelStore } from "../cache/modelStore.js";
import { exportToSTEP } from "../exporters/step.js";
import { exportToSTL } from "../exporters/stl.js";
import { exportToDXF } from "../exporters/dxf.js";

const GenerateModelSchema = z.object({
  script: z.string().min(1, "Script is required"),
  parameters: z.record(z.any()).optional().default({}),
  material: z.string().optional(),
  format: z.string().optional().default("replicad"),
});

const ExportModelSchema = z.object({
  modelId: z.string().optional(),
  script: z.string().optional(),
  parameters: z.record(z.any()).optional().default({}),
  format: z.enum(["step", "stl", "dxf"]),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // 1. Health check
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "cad-service",
      kernelReady: isKernelReady(),
      timestamp: new Date().toISOString(),
    };
  });

  // 2. Generate model geometry & metrics
  app.post("/api/v1/cad/generate", async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = GenerateModelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { script, parameters, material } = parseResult.data;
    const effectiveParams = material ? { ...parameters, __material: material } : parameters;
    const modelId = modelStore.generateModelId(script, effectiveParams);

    try {
      // Check cache first
      let cached = modelStore.get(modelId);
      let executionTimeMs = 0;

      if (!cached) {
        const result = await executeReplicadScript(script, effectiveParams);
        executionTimeMs = result.executionTimeMs;

        cached = {
          modelId,
          shape: result.shape,
          metrics: result.metrics,
          createdAt: Date.now(),
          exports: {},
          parts: result.parts,
        };
        modelStore.set(cached);
      }

      return reply.send({
        status: "success",
        modelId,
        metrics: cached.metrics,
        cached: executionTimeMs === 0,
        executionTimeMs,
        availableExports: ["step", "stl", "dxf"],
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err) || "Failed to generate 3D model";
      console.error("\n❌ [CAD-GENERATE-ERROR]:", errMsg);
      if (err?.stack) {
        console.error(err.stack);
      }
      request.log.warn({ err }, "CAD script evaluation error");
      return reply.status(422).send({
        status: "error",
        errorType: "CAD_EXECUTION_ERROR",
        error: errMsg,
      });
    }
  });

  // 3. Export model to STEP / STL / DXF
  app.post("/api/v1/cad/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ExportModelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { modelId: inputModelId, script, parameters, format } = parseResult.data;
    let modelId = inputModelId;

    if (!modelId && !script) {
      return reply.status(400).send({
        error: "Either modelId or script must be provided for export",
      });
    }

    try {
      if (!modelId && script) {
        modelId = modelStore.generateModelId(script, parameters);
      }

      let cached = modelStore.get(modelId!);

      // If not in cache, compile and execute it now
      if (!cached) {
        if (!script) {
          return reply.status(404).send({
            error: `Model ID '${modelId}' not found in cache. Please provide the script again.`,
          });
        }

        const result = await executeReplicadScript(script, parameters);
        cached = {
          modelId: modelId!,
          shape: result.shape,
          metrics: result.metrics,
          createdAt: Date.now(),
          exports: {},
        };
        modelStore.set(cached);
      }

      // Check if export format is already generated
      let exportBuffer = cached.exports[format];

      if (!exportBuffer) {
        if (format === "step") {
          exportBuffer = await exportToSTEP(cached.shape);
        } else if (format === "stl") {
          exportBuffer = await exportToSTL(cached.shape);
        } else if (format === "dxf") {
          exportBuffer = await exportToDXF(cached.shape);
        }

        if (exportBuffer) {
          modelStore.setExport(modelId!, format, exportBuffer);
        }
      }

      const fileSize = exportBuffer ? exportBuffer.length : 0;

      return reply.send({
        status: "success",
        modelId,
        format,
        fileSizeBytes: fileSize,
        downloadUrl: `/api/v1/cad/download/${modelId}/${format}`,
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({
        status: "error",
        error: err.message || `Failed to export model to ${format}`,
      });
    }
  });

  // 4. Direct binary download endpoint
  app.get("/api/v1/cad/download/:modelId/:format", async (request: FastifyRequest<{
    Params: { modelId: string; format: string };
  }>, reply: FastifyReply) => {
    const { modelId, format } = request.params;
    const exportFormat = format.toLowerCase() as "step" | "stl" | "dxf";

    if (!["step", "stl", "dxf"].includes(exportFormat)) {
      return reply.status(400).send({ error: "Unsupported format. Use step, stl, or dxf." });
    }

    const cached = modelStore.get(modelId);
    if (!cached) {
      return reply.status(404).send({ error: "Model not found or expired" });
    }

    let buffer = cached.exports[exportFormat];
    if (!buffer) {
      try {
        if (exportFormat === "step") {
          buffer = await exportToSTEP(cached.shape);
        } else if (exportFormat === "stl") {
          buffer = await exportToSTL(cached.shape);
        } else if (exportFormat === "dxf") {
          buffer = await exportToDXF(cached.shape);
        }

        if (buffer) {
          modelStore.setExport(modelId, exportFormat, buffer);
        }
      } catch (err: any) {
        return reply.status(500).send({ error: `Export generation failed: ${err.message}` });
      }
    }

    if (!buffer) {
      return reply.status(500).send({ error: "Failed to generate export file" });
    }

    const mimeTypes: Record<string, string> = {
      step: "application/step",
      stl: "model/stl",
      dxf: "image/vnd.dxf",
    };

    return reply
      .header("Content-Type", mimeTypes[exportFormat] || "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${modelId}.${exportFormat}"`)
      .header("Content-Length", buffer.length)
      .send(buffer);
  });

  // 5. Get multi-part 3D WebGL scene hierarchy and meshes
  app.get("/api/v1/cad/scene/:modelId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.params as { modelId: string };
    if (!modelId) {
      return reply.status(400).send({ error: "modelId is required" });
    }

    const cached = modelStore.get(modelId);
    if (!cached) {
      return reply.status(404).send({ error: "Model not found or session expired" });
    }

    try {
      const sceneParts: Array<{
        name: string;
        color: string;
        material: string;
        opacity: number;
        roughness: number;
        metalness: number;
        transmission: number;
        ior: number;
        transparent: boolean;
        stlBase64: string;
      }> = [];

      if (cached.parts && cached.parts.length > 0) {
        for (const p of cached.parts) {
          if (!p.stlBuffer) {
            p.stlBuffer = await exportToSTL(p.shape);
          }
          const isGlass = p.material === "glass" || (p.opacity !== undefined && p.opacity < 1.0) || (p.transmission !== undefined && p.transmission > 0);
          const isMetal = p.material === "metal" || (!p.material && (p.metalness !== undefined && p.metalness > 0.5));
          sceneParts.push({
            name: p.name || "Part",
            color: p.color || (isGlass ? "#e0f2fe" : isMetal ? "#c5a059" : "#94a3b8"),
            material: p.material || (isGlass ? "glass" : isMetal ? "metal" : "plastic"),
            opacity: p.opacity ?? (isGlass ? 0.35 : 1.0),
            roughness: p.roughness ?? (isGlass ? 0.05 : isMetal ? 0.3 : 0.4),
            metalness: p.metalness ?? (isMetal ? 0.85 : 0.0),
            transmission: p.transmission ?? (isGlass ? 0.95 : 0.0),
            ior: p.ior ?? (isGlass ? 1.33 : 1.0),
            transparent: p.transparent ?? isGlass,
            stlBase64: p.stlBuffer.toString("base64"),
          });
        }
      } else {
        // Fallback for single monolithic solid
        if (!cached.exports.stl) {
          cached.exports.stl = await exportToSTL(cached.shape);
          modelStore.setExport(modelId, "stl", cached.exports.stl);
        }
        const mat = cached.metrics.material || "metal";
        const isMetal = mat.includes("aluminum") || mat.includes("steel") || mat.includes("brass") || mat.includes("copper") || mat === "metal";
        sceneParts.push({
          name: "SolidModel",
          color: isMetal ? "#c5a059" : "#94a3b8",
          material: isMetal ? "metal" : "plastic",
          opacity: 1.0,
          roughness: isMetal ? 0.3 : 0.5,
          metalness: isMetal ? 0.85 : 0.0,
          transmission: 0.0,
          ior: 1.0,
          transparent: false,
          stlBase64: cached.exports.stl.toString("base64"),
        });
      }

      return reply.send({
        status: "success",
        modelId,
        metrics: cached.metrics,
        parts: sceneParts,
        availableExports: ["step", "stl", "dxf"],
      });
    } catch (sceneErr: any) {
      request.log.error({ err: sceneErr }, "Failed to generate 3D scene data");
      return reply.status(500).send({
        status: "error",
        error: `Failed to compile 3D scene: ${sceneErr.message || String(sceneErr)}`,
      });
    }
  });
}
