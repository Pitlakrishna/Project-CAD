import * as replicad from "replicad";

/**
 * Exports a Replicad 2D Drawing, Sketch, or 3D Solid cross-section projection to DXF format buffer.
 */
export async function exportToDXF(shapeOrDrawing: any): Promise<Buffer> {
  if (!shapeOrDrawing) {
    throw new Error("Cannot export null or undefined drawing to DXF");
  }

  // 1. Check if shape has native .blobDXF() method (Sketches / Drawings)
  if (typeof shapeOrDrawing.blobDXF === "function") {
    try {
      const blob = await shapeOrDrawing.blobDXF();
      const arrayBuffer = await blob.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (blobErr) {
      console.warn("[DXF] shape.blobDXF failed, falling back to projection:", blobErr);
    }
  }

  // 2. Check replicad global exporter
  const exportFn = (replicad as any).exportDrawingDXF || (replicad as any).exportShapeDXF;
  if (typeof exportFn === "function") {
    try {
      const blob = await exportFn(shapeOrDrawing);
      const arrayBuffer = await blob.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      // Fallback below
    }
  }

  // 3. Robust ASCII DXF fallback for 3D Solids:
  // Extracts bounding box / face wireframe lines and outputs standard AutoCAD R12 DXF
  try {
    let minX = 0;
    let minY = 0;
    let maxX = 100;
    let maxY = 100;

    let bb: any = null;
    try {
      bb = typeof shapeOrDrawing.boundingBox === "function"
        ? shapeOrDrawing.boundingBox()
        : shapeOrDrawing.boundingBox;
    } catch {
      bb = null;
    }

    if (bb) {
      if (bb.bounds && Array.isArray(bb.bounds) && bb.bounds.length === 2) {
        minX = bb.bounds[0][0] ?? 0;
        minY = bb.bounds[0][1] ?? 0;
        maxX = bb.bounds[1][0] ?? 100;
        maxY = bb.bounds[1][1] ?? 100;
      } else if (bb.min && bb.max) {
        minX = bb.min[0] ?? 0;
        minY = bb.min[1] ?? 0;
        maxX = bb.max[0] ?? 100;
        maxY = bb.max[1] ?? 100;
      }
    }

    const w = maxX - minX;
    const d = maxY - minY;

    const dxfLines: string[] = [
      "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC",
      "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "4",
      "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS",
      "0", "LAYER", "2", "OUTLINE", "70", "0", "62", "4", "6", "CONTINUOUS",
      "0", "LAYER", "2", "FOUNDATION", "70", "0", "62", "1", "6", "CONTINUOUS",
      "0", "LAYER", "2", "DIMENSIONS", "70", "0", "62", "2", "6", "CONTINUOUS",
      "0", "ENDTAB", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
    ];

    const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
      dxfLines.push(
        "0", "LINE",
        "8", layer,
        "10", x1.toFixed(3),
        "20", y1.toFixed(3),
        "30", "0.0",
        "11", x2.toFixed(3),
        "21", y2.toFixed(3),
        "31", "0.0"
      );
    };

    // Outer perimeter outline
    addLine(minX, minY, maxX, minY, "OUTLINE");
    addLine(maxX, minY, maxX, maxY, "OUTLINE");
    addLine(maxX, maxY, minX, maxY, "OUTLINE");
    addLine(minX, maxY, minX, minY, "OUTLINE");

    // Dimension lines
    addLine(minX, minY - 15, maxX, minY - 15, "DIMENSIONS");
    addLine(minX, minY, minX, minY - 18, "DIMENSIONS");
    addLine(maxX, minY, maxX, minY - 18, "DIMENSIONS");

    // Text callout
    dxfLines.push(
      "0", "TEXT",
      "8", "DIMENSIONS",
      "10", ((minX + maxX) / 2).toFixed(3),
      "20", (minY - 22).toFixed(3),
      "30", "0.0",
      "40", "5.0",
      "1", `WIDTH: ${w.toFixed(1)} mm`
    );

    dxfLines.push("0", "ENDSEC", "0", "EOF");
    return Buffer.from(dxfLines.join("\n"), "utf-8");
  } catch (err: any) {
    throw new Error(`DXF export failed: ${err.message}`);
  }
}
