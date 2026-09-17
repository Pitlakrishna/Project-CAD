"""Deterministic Mock LLM Provider for local testing and offline execution."""

import time
from typing import Dict, List, Optional
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider


class MockLlmProvider(BaseLlmProvider):
    """Provides pre-validated, high quality Replicad 3D models with colors, metals, and glass."""

    GLASS_ENCLOSURE_TEMPLATE = '''```typescript
import {
  drawRoundedRectangle,
  makeCylinder,
  sketchOnPlane,
} from "replicad";

export const defaultParams = {
  length: 110,
  width: 70,
  height: 30,
  wallThickness: 2.5,
  glassLidThickness: 3.0,
  cornerRadius: 6.0,
};

export type ModelParams = typeof defaultParams;

export default function main(params: ModelParams = defaultParams) {
  const { length, width, height, wallThickness, glassLidThickness, cornerRadius } = params;

  // 1. Base Housing (ABS Plastic)
  const outerProfile = drawRoundedRectangle(length, width, cornerRadius);
  const outerSolid = outerProfile.sketchOnPlane("XY").extrude(height);

  const innerProfile = drawRoundedRectangle(
    length - 2 * wallThickness,
    width - 2 * wallThickness,
    Math.max(1, cornerRadius - wallThickness)
  );
  const innerCavity = innerProfile
    .sketchOnPlane("XY")
    .extrude(height - wallThickness + 0.1)
    .translate([0, 0, wallThickness]);

  const baseHousing = outerSolid.cut(innerCavity);

  // 2. Clear Tempered Glass Cover Lid (with 0.25mm perimeter tolerance)
  const clearance = 0.25;
  const glassProfile = drawRoundedRectangle(
    length - 2 * clearance,
    width - 2 * clearance,
    cornerRadius
  );
  const glassLid = glassProfile
    .sketchOnPlane("XY")
    .extrude(glassLidThickness)
    .translate([0, 0, height]);

  // 3. Metallic Corner Retainer Screws (Brushed Stainless Steel)
  const screwRadius = 2.2;
  const screwHeight = 2.5;
  const sOffset = cornerRadius;
  const positions = [
    [-length / 2 + sOffset, -width / 2 + sOffset],
    [length / 2 - sOffset, -width / 2 + sOffset],
    [-length / 2 + sOffset, width / 2 - sOffset],
    [length / 2 - sOffset, width / 2 - sOffset],
  ];

  let screws = makeCylinder(screwRadius, screwHeight).translate([
    positions[0][0],
    positions[0][1],
    height + glassLidThickness,
  ]);

  for (let i = 1; i < positions.length; i++) {
    const s = makeCylinder(screwRadius, screwHeight).translate([
      positions[i][0],
      positions[i][1],
      height + glassLidThickness,
    ]);
    screws = screws.fuse(s);
  }

  return [
    {
      name: "EnclosureBase",
      shape: baseHousing,
      color: "#1e293b", // Deep slate matte casing
      material: "plastic",
      roughness: 0.45,
      metalness: 0.0,
      opacity: 1.0,
      transparent: false,
    },
    {
      name: "TemperedGlassLid",
      shape: glassLid,
      color: "#93c5fd", // Sky tinted optical glass
      material: "glass",
      roughness: 0.04,
      metalness: 0.02,
      transmission: 0.96,
      opacity: 0.32,
      ior: 1.52,
      transparent: true,
    },
    {
      name: "RetainingFasteners",
      shape: screws,
      color: "#e2e8f0", // Stainless steel
      material: "metal",
      roughness: 0.2,
      metalness: 0.95,
      opacity: 1.0,
      transparent: false,
    },
  ];
}
```

This model provides a watertight electronics enclosure with an injection-molded plastic base, a precision tempered glass inspection window, and stainless steel fasteners.'''

    GLASS_OPTIC_TEMPLATE = '''```typescript
import {
  makeCylinder,
  makeSphere,
  sketchOnPlane,
} from "replicad";

export const defaultParams = {
  barrelDiameter: 50,
  barrelLength: 60,
  lensDiameter: 44,
  lensThickness: 8,
  retainingRingThickness: 4,
};

export type ModelParams = typeof defaultParams;

export default function main(params: ModelParams = defaultParams) {
  const {
    barrelDiameter,
    barrelLength,
    lensDiameter,
    lensThickness,
    retainingRingThickness,
  } = params;

  const barrelRadius = barrelDiameter / 2;
  const lensRadius = lensDiameter / 2;

  // 1. Anodized Aluminum Outer Optical Barrel
  const outerBarrel = makeCylinder(barrelRadius, barrelLength);
  const innerBore = makeCylinder(lensRadius - 2, barrelLength + 0.2).translate([0, 0, -0.1]);
  const lensShoulderBore = makeCylinder(lensRadius + 0.1, lensThickness + retainingRingThickness).translate([
    0,
    0,
    barrelLength - lensThickness - retainingRingThickness,
  ]);
  const barrel = outerBarrel.cut(innerBore).cut(lensShoulderBore);

  // 2. Crown Glass Biconvex Lens
  const lensBase = makeCylinder(lensRadius, lensThickness).translate([
    0,
    0,
    barrelLength - lensThickness - retainingRingThickness,
  ]);

  // 3. Threaded Retaining Ring (Brass)
  const ringOuter = makeCylinder(lensRadius + 0.1, retainingRingThickness).translate([
    0,
    0,
    barrelLength - retainingRingThickness,
  ]);
  const ringAperture = makeCylinder(lensRadius - 2.5, retainingRingThickness + 0.2).translate([
    0,
    0,
    barrelLength - retainingRingThickness - 0.1,
  ]);
  const retainingRing = ringOuter.cut(ringAperture);

  return [
    {
      name: "OpticalBarrel",
      shape: barrel,
      color: "#334155", // Anodized dark titanium
      material: "metal",
      roughness: 0.25,
      metalness: 0.9,
      opacity: 1.0,
      transparent: false,
    },
    {
      name: "CrownGlassLens",
      shape: lensBase,
      color: "#cbd5e1", // Ultra-clear optical glass
      material: "glass",
      roughness: 0.02,
      metalness: 0.0,
      transmission: 0.99,
      opacity: 0.25,
      ior: 1.52,
      transparent: true,
    },
    {
      name: "BrassRetainingRing",
      shape: retainingRing,
      color: "#d97706", // Brass alloy
      material: "metal",
      roughness: 0.18,
      metalness: 0.92,
      opacity: 1.0,
      transparent: false,
    },
  ];
}
```

This model generates a precision optical mount assembly featuring an anodized metal barrel, a crown glass lens element with high optical transmission, and a brass retaining ring.'''

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> LlmGenerationResult:
        start_time = time.perf_counter()

        user_content = ""
        for m in reversed(messages):
            if m["role"] == "user":
                user_content = m["content"].lower()
                break

        if any(w in user_content for w in ["lens", "optic", "gauge", "cylinder", "round"]):
            template = self.GLASS_OPTIC_TEMPLATE
        else:
            template = self.GLASS_ENCLOSURE_TEMPLATE

        latency = (time.perf_counter() - start_time) * 1000

        return LlmGenerationResult(
            raw_response=template,
            token_usage=650,
            provider="mock",
            model="mock-cad-generator",
            latency_ms=round(latency, 2),
        )

    async def is_available(self) -> bool:
        return True
