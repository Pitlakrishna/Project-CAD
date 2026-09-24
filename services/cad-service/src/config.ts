import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "8002", 10),
  host: process.env.HOST || "0.0.0.0",
  grpcPort: parseInt(process.env.GRPC_PORT || "50051", 10),
  executionTimeoutMs: parseInt(process.env.EXECUTION_TIMEOUT_MS || "15000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  maxCacheItems: 500,
};
