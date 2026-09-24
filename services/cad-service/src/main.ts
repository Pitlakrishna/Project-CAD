import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { initKernel } from "./engine/kernel.js";
import { registerRoutes } from "./api/routes.js";
import { startGrpcServer } from "./grpc/server.js";

async function bootstrap() {
  console.log("==================================================");
  console.log("  AI CAD Platform — CAD Geometry Service (Stage 2)");
  console.log("==================================================");

  const app = Fastify({
    logger: {
      level: config.nodeEnv === "development" ? "info" : "warn",
    },
  });

  // Enable CORS
  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Register REST Routes
  await registerRoutes(app);

  // Pre-warm the OpenCASCADE WebAssembly Kernel in background
  initKernel().catch((err) => {
    console.error("[cad-engine] Error initializing OpenCASCADE kernel:", err);
  });

  // Start HTTP REST Server
  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`[cad-service] HTTP REST Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Start gRPC Server
  try {
    startGrpcServer(config.grpcPort);
  } catch (err) {
    console.warn("[grpc] Warning: gRPC server failed to start:", err);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\n[cad-service] Received ${signal}. Shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap();
