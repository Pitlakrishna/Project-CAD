import { getKernelInstance } from "./kernel.js";
import { PhysicalMaterial, resolveEngineeringMaterial } from "./materials.js";

export interface BoundingBoxInfo {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: {
    width: number;
    depth: number;
    height: number;
  };
}

export interface PartPhysicsMetric {
  name: string;
  material: string;
  materialName: string;
  densityKgM3: number;
  volumeMm3: number;
  massKg: number;
  surfaceAreaMm2: number;
  costUsd: number;
}

export interface GeometryMetrics {
  boundingBox: BoundingBoxInfo;
  volume: number; // in mm³
  surfaceAreaMm2: number; // in mm²
  massKg: number; // in kg (computed from material density)
  centerOfMass: [number, number, number]; // [X, Y, Z] in mm
  momentsOfInertia?: {
    Ixx: number;
    Iyy: number;
    Izz: number;
  };
  material: string; // material key e.g. "aluminum-6061"
  materialName: string;
  estimatedCostUsd: number;
  vertexCount: number;
  triangleCount: number;
  faceCount?: number;
  parts?: PartPhysicsMetric[];
}

/**
 * Calculates physical geometric and material physics metrics from an evaluated Replicad 3D solid or shape.
 */
export function extractGeometryMetrics(
  shape: any,
  materialInput?: string,
  partItems?: Array<{ name: string; shape: any; material?: string }>
): GeometryMetrics {
  const activeMaterial: PhysicalMaterial = resolveEngineeringMaterial(materialInput);

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
      // Standard 3D CAD convention: X is width, Y is length/depth, Z is vertical height
      width = Math.abs(max[0] - min[0]);
      depth = Math.abs(max[1] - min[1]);
      height = Math.abs(max[2] - min[2]);
    }
  } catch (err) {
    console.warn("[cad-metrics] Warning extracting boundingBox:", err);
  }

  const dimensions = {
    width: Math.round(width * 1000) / 1000,
    depth: Math.round(depth * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  };

  // 2. Extract Volume, Center of Mass, Inertia & Surface Area via OpenCASCADE BRepGProp
  let volume = 0;
  let surfaceAreaMm2 = 0;
  let centerOfMass: [number, number, number] = [0, 0, 0];
  let momentsOfInertia = { Ixx: 0, Iyy: 0, Izz: 0 };

  try {
    const oc = getKernelInstance();
    const wrappedShape = shape.wrapped || shape;
    if (oc && wrappedShape) {
      // Volume & Center of Mass
      const gprops = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_1(wrappedShape, gprops, false, false, false);
      const rawVolume = gprops.Mass();
      if (typeof rawVolume === "number" && !isNaN(rawVolume)) {
        volume = Math.round(Math.abs(rawVolume) * 100) / 100;
      }

      try {
        const cog = gprops.CentreOfMass();
        if (cog) {
          centerOfMass = [
            Math.round(cog.X() * 1000) / 1000,
            Math.round(cog.Y() * 1000) / 1000,
            Math.round(cog.Z() * 1000) / 1000,
          ];
        }
      } catch {
        // Fallback CoG to bounding box center
        centerOfMass = [
          Math.round(((min[0] + max[0]) / 2) * 1000) / 1000,
          Math.round(((min[1] + max[1]) / 2) * 1000) / 1000,
          Math.round(((min[2] + max[2]) / 2) * 1000) / 1000,
        ];
      }

      try {
        const mat = gprops.MatrixOfInertia();
        if (mat) {
          momentsOfInertia = {
            Ixx: Math.round(mat.Value(1, 1) * 100) / 100,
            Iyy: Math.round(mat.Value(2, 2) * 100) / 100,
            Izz: Math.round(mat.Value(3, 3) * 100) / 100,
          };
        }
      } catch {
        // Inertia matrix optional
      }
      gprops.delete();

      // Surface Area
      try {
        const surfGProps = new oc.GProp_GProps_1();
        oc.BRepGProp.SurfaceProperties_1(wrappedShape, surfGProps, false, false);
        const rawArea = surfGProps.Mass();
        surfGProps.delete();
        if (typeof rawArea === "number" && !isNaN(rawArea)) {
          surfaceAreaMm2 = Math.round(Math.abs(rawArea) * 100) / 100;
        }
      } catch {
        // Surface area fallback approximation if BRepGProp fails
        surfaceAreaMm2 = 2 * (width * depth + width * height + depth * height);
      }
    }
  } catch (err) {
    console.warn("[cad-metrics] Warning calculating volume/surface properties:", err);
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

  // 5. Compute Dynamic Multi-Part Metrics if assembly provided
  const parts: PartPhysicsMetric[] = [];
  let totalAssemblyMassKg = 0;
  let totalAssemblyCostUsd = 0;

  if (partItems && partItems.length > 0) {
    const oc = getKernelInstance();
    for (const item of partItems) {
      const partMat = resolveEngineeringMaterial(item.material || materialInput);
      let partVol = 0;
      let partArea = 0;
      try {
        const partWrapped = item.shape?.wrapped || item.shape;
        if (oc && partWrapped) {
          const g = new oc.GProp_GProps_1();
          oc.BRepGProp.VolumeProperties_1(partWrapped, g, false, false, false);
          partVol = Math.round(Math.abs(g.Mass()) * 100) / 100;
          g.delete();

          const sg = new oc.GProp_GProps_1();
          oc.BRepGProp.SurfaceProperties_1(partWrapped, sg, false, false);
          partArea = Math.round(Math.abs(sg.Mass()) * 100) / 100;
          sg.delete();
        }
      } catch {
        // Fallback proportional estimate
        partVol = volume / partItems.length;
      }

      const partMass = Math.round(((partVol / 1e9) * partMat.density) * 10000) / 10000;
      const partCost = Math.round((partMass * partMat.costPerKg) * 100) / 100;
      totalAssemblyMassKg += partMass;
      totalAssemblyCostUsd += partCost;

      parts.push({
        name: item.name,
        material: partMat.id,
        materialName: partMat.name,
        densityKgM3: partMat.density,
        volumeMm3: partVol,
        massKg: partMass,
        surfaceAreaMm2: partArea,
        costUsd: partCost,
      });
    }
  }

  // If no multi-part assembly breakdown, compute total mass directly from overall volume
  const massKg =
    totalAssemblyMassKg > 0
      ? Math.round(totalAssemblyMassKg * 10000) / 10000
      : Math.round(((volume / 1e9) * activeMaterial.density) * 10000) / 10000;

  const estimatedCostUsd =
    totalAssemblyCostUsd > 0
      ? Math.round(totalAssemblyCostUsd * 100) / 100
      : Math.round((massKg * activeMaterial.costPerKg) * 100) / 100;

  return {
    boundingBox: {
      min,
      max,
      dimensions,
    },
    volume,
    surfaceAreaMm2,
    massKg,
    centerOfMass,
    momentsOfInertia,
    material: activeMaterial.id,
    materialName: activeMaterial.name,
    estimatedCostUsd,
    vertexCount,
    triangleCount,
    faceCount,
    parts: parts.length > 0 ? parts : undefined,
  };
}
