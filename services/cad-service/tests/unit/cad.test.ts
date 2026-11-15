import { test, describe } from "node:test";
import assert from "node:assert";
import { initKernel } from "../../src/engine/kernel.js";
import { executeReplicadScript } from "../../src/engine/runner.js";
import { exportToSTEP } from "../../src/exporters/step.js";
import { exportToSTL } from "../../src/exporters/stl.js";

describe("CAD Engine & Exporters Unit Tests", () => {
  test("OpenCASCADE kernel initializes cleanly", async () => {
    const kernel = await initKernel();
    assert.ok(kernel, "Kernel instance should not be null");
  });

  test("Executes basic Replicad cylinder and calculates metrics", async () => {
    const script = `
      const { drawCircle } = replicad;
      function main({ radius = 10, height = 20 }) {
        return drawCircle(radius).sketchOnPlane().extrude(height);
      }
      module.exports = main;
    `;

    const result = await executeReplicadScript(script, { radius: 10, height: 20 });
    assert.ok(result.shape, "Should return an evaluated 3D shape");
    assert.ok(result.metrics.volume > 0, "Volume should be positive");
    assert.ok(result.metrics.vertexCount > 0, "Mesh should have vertices");
    assert.ok(result.metrics.triangleCount > 0, "Mesh should have triangles");
    assert.strictEqual(result.metrics.boundingBox.dimensions.height, 20);
  });

  test("Exports 3D shape to valid STEP format", async () => {
    const script = `
      const { drawCircle } = replicad;
      module.exports = function() {
        return drawCircle(5).sketchOnPlane().extrude(15);
      };
    `;

    const { shape } = await executeReplicadScript(script);
    const stepBuffer = await exportToSTEP(shape);

    assert.ok(Buffer.isBuffer(stepBuffer), "STEP output must be a Buffer");
    assert.ok(stepBuffer.length > 100, "STEP buffer must have content");

    const textContent = stepBuffer.toString("utf-8");
    assert.ok(
      textContent.includes("ISO-10303-21"),
      "STEP file must contain standard ISO-10303-21 header"
    );
  });

  test("Exports 3D shape to valid binary STL format", async () => {
    const script = `
      const { drawCircle } = replicad;
      module.exports = function() {
        return drawCircle(8).sketchOnPlane().extrude(12);
      };
    `;

    const { shape } = await executeReplicadScript(script);
    const stlBuffer = await exportToSTL(shape);

    assert.ok(Buffer.isBuffer(stlBuffer), "STL output must be a Buffer");
    // Binary STL has an 80-byte header + 4-byte triangle count + at least 50 bytes per triangle
    assert.ok(stlBuffer.length > 84, "Binary STL must have header and triangles");
  });

  test("Exports shape to DXF format", async () => {
    const { exportToDXF } = await import("../../src/exporters/dxf.js");
    const script = `
      const { drawCircle } = replicad;
      module.exports = function() {
        return drawCircle(8).sketchOnPlane().extrude(12);
      };
    `;

    const { shape } = await executeReplicadScript(script);
    const dxfBuffer = await exportToDXF(shape);
    assert.ok(Buffer.isBuffer(dxfBuffer), "DXF output must be a Buffer");
    assert.ok(dxfBuffer.length > 50, "DXF buffer must have content");
  });

  test("Exports assembly of shapes to STEP and STL", async () => {
    const script = `
      const { drawCircle, makeBox } = replicad;
      module.exports = function() {
        return [
          { name: "part1", shape: makeBox(10, 10, 10) },
          { name: "part2", shape: drawCircle(5).sketchOnPlane().extrude(15) }
        ];
      };
    `;
    const { shape } = await executeReplicadScript(script);
    const step = await exportToSTEP(shape);
    const stl = await exportToSTL(shape);
    assert.ok(step.length > 0);
    assert.ok(stl.length > 0);
  });

  test("Exports non-intersecting multi-part assembly without dropping any parts", async () => {
    const script = `
      const { drawRectangle } = replicad;
      module.exports = function() {
        // Base plate and floating top lid with clearance - separate non-intersecting solids
        const base = drawRectangle(40, 40).sketchOnPlane("XY").extrude(10);
        const lid = drawRectangle(40, 40).sketchOnPlane("XY").extrude(4).translate([0, 0, 25]);
        return [
          { name: "Base", shape: base },
          { name: "Lid", shape: lid }
        ];
      };
    `;
    const { shape, metrics } = await executeReplicadScript(script);
    assert.ok(shape, "Evaluated compound shape must exist");
    // Height should span both base (0 to 10) and lid (25 to 29) = total 29mm
    assert.strictEqual(Math.round(metrics.boundingBox.dimensions.height), 29);
    const step = await exportToSTEP(shape);
    const stl = await exportToSTL(shape);
    assert.ok(step.length > 100, "STEP should contain data for both parts");
    assert.ok(stl.length > 84, "STL should contain triangles for both parts");
  });

  test("Handles script execution syntax errors gracefully", async () => {
    const badScript = `
      const x = ; // Invalid syntax
    `;

    await assert.rejects(
      async () => {
        await executeReplicadScript(badScript);
      },
      /Script compilation\/execution error/
    );
  });

  test("Calculates physical mass, surface area, and center of mass for engineering materials", async () => {
    // 50 x 50 x 50 mm cube = 125,000 mm³ = 0.000125 m³
    // Steel 304 density = 8000 kg/m³ -> Expected Mass = 0.000125 * 8000 = 1.0 kg
    const script = `
      const { makeBox } = replicad;
      module.exports = function() {
        return {
          name: "SteelBlock",
          shape: makeBox(50, 50, 50),
          material: "steel-304"
        };
      };
    `;

    const { metrics } = await executeReplicadScript(script);
    assert.ok(metrics.volume > 124000 && metrics.volume < 126000, `Volume should be ~125,000 mm³, got ${metrics.volume}`);
    assert.strictEqual(metrics.material, "steel-304");
    assert.ok(metrics.massKg >= 0.99 && metrics.massKg <= 1.01, `Mass should be 1.0 kg for 50mm steel cube, got ${metrics.massKg}`);
    assert.ok(metrics.surfaceAreaMm2 > 14000, "Surface area should be ~15,000 mm²");
    assert.ok(metrics.estimatedCostUsd > 0, "Cost should be calculated from mass");
  });

  test("Calculates multi-material assembly mass and breakdown accurately", async () => {
    // Assembly: Aluminum bracket (density 2700) + Brass pin (density 8500)
    const script = `
      const { makeBox, drawCircle } = replicad;
      module.exports = function() {
        return [
          { name: "AluminumBody", shape: makeBox(20, 20, 20), material: "aluminum-6061" },
          { name: "BrassPin", shape: drawCircle(5).sketchOnPlane("XY").extrude(30), material: "brass-c36000" }
        ];
      };
    `;

    const { metrics } = await executeReplicadScript(script);
    assert.ok(metrics.parts && metrics.parts.length === 2, "Should return physics metrics for both assembly parts");
    assert.strictEqual(metrics.parts[0].material, "aluminum-6061");
    assert.strictEqual(metrics.parts[1].material, "brass-c36000");
    assert.ok(metrics.parts[0].massKg > 0);
    assert.ok(metrics.parts[1].massKg > 0);
    assert.ok(metrics.massKg > metrics.parts[0].massKg, "Total mass should be sum of parts");
  });

  test("Retains full PBR visual properties and shapes for multi-part scene rendering", async () => {
    const script = `
      const { makeBox, drawCircle } = replicad;
      module.exports = function() {
        return [
          { name: "TapBody", shape: makeBox(30, 30, 80), color: "#c5a059", material: "metal", metalness: 0.85, roughness: 0.3 },
          { name: "WaterStream", shape: drawCircle(4).sketchOnPlane("XY").extrude(40), color: "#e0f2fe", material: "glass", transmission: 0.95, ior: 1.33, opacity: 0.35, transparent: true }
        ];
      };
    `;

    const result = await executeReplicadScript(script);
    assert.ok(result.parts && result.parts.length === 2, "Should return 2 visual parts");
    assert.strictEqual(result.parts[0].name, "TapBody");
    assert.strictEqual(result.parts[0].color, "#c5a059");
    assert.strictEqual(result.parts[0].metalness, 0.85);
    assert.strictEqual(result.parts[1].name, "WaterStream");
    assert.strictEqual(result.parts[1].transmission, 0.95);
    assert.strictEqual(result.parts[1].ior, 1.33);
    assert.strictEqual(result.parts[1].transparent, true);
  });
});


