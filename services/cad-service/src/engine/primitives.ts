import * as replicad from "replicad";

export interface BoxDimensions {
  dx?: number;
  dy?: number;
  dz?: number;
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  length?: number;
  height?: number;
  centered?: boolean;
}

/**
 * Commercial-grade polyfill for makeBox.
 * Creates an exact 3D solid box with support for various invocation styles:
 * - makeBox(dx, dy, dz)
 * - makeBox(dx, dy, dz, [originX, originY, originZ])
 * - makeBox([dx, dy, dz])
 * - makeBox({ width, length, height }) or makeBox({ dx, dy, dz })
 */
export function makeBox(
  xOrDims: number | [number, number, number] | BoxDimensions,
  y?: number,
  z?: number,
  origin?: [number, number, number]
): any {
  let dx = 10;
  let dy = 10;
  let dz = 10;
  let isCentered = true;

  if (Array.isArray(xOrDims)) {
    dx = xOrDims[0] ?? 10;
    dy = xOrDims[1] ?? 10;
    dz = xOrDims[2] ?? 10;
  } else if (typeof xOrDims === "object" && xOrDims !== null) {
    dx = xOrDims.dx ?? xOrDims.width ?? xOrDims.x ?? 10;
    dy = xOrDims.dy ?? xOrDims.length ?? xOrDims.y ?? 10;
    dz = xOrDims.dz ?? xOrDims.height ?? xOrDims.z ?? 10;
    if (typeof xOrDims.centered === "boolean") {
      isCentered = xOrDims.centered;
    }
  } else if (typeof xOrDims === "number") {
    dx = xOrDims;
    dy = typeof y === "number" ? y : dx;
    dz = typeof z === "number" ? z : dy;
  }

  // Ensure non-zero positive dimensions
  dx = Math.max(0.001, Number(dx) || 10);
  dy = Math.max(0.001, Number(dy) || 10);
  dz = Math.max(0.001, Number(dz) || 10);

  let solid: any;
  try {
    if (typeof (replicad as any).makeBaseBox === "function") {
      solid = (replicad as any).makeBaseBox(dx, dy, dz);
    } else {
      solid = (replicad as any).drawRectangle(dx, dy).sketchOnPlane("XY").extrude(dz);
    }
  } catch (_err) {
    solid = (replicad as any).drawRectangle(dx, dy).sketchOnPlane("XY").extrude(dz);
  }

  if (Array.isArray(origin) && origin.length === 3) {
    solid = solid.translate(origin);
  } else if (!isCentered) {
    // If not centered, offset from center so corner is at (0, 0, 0)
    solid = solid.translate([dx / 2, dy / 2, 0]);
  }

  return solid;
}

export interface ConeDimensions {
  radius?: number;
  radius1?: number;
  radius2?: number;
  r1?: number;
  r2?: number;
  height?: number;
  h?: number;
}

/**
 * Commercial-grade polyfill for makeCone.
 * Creates an exact 3D solid cone or truncated cone (frustum):
 * - makeCone(radius, height)
 * - makeCone(radius1, radius2, height)
 * - makeCone({ radius1, radius2, height })
 */
export function makeCone(
  r1OrOptions: number | ConeDimensions,
  r2OrHeight?: number,
  heightParam?: number,
  location: [number, number, number] = [0, 0, 0]
): any {
  let r1 = 10;
  let r2 = 0;
  let h = 20;

  if (typeof r1OrOptions === "object" && r1OrOptions !== null) {
    r1 = r1OrOptions.radius1 ?? r1OrOptions.r1 ?? r1OrOptions.radius ?? 10;
    r2 = r1OrOptions.radius2 ?? r1OrOptions.r2 ?? 0;
    h = r1OrOptions.height ?? r1OrOptions.h ?? 20;
  } else if (typeof r1OrOptions === "number") {
    r1 = r1OrOptions;
    if (typeof heightParam === "number") {
      // makeCone(r1, r2, h)
      r2 = typeof r2OrHeight === "number" ? r2OrHeight : 0;
      h = heightParam;
    } else {
      // makeCone(radius, height)
      r2 = 0;
      h = typeof r2OrHeight === "number" ? r2OrHeight : 20;
    }
  }

  // Ensure non-zero positive dimensions
  r1 = Math.max(0.001, Number(r1) || 10);
  r2 = Math.max(0, Number(r2) || 0);
  h = Math.max(0.001, Number(h) || 20);

  let cone: any;
  if (r2 <= 0.0001) {
    // Sharp cone revolving a right triangle around Z
    cone = (replicad as any)
      .draw([0, 0])
      .hLine(r1)
      .lineTo([0, h])
      .close()
      .sketchOnPlane("XZ")
      .revolve([0, 0, 1]);
  } else {
    // Truncated cone (frustum) revolving a trapezoid around Z
    cone = (replicad as any)
      .draw([0, 0])
      .hLine(r1)
      .lineTo([r2, h])
      .hLine(-r2)
      .close()
      .sketchOnPlane("XZ")
      .revolve([0, 0, 1]);
  }

  if (Array.isArray(location) && (location[0] !== 0 || location[1] !== 0 || location[2] !== 0)) {
    cone = cone.translate(location);
  }

  return cone;
}

/**
 * Polyfill for makeTorus.
 * - makeTorus(majorRadius, minorRadius)
 */
export function makeTorus(majorRadius = 25, minorRadius = 5): any {
  const maj = Math.max(0.001, Number(majorRadius) || 25);
  const min = Math.max(0.001, Number(minorRadius) || 5);

  const oc = (replicad as any).getOC?.();
  if (oc && oc.BRepPrimAPI_MakeTorus_1) {
    try {
      const torusMaker = new oc.BRepPrimAPI_MakeTorus_1(maj, min);
      const solid = new (replicad as any).Solid(torusMaker.Shape());
      torusMaker.delete();
      return solid;
    } catch (_err) {
      // Fall through to 2D revolve
    }
  }

  return (replicad as any)
    .drawCircle(min)
    .translate([maj, 0])
    .sketchOnPlane("XZ")
    .revolve([0, 0, 1]);
}

/**
 * Helper to prevent errors when script imports `{ sketchOnPlane }` from replicad.
 */
export function sketchOnPlane(plane: any = "XY", drawing?: any): any {
  if (drawing && typeof drawing.sketchOnPlane === "function") {
    return drawing.sketchOnPlane(plane);
  }
  if (typeof plane?.sketchOnPlane === "function") {
    return plane.sketchOnPlane(drawing || "XY");
  }
  return (drw: any) => (typeof drw?.sketchOnPlane === "function" ? drw.sketchOnPlane(plane) : drw);
}
