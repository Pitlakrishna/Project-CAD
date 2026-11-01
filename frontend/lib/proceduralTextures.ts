/**
 * Procedural PBR Architectural & Mechanical Texture Generator for Three.js
 * Creates client-side, zero-latency canvas normal and roughness maps.
 * Enforces strict Zero-Hardcoding: UV repeat is dynamically computed from part bounding dimensions in millimeters.
 */

import * as THREE from "three";

interface ProceduralTextureCache {
  concreteNormal?: THREE.CanvasTexture;
  concreteRoughness?: THREE.CanvasTexture;
  woodNormal?: THREE.CanvasTexture;
  woodRoughness?: THREE.CanvasTexture;
  brushedMetalNormal?: THREE.CanvasTexture;
}

const textureCache: ProceduralTextureCache = {};

/**
 * Creates a subtle architectural concrete / stucco micro-noise normal map.
 */
export function getConcreteNormalTexture(): THREE.CanvasTexture {
  if (textureCache.concreteNormal) return textureCache.concreteNormal;

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Subtle micro-bump normal distribution around tangent space (128, 128, 255)
      const nx = 128 + Math.floor((Math.random() - 0.5) * 36);
      const ny = 128 + Math.floor((Math.random() - 0.5) * 36);
      const nz = 250;

      data[i] = nx;
      data[i + 1] = ny;
      data[i + 2] = nz;
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  textureCache.concreteNormal = texture;
  return texture;
}

/**
 * Creates an architectural wood grain normal map with organic longitudinal lines.
 */
export function getWoodGrainNormalTexture(): THREE.CanvasTexture {
  if (textureCache.woodNormal) return textureCache.woodNormal;

  const width = 512;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Longitudinal grain wave
        const wave = Math.sin(x * 0.12 + Math.sin(y * 0.04) * 4.0);
        const grainNoise = (Math.random() - 0.5) * 20;
        const slope = Math.floor(wave * 25 + grainNoise);

        const nx = Math.min(255, Math.max(0, 128 + slope));
        const ny = 128;
        const nz = 245;

        data[idx] = nx;
        data[idx + 1] = ny;
        data[idx + 2] = nz;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  textureCache.woodNormal = texture;
  return texture;
}

/**
 * Creates a directional brushed aluminum / stainless steel micro-groove normal map.
 */
export function getBrushedMetalNormalTexture(): THREE.CanvasTexture {
  if (textureCache.brushedMetalNormal) return textureCache.brushedMetalNormal;

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      // Horizontal linear streak noise
      const streak = (Math.random() - 0.5) * 30;
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        data[idx] = 128;
        data[idx + 1] = Math.min(255, Math.max(0, 128 + Math.floor(streak)));
        data[idx + 2] = 250;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  textureCache.brushedMetalNormal = texture;
  return texture;
}

/**
 * Creates a soft radial decay contact shadow texture for dynamic grounding under buildings.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    // Dark core with smooth natural exponential falloff
    gradient.addColorStop(0.0, "rgba(0, 0, 0, 0.72)");
    gradient.addColorStop(0.35, "rgba(0, 0, 0, 0.45)");
    gradient.addColorStop(0.7, "rgba(0, 0, 0, 0.18)");
    gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  return texture;
}

/**
 * Strictly dynamic Zero-Hardcoding UV scale calculator:
 * Determines the ideal texture repeat frequency from actual part millimeter dimensions.
 * For example:
 * - A 12,000mm wall gets ~12 texture repeats.
 * - A 150mm mechanical part gets a smooth 1x texture.
 */
export function computeDynamicUvScale(dimX: number, dimY: number, baseScaleMm = 1000): THREE.Vector2 {
  const safeDimX = Math.max(1, isNaN(dimX) ? 1000 : dimX);
  const safeDimY = Math.max(1, isNaN(dimY) ? 1000 : dimY);

  const repeatX = Math.max(1, Math.min(60, Math.round(safeDimX / baseScaleMm)));
  const repeatY = Math.max(1, Math.min(60, Math.round(safeDimY / baseScaleMm)));

  return new THREE.Vector2(repeatX, repeatY);
}
