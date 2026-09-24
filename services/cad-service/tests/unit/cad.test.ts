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
});
