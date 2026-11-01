/**
 * Safe Procedural Three.js Scene Runner
 * Enables dynamic client-side execution of AI-generated Three.js WebGL scenes
 * for organic landscapes, mountains, rivers, valleys, foliage, and architectural environments.
 */

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  getBrushedMetalNormalTexture,
  getConcreteNormalTexture,
  getWoodGrainNormalTexture,
} from "./proceduralTextures";

// --- Standalone High-Performance 2D Perlin / Gradient Noise Implementation ---
const PERM_SIZE = 256;
const p: number[] = new Array(PERM_SIZE * 2);
const permutation = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142,
  8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203,
  117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74,
  165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220,
  105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132,
  187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3,
  64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227,
  47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221,
  153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185,
  112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51,
  145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
  50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78,
  66, 215, 61, 156, 180,
];

for (let i = 0; i < PERM_SIZE; i++) {
  p[256 + i] = p[i] = permutation[i];
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 2D Perlin Noise generator in range [-1.0, 1.0]
 */
export function rawPerlin2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const A = p[X] + Y;
  const B = p[X + 1] + Y;

  return lerp(
    v,
    lerp(u, grad2D(p[A], xf, yf), grad2D(p[B], xf - 1, yf)),
    lerp(u, grad2D(p[A + 1], xf, yf - 1), grad2D(p[B + 1], xf - 1, yf - 1))
  );
}

/**
 * Multi-octave Fractional Brownian Motion (fBm) 2D noise
 */
export function noise2D(x: number, y: number, octaves = 4, persistence = 0.5): number {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += rawPerlin2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

export interface PBRMaterialOptions {
  type?:
    | "grass"
    | "rock"
    | "soil"
    | "water"
    | "foliage"
    | "wood"
    | "concrete"
    | "glass"
    | "metal"
    | "sand"
    | string;
  color?: string | number;
  roughness?: number;
  metalness?: number;
  transmission?: number;
  transparent?: boolean;
  opacity?: number;
  wireframe?: boolean;
}

/**
 * Creates rich procedural PBR materials tailored for Three.js scenes
 */
export function createPBRMaterial(options: PBRMaterialOptions = {}): THREE.Material {
  const type = (options.type || "grass").toLowerCase();
  const color = options.color ?? "#2d6a4f";

  if (type === "water") {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(options.color ?? "#0284c7"),
      roughness: options.roughness ?? 0.08,
      metalness: options.metalness ?? 0.05,
      transmission: options.transmission ?? 0.88,
      transparent: true,
      opacity: options.opacity ?? 0.75,
      ior: 1.333,
      reflectivity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  if (type === "glass") {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(options.color ?? "#e0f2fe"),
      roughness: options.roughness ?? 0.04,
      transmission: options.transmission ?? 0.94,
      transparent: true,
      opacity: options.opacity ?? 0.35,
      ior: 1.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  if (type === "wood") {
    const normal = getWoodGrainNormalTexture().clone();
    normal.repeat.set(3, 3);
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      normalMap: normal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: options.roughness ?? 0.55,
      metalness: options.metalness ?? 0.02,
      side: THREE.DoubleSide,
    });
  }

  if (type === "concrete") {
    const normal = getConcreteNormalTexture().clone();
    normal.repeat.set(4, 4);
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      normalMap: normal,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: options.roughness ?? 0.85,
      metalness: options.metalness ?? 0.03,
      side: THREE.DoubleSide,
    });
  }

  if (type === "metal") {
    const normal = getBrushedMetalNormalTexture().clone();
    normal.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      normalMap: normal,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: options.roughness ?? 0.25,
      metalness: options.metalness ?? 0.85,
      side: THREE.DoubleSide,
    });
  }

  if (type === "grass") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: options.roughness ?? 0.8,
      metalness: options.metalness ?? 0.02,
      side: THREE.DoubleSide,
    });
  }

  if (type === "foliage" || type === "leaf") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: options.roughness ?? 0.65,
      metalness: options.metalness ?? 0.01,
      side: THREE.DoubleSide,
    });
  }

  if (type === "rock" || type === "stone") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color ?? "#64748b"),
      roughness: options.roughness ?? 0.9,
      metalness: options.metalness ?? 0.05,
      side: THREE.DoubleSide,
    });
  }

  // Default standard material
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: options.roughness ?? 0.45,
    metalness: options.metalness ?? 0.1,
    side: THREE.DoubleSide,
  });
}

export interface ThreeSceneExecutionResult {
  cleanup: () => void;
  animate: (time: number, delta: number) => void;
  createdObjects: THREE.Object3D[];
  bounds: THREE.Box3;
}

/**
 * Executes a procedural Three.js scene script inside a controlled environment
 */
export function executeThreeSceneScript(
  scriptContent: string,
  targetGroup: THREE.Group,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  extraContext: Record<string, any> = {}
): ThreeSceneExecutionResult {
  // 1. Sanitize script: strip markdown fences
  let cleanCode = scriptContent.trim();
  const mdMatch = cleanCode.match(/```(?:javascript|js|typescript|ts)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    cleanCode = mdMatch[1].trim();
  }

  // Ensure target group is clear
  while (targetGroup.children.length > 0) {
    const child = targetGroup.children[0];
    targetGroup.remove(child);
  }

  const createdObjects: THREE.Object3D[] = [];
  const animateCallbacks: Array<(time: number, delta: number) => void> = [];

  const add = (object: THREE.Object3D) => {
    if (object) {
      targetGroup.add(object);
      createdObjects.push(object);
    }
    return object;
  };

  const onAnimate = (cb: (time: number, delta: number) => void) => {
    if (typeof cb === "function") {
      animateCallbacks.push(cb);
    }
  };

  const tools = {
    THREE,
    scene: targetGroup,
    camera,
    controls,
    add,
    noise2D,
    rawPerlin2D,
    createPBRMaterial,
    onAnimate,
    ...extraContext,
  };

  // 2. Wrap and execute the user function safely
  try {
    const wrappedScript = `
      ${cleanCode}
      if (typeof buildScene === "function") {
        buildScene(tools);
      } else if (typeof main === "function") {
        main(tools);
      }
    `;
    const runner = new Function("tools", wrappedScript);
    runner(tools);
  } catch (err) {
    console.error("[ThreeSceneRunner] Scene script execution error:", err);
    throw err;
  }

  // 3. Compute overall bounding box
  const bounds = new THREE.Box3().setFromObject(targetGroup);

  // 4. Return lifecycle handlers
  const cleanup = () => {
    animateCallbacks.length = 0;
    createdObjects.forEach((obj) => {
      targetGroup.remove(obj);
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else if (m.material) {
            m.material.dispose();
          }
        }
      });
    });
    createdObjects.length = 0;
  };

  const animate = (time: number, delta: number) => {
    for (let i = 0; i < animateCallbacks.length; i++) {
      try {
        animateCallbacks[i](time, delta);
      } catch (err) {
        console.warn("[ThreeSceneRunner] Error in animation callback:", err);
      }
    }
  };

  return {
    cleanup,
    animate,
    createdObjects,
    bounds,
  };
}
