import * as replicad from "replicad";

/**
 * Exports a Replicad Solid or Compound shape to standard ISO-10303-21 STEP format buffer.
 */
export async function exportToSTEP(shape: any): Promise<Buffer> {
  if (!shape) {
    throw new Error("Cannot export null or undefined shape to STEP");
  }

  // 1. Check if shape has .blobSTEP() method
  if (typeof shape.blobSTEP === "function") {
    const blob = await shape.blobSTEP();
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 2. Fallback to replicad.exportShapeSTEP if available
  const exportFn = (replicad as any).exportShapeSTEP;
  if (typeof exportFn === "function") {
    const blob = await exportFn(shape);
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("No STEP exporter available on shape or replicad library");
}
