import { getKernelInstance } from "./kernel.js";

export interface BoundingBoxInfo {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: {
    width: number;
    depth: number;
    height: number;
  };
}

export interface GeometryMetrics {
  boundingBox: BoundingBoxInfo;
  volume: number;
  vertexCount: number;
  triangleCount: number;
  faceCount?: number;
}

/**
 * Calculates physical geometric metrics from an evaluated Replicad 3D solid or shape.
 */
export function extractGeometryMetrics(shape: any): GeometryMetrics {
  // 1. Extract Bounding Box
  let min: [number, number, number] = [0, 0, 0];
  let max: [number, number, number] = [0, 0, 0];
  let width = 0;
  let depth = 0;
  let height = 0;

  try {
    const bbox = shape.boundingBox;
    if (bbox) {
      if (bbox.bounds && Array.isArray(bbox.bounds) && bbox.bounds.length === 2) {
        min = [bbox.bounds[0][0], bbox.bounds[0][1], bbox.bounds[0][2]];
        max = [bbox.bounds[1][0], bbox.bounds[1][1], bbox.bounds[1][2]];
      }
      width = bbox.width ?? Math.abs(max[0] - min[0]);
      depth = bbox.depth ?? Math.abs(max[1] - min[1]);
      height = bbox.height ?? Math.abs(max[2] - min[2]);
    }
  } catch (err) {
    console.warn("[cad-metrics] Warning extracting boundingBox:", err);
  }

  const dimensions = {
    width: Math.round(width * 1000) / 1000,
    depth: Math.round(depth * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  };

  // 2. Extract Volume via OpenCASCADE BRepGProp
  let volume = 0;
  try {
    const oc = getKernelInstance();
    const wrappedShape = shape.wrapped || shape;
    if (oc && wrappedShape) {
      const gprops = new oc.GProp_GProps_1();
      // BRepGProp.VolumeProperties_1(shape, gprops, onlyClosed, skipShared, useTriangulation)
      oc.BRepGProp.VolumeProperties_1(wrappedShape, gprops, false, false, false);
      const rawVolume = gprops.Mass();
      gprops.delete();
      if (typeof rawVolume === "number" && !isNaN(rawVolume)) {
        volume = Math.round(Math.abs(rawVolume) * 100) / 100;
      }
    }
  } catch (err) {
    console.warn("[cad-metrics] Warning calculating volume:", err);
  }

  // 3. Extract Mesh Statistics (triangles, vertices)
  let vertexCount = 0;
  let triangleCount = 0;

  try {
    if (typeof shape.mesh === "function") {
      const meshData = shape.mesh({ tolerance: 0.1, angularTolerance: 30 });
      if (meshData) {
        if (meshData.vertices) {
          vertexCount = Math.floor(meshData.vertices.length / 3);
        }
        if (meshData.triangles) {
          triangleCount = Math.floor(meshData.triangles.length / 3);
        }
      }
    }
  } catch (err) {
    console.warn("[cad-metrics] Warning calculating mesh data:", err);
  }

  // 4. Extract Face Count
  let faceCount = 0;
  try {
    if (shape.faces && Array.isArray(shape.faces)) {
      faceCount = shape.faces.length;
    }
  } catch {
    faceCount = 0;
  }

  return {
    boundingBox: {
      min,
      max,
      dimensions,
    },
    volume,
    vertexCount,
    triangleCount,
    faceCount,
  };
}
