"""Parser and sanitizer for Replicad TypeScript CAD scripts."""

import re
from typing import Any, Dict, List, Optional, Tuple
from src.api.schemas import MaterialType, ParameterDefinition, PartVisualSchema
from src.domain.exceptions import SecurityViolationException
from src.domain.models import ParsedCadModel


class ReplicadParser:
    """Parses, sanitizes, and extracts structured metadata from Replicad TypeScript code."""

    DEFAULT_PART_COLOR: str = "#3B82F6"
    DEFAULT_PART_NAME: str = "MainSolid"

    UNSAFE_PATTERNS = [
        r"\beval\s*\(",
        r"\bFunction\s*\(",
        r"\bprocess\.",
        r"\bchild_process\b",
        r"\brequire\s*\(",
        r"\bimport\s+.*from\s+['\"](?:fs|path|os|http|https|net|child_process)['\"]",
        r"\bfetch\s*\(",
        r"\bXMLHttpRequest\b",
        r"\bdocument\.",
        r"\bwindow\.",
        r"\blocalStorage\b",
        r"\bsessionStorage\b",
    ]

    @classmethod
    def extract_code_and_explanation(cls, raw_text: str) -> Tuple[str, Optional[str]]:
        """Extracts TypeScript code block from LLM response, along with any surrounding commentary."""
        raw_text = raw_text.strip()

        # Match ```typescript ... ``` or ```ts ... ``` or ```javascript ... ```
        pattern = r"```(?:typescript|ts|javascript|js)?\s*\n(.*?)```"
        matches = list(re.finditer(pattern, raw_text, re.DOTALL | re.IGNORECASE))

        if not matches:
            # Fallback for unclosed code blocks (e.g. if generation ended before closing backticks)
            unclosed_pattern = r"```(?:typescript|ts|javascript|js)?\s*\n(.*?)$"
            matches = list(re.finditer(unclosed_pattern, raw_text, re.DOTALL | re.IGNORECASE))

        if matches:
            # Take the largest code block (typically the full model script)
            largest_match = max(matches, key=lambda m: len(m.group(1)))
            code = largest_match.group(1).strip()

            # Explanation is everything outside the code block
            pre_text = raw_text[: largest_match.start()].strip()
            post_text = raw_text[largest_match.end() :].strip()
            explanation_parts = [p for p in (pre_text, post_text) if p]
            explanation = "\n\n".join(explanation_parts) if explanation_parts else None

            return code, explanation

        # If no markdown fences are used but code looks like a Replicad script
        if "export default function main" in raw_text or "defaultParams" in raw_text or "replicad" in raw_text:
            return raw_text, None

        # If no Replicad code was generated (conversational prompt, general question, or non-design answer)
        return "", raw_text.strip()

    @classmethod
    def validate_security(cls, code: str) -> None:
        """Ensures the generated code does not execute unsafe I/O, networking, or eval."""
        for pattern in cls.UNSAFE_PATTERNS:
            if re.search(pattern, code):
                raise SecurityViolationException(f"Security violation: code contains forbidden pattern '{pattern}'")

    @classmethod
    def extract_parameters(cls, code: str) -> Tuple[Dict[str, Any], List[ParameterDefinition]]:
        """Extracts defaultParams object and infers UI slider boundaries."""
        params_dict: Dict[str, Any] = {}
        param_defs: List[ParameterDefinition] = []

        # Find export const defaultParams = { ... };
        match = re.search(r"(?:export\s+)?const\s+defaultParams\s*=\s*\{([^}]+)\}", code, re.DOTALL)
        if not match:
            return params_dict, param_defs

        params_block = match.group(1)
        # Parse lines: key: value, // optional comment
        line_pattern = r"([a-zA-Z0-9_]+)\s*:\s*([^,\n]+)(?:,)?(?:\s*//\s*(.*))?"

        for line_match in re.finditer(line_pattern, params_block):
            key = line_match.group(1).strip()
            val_str = line_match.group(2).strip()
            comment = line_match.group(3).strip() if line_match.group(3) else None

            # Parse value type
            parsed_val: Any
            param_type = "number"

            if val_str.lower() in ("true", "false"):
                parsed_val = val_str.lower() == "true"
                param_type = "boolean"
                param_defs.append(
                    ParameterDefinition(
                        name=key,
                        default_value=parsed_val,
                        param_type=param_type,
                        description=comment,
                    )
                )
            elif re.match(r"^-?\d+(?:\.\d+)?$", val_str):
                parsed_val = float(val_str) if "." in val_str else int(val_str)
                # Compute sensible slider bounds
                min_val = round(max(0.1, parsed_val * 0.2), 1) if parsed_val > 0 else 0.0
                max_val = round(max(parsed_val * 2.5, parsed_val + 50.0), 1)
                step = 0.1 if isinstance(parsed_val, float) or parsed_val < 10 else 1.0

                param_defs.append(
                    ParameterDefinition(
                        name=key,
                        default_value=parsed_val,
                        param_type=param_type,
                        min_value=min_val,
                        max_value=max_val,
                        step=step,
                        description=comment,
                    )
                )
            else:
                # String value (strip quotes)
                parsed_val = val_str.strip("'\"")
                param_type = "string"
                param_defs.append(
                    ParameterDefinition(
                        name=key,
                        default_value=parsed_val,
                        param_type=param_type,
                        description=comment,
                    )
                )

            params_dict[key] = parsed_val

        return params_dict, param_defs

    @classmethod
    def extract_parts_and_materials(cls, code: str) -> Tuple[List[PartVisualSchema], List[str], bool]:
        """Extracts assembly parts with their colors, physical materials, and glass properties."""
        parts: List[PartVisualSchema] = []
        materials_set = set()
        has_glass = False

        # Match object literals inside return array: { name: "...", shape: ..., ... }
        part_pattern = r"\{\s*name\s*:\s*[\"']([^\"']+)[\"']\s*,\s*shape\s*:\s*([^,}]+)(.*?)\}"
        part_matches = list(re.finditer(part_pattern, code, re.DOTALL))

        for m in part_matches:
            name = m.group(1).strip()
            rest = m.group(3)

            # Color
            color_match = re.search(r"color\s*:\s*[\"'](#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[\"']", rest)
            color = color_match.group(1) if color_match else "#3b82f6"

            # Material
            mat_match = re.search(r"material\s*:\s*[\"']([a-zA-Z0-9_]+)[\"']", rest)
            raw_material = mat_match.group(1).lower() if mat_match else "plastic"

            try:
                material = MaterialType(raw_material)
            except ValueError:
                material = MaterialType.CUSTOM

            # Opacity
            opacity_match = re.search(r"opacity\s*:\s*([0-9.]+)", rest)
            opacity = float(opacity_match.group(1)) if opacity_match else (0.35 if material == MaterialType.GLASS else 1.0)

            # Roughness
            roughness_match = re.search(r"roughness\s*:\s*([0-9.]+)", rest)
            roughness = float(roughness_match.group(1)) if roughness_match else (0.05 if material == MaterialType.GLASS else 0.3)

            # Metalness
            metalness_match = re.search(r"metalness\s*:\s*([0-9.]+)", rest)
            metalness = float(metalness_match.group(1)) if metalness_match else (0.9 if material == MaterialType.METAL else 0.0)

            # Transmission (for optics/glass)
            trans_match = re.search(r"transmission\s*:\s*([0-9.]+)", rest)
            transmission = float(trans_match.group(1)) if trans_match else (0.95 if material == MaterialType.GLASS else 0.0)

            # Index of Refraction (IOR)
            ior_match = re.search(r"ior\s*:\s*([0-9.]+)", rest)
            ior = float(ior_match.group(1)) if ior_match else 1.52

            # Transparent flag
            transparent_match = re.search(r"transparent\s*:\s*(true|false)", rest, re.IGNORECASE)
            transparent = transparent_match.group(1).lower() == "true" if transparent_match else (opacity < 1.0 or transmission > 0.0)

            if material == MaterialType.GLASS or transparent or transmission > 0.1:
                has_glass = True

            materials_set.add(material.value)

            parts.append(
                PartVisualSchema(
                    name=name,
                    color=color,
                    material=material,
                    opacity=opacity,
                    roughness=roughness,
                    metalness=metalness,
                    transmission=transmission,
                    ior=ior,
                    transparent=transparent,
                )
            )

        # Fallback if single shape returned or parts array not matched
        if not parts:
            default_color = cls.DEFAULT_PART_COLOR
            default_mat = MaterialType.PLASTIC
            parts.append(
                PartVisualSchema(
                    name=cls.DEFAULT_PART_NAME,
                    color=default_color,
                    material=default_mat,
                    opacity=1.0,
                    roughness=0.3,
                    metalness=0.0,
                    transparent=False,
                )
            )
            materials_set.add(default_mat.value)

        return parts, sorted(list(materials_set)), has_glass

    @classmethod
    def parse_cad_output(cls, raw_text: str) -> ParsedCadModel:
        """Full pipeline: extract code, sanitize security, extract parameters and assembly parts."""
        code, explanation = cls.extract_code_and_explanation(raw_text)

        # Handle conversational / non-design responses without code
        if not code or not code.strip():
            return ParsedCadModel(
                code="",
                parameters={},
                parameter_definitions=[],
                parts=[],
                materials=[],
                has_glass=False,
                explanation=explanation or raw_text.strip(),
            )

        cls.validate_security(code)

        parameters, param_defs = cls.extract_parameters(code)
        parts, materials, has_glass = cls.extract_parts_and_materials(code)

        return ParsedCadModel(
            code=code,
            parameters=parameters,
            parameter_definitions=param_defs,
            parts=parts,
            materials=materials,
            has_glass=has_glass,
            explanation=explanation,
        )
