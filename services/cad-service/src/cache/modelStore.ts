import crypto from "crypto";
import { GeometryMetrics } from "../engine/metrics.js";

export interface CachedModel {
  modelId: string;
  shape: any;
  metrics: GeometryMetrics;
  createdAt: number;
  exports: {
    step?: Buffer;
    stl?: Buffer;
    dxf?: Buffer;
  };
}

class ModelStore {
  private cache: Map<string, CachedModel> = new Map();
  private maxItems: number;

  constructor(maxItems = 500) {
    this.maxItems = maxItems;
  }

  /**
   * Generates a deterministic model ID from script and parameters.
   */
  generateModelId(script: string, parameters: Record<string, any> = {}): string {
    const sortedParams = Object.keys(parameters)
      .sort()
      .reduce((acc: any, key) => {
        acc[key] = parameters[key];
        return acc;
      }, {});

    const normalized = `${script.trim()}::${JSON.stringify(sortedParams)}`;
    return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  get(modelId: string): CachedModel | undefined {
    const item = this.cache.get(modelId);
    if (item) {
      // Refresh LRU position
      this.cache.delete(modelId);
      this.cache.set(modelId, item);
    }
    return item;
  }

  set(model: CachedModel): void {
    if (this.cache.size >= this.maxItems) {
      // Evict oldest item
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(model.modelId, model);
  }

  setExport(modelId: string, format: "step" | "stl" | "dxf", buffer: Buffer): void {
    const model = this.get(modelId);
    if (model) {
      model.exports[format] = buffer;
    }
  }

  has(modelId: string): boolean {
    return this.cache.has(modelId);
  }
}

export const modelStore = new ModelStore();
