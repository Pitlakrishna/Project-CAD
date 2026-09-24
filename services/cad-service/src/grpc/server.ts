import path from "path";
import { fileURLToPath } from "url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { executeReplicadScript } from "../engine/runner.js";
import { modelStore } from "../cache/modelStore.js";
import { exportToSTEP } from "../exporters/step.js";
import { exportToSTL } from "../exporters/stl.js";
import { exportToDXF } from "../exporters/dxf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to common/proto/cad.proto
const PROTO_PATH = path.resolve(__dirname, "../../../../common/proto/cad.proto");

export function startGrpcServer(port: number): grpc.Server {
  const server = new grpc.Server();

  try {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const cadProto = grpc.loadPackageDefinition(packageDefinition) as any;
    const cadService = cadProto.aicad?.cad?.v1?.CadEngineService;

    if (!cadService) {
      console.warn("[grpc] Warning: CadEngineService definition not found in cad.proto");
      return server;
    }

    server.addService(cadService.service, {
      // 1. GenerateModel RPC
      GenerateModel: async (call: any, callback: any) => {
        try {
          const { script, parameters = {} } = call.request;
          const modelId = modelStore.generateModelId(script, parameters);

          let cached = modelStore.get(modelId);
          if (!cached) {
            const result = await executeReplicadScript(script, parameters);
            cached = {
              modelId,
              shape: result.shape,
              metrics: result.metrics,
              createdAt: Date.now(),
              exports: {},
            };
            modelStore.set(cached);
          }

          callback(null, {
            model_id: modelId,
            mesh_data: Buffer.from([]), // Raw mesh buffer
            vertex_count: cached.metrics.vertexCount,
            triangle_count: cached.metrics.triangleCount,
          });
        } catch (err: any) {
          callback({
            code: grpc.status.INTERNAL,
            message: err.message || "Failed to generate CAD model",
          });
        }
      },

      // 2. ExportModel RPC
      ExportModel: async (call: any, callback: any) => {
        try {
          const { model_id, export_format } = call.request;
          const format = (export_format || "step").toLowerCase() as "step" | "stl" | "dxf";

          const cached = modelStore.get(model_id);
          if (!cached) {
            return callback({
              code: grpc.status.NOT_FOUND,
              message: `Model ID '${model_id}' not found in cache`,
            });
          }

          let buffer = cached.exports[format];
          if (!buffer) {
            if (format === "step") {
              buffer = await exportToSTEP(cached.shape);
            } else if (format === "stl") {
              buffer = await exportToSTL(cached.shape);
            } else if (format === "dxf") {
              buffer = await exportToDXF(cached.shape);
            }

            if (buffer) {
              modelStore.setExport(model_id, format, buffer);
            }
          }

          const fileSize = buffer ? buffer.length : 0;

          callback(null, {
            download_url: `/api/v1/cad/download/${model_id}/${format}`,
            file_size_bytes: fileSize,
          });
        } catch (err: any) {
          callback({
            code: grpc.status.INTERNAL,
            message: err.message || `Failed to export CAD model to ${call.request.export_format}`,
          });
        }
      },
    });

    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          console.error(`[grpc] Failed to bind gRPC server to port ${port}:`, err);
          return;
        }
        console.log(`[grpc] CadEngineService gRPC server running on port ${boundPort}`);
      }
    );
  } catch (err) {
    console.warn(`[grpc] Note: Could not load cad.proto at ${PROTO_PATH}:`, err);
  }

  return server;
}
