import * as replicad from "replicad";

export interface STLExportOptions {
  tolerance?: number;
  angularTolerance?: number;
  binary?: boolean;
}

/**
 * Exports a Replicad Solid or Compound shape to an STL mesh buffer.
 */
export async function exportToSTL(
  shape: any,
  options: STLExportOptions = { tolerance: 0.05, angularTolerance: 20, binary: true }
): Promise<Buffer> {
  if (!shape) {
    throw new Error("Cannot export null or undefined shape to STL");
  }

  // 1. Check if shape has .blobSTL() method
  if (typeof shape.blobSTL === "function") {
    const blob = await shape.blobSTL(options);
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 2. Fallback to replicad.exportShapeSTL
  const exportFn = (replicad as any).exportShapeSTL;
  if (typeof exportFn === "function") {
    const blob = await exportFn(shape, options);
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("No STL exporter available on shape or replicad library");
}
