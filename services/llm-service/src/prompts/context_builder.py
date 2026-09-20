"""Context builder for assembling LLM prompts and message sequences."""

import re
from typing import Any, Dict, List, Optional
from src.prompts.system_prompt import CONVERSATIONAL_SYSTEM_PROMPT, SYSTEM_PROMPT


class ContextBuilder:
    """Builds prompt messages for chat completion models (OpenAI, Anthropic, Ollama, Gemini)."""

    @classmethod
    def is_cad_intent(cls, prompt: str, constraints: Optional[Dict[str, Any]] = None) -> bool:
        """Determines if the prompt is asking to design, create, or modify 3D CAD geometry."""
        if constraints and any(v for v in constraints.values() if v is not None and v != ""):
            return True

        text = prompt.strip().lower()
        if not text:
            return False

        # Casual conversational greetings and chit-chat
        greetings = {
            "hi", "hello", "hey", "hola", "howdy", "sup", "yo", "greetings",
            "hi there", "hello there", "hey there", "whats up", "what's up",
            "good morning", "good afternoon", "good evening", "good day",
            "who are you", "what are you", "what can you do", "help",
            "tell me about yourself", "how are you", "thanks", "thank you",
            "thx", "cool", "nice", "awesome", "great", "ok", "okay", "bye", "goodbye"
        }
        clean_punct = re.sub(r"[^\w\s]", "", text).strip()
        if clean_punct in greetings or len(clean_punct) <= 2:
            return False

        # Meta, assistance, review, model inquiry, and latency questions (NOT CAD generation)
        meta_conversational_patterns = [
            r"\b(who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do)\b",
            r"\b(what\s+model|which\s+model|your\s+model|current\s+model|fast\s+model|cad\s+model)\b",
            r"\b(code\s+review|review\s+the\s+code|review\s+code|fix\s+the\s+review|review\s+and\s+fix|fix\s+the\s+code\s+review)\b",
            r"\b(latency|seconds?|ms|delay|fast|slow|speed|why\s+taking|why\s+did\s+it\s+take)\b",
            r"\b(can\s+you\s+help|help\s+me|how\s+to\s+use|how\s+does\s+this\s+work)\b",
        ]
        has_meta_chat = any(bool(re.search(pat, text)) for pat in meta_conversational_patterns)
        has_explicit_3d_geometry_creation = bool(
            re.search(
                r"\b(design|create|build|generate|extrude|revolve|sketch|make)\s+(a|an|the|\d+|new)?\s*(3d|cad|solid|mesh|part|bracket|box|cylinder|sphere|gear|enclosure)\b",
                text,
            )
        )
        if has_meta_chat and not has_explicit_3d_geometry_creation:
            return False

        # Documentation, guides, and specification requests (unless explicit 3D geometry generation is requested)
        is_documentation_request = bool(
            re.search(
                r"\b(documentation|document|docs|writeup|manual|guide|specifications?|spec sheet|overview|readme|summary)\b",
                text,
            )
        )
        has_3d_geometry_intent = bool(
            re.search(
                r"\b(3d\s+model|stl|step|replicad|extrude|revolve|solid|fillet|chamfer|cad\s+model)\b",
                text,
            )
        )
        if is_documentation_request and not has_3d_geometry_intent:
            return False

        # Pure informational questions (unless an explicit design action verb is present)
        is_informational_question = bool(
            re.match(
                r"^(what|which|who|where|when|why|how|can\s+you\s+explain|tell\s+me\s+about|explain)\b",
                text,
            )
        )

        has_explicit_design_verb = bool(
            re.search(
                r"\b(design|create|build|generate|sketch|extrude|revolve|modify|adjust|update|scale|resize|add\s+\d+|cut|cutout)\b",
                text,
            )
        )

        if is_informational_question and not has_explicit_design_verb:
            return False

        # CAD keywords indicating geometric, component, or dimensional modeling requests
        cad_keywords_pattern = (
            r"\b(design|create|model|build|make|generate|sketch|extrude|revolve|"
            r"fillet|chamfer|render|construct|assemble|modify|update|resize|scale|"
            r"increase|decrease|adjust|tweak|thicken|widen|shorten|lengthen|"
            r"box|cube|cylinder|sphere|cone|torus|gear|bracket|mount|case|enclosure|"
            r"chassis|housing|flange|screw|bolt|nut|washer|thread|hole|pocket|"
            r"bearing|spacer|standoff|plate|panel|hinge|latch|handle|knob|wheel|"
            r"pulley|coupler|fitting|nozzle|adapter|cap|lid|plug|container|tray|"
            r"stand|holder|clamp|clip|arm|lever|propeller|duct|pipe|tube|bushing|"
            r"shaft|pin|gasket|lens|window|mesh|cad|3d|replicad|solid|geometry|"
            r"diameter|radius|thickness|tolerance|clearance|parametric|mm|cm)\b"
        )

        return bool(re.search(cad_keywords_pattern, text))

    @classmethod
    def build_generation_messages(
        cls,
        user_prompt: str,
        constraints: Optional[Dict[str, Any]] = None,
        include_examples: bool = False,
        is_cad_task: Optional[bool] = None,
    ) -> List[Dict[str, str]]:
        if is_cad_task is None:
            is_cad_task = cls.is_cad_intent(user_prompt, constraints)

        # For normal conversational prompts: use lightweight prompt without CAD overhead
        if not is_cad_task:
            return [
                {"role": "system", "content": CONVERSATIONAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt.strip()},
            ]

        # For CAD generation requests: use full Replicad system prompt
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if include_examples:
            messages.append({
                "role": "user",
                "content": "Create a high transparency glass lens with an aluminum mounting barrel.",
            })
            messages.append({
                "role": "assistant",
                "content": "```typescript\nimport { makeCylinder } from \"replicad\";\nexport const defaultParams = { radius: 25 };\nexport default function main(params = defaultParams) {\n  return [\n    {\n      name: \"GlassLens\",\n      shape: makeCylinder(params.radius, 5),\n      color: \"#93c5fd\",\n      material: \"glass\",\n      opacity: 0.25,\n      transmission: 0.95,\n      ior: 1.52,\n      transparent: true,\n    }\n  ];\n}\n```",
            })

        user_content = user_prompt.strip()
        if constraints:
            constraint_lines = []
            if "max_dimensions" in constraints:
                constraint_lines.append(f"- Max Dimensions (mm): {constraints['max_dimensions']}")
            if "materials" in constraints:
                constraint_lines.append(f"- Requested Materials: {constraints['materials']}")
            if "glass" in constraints:
                constraint_lines.append(f"- Glass/Optics Requirement: {constraints['glass']}")
            if constraint_lines:
                user_content += "\n\nDesign Constraints & Requirements:\n" + "\n".join(constraint_lines)
                user_content += (
                    "\n\n(Design constraints are specified. Generate the corresponding Replicad TypeScript 3D CAD model.)"
                )

        messages.append({"role": "user", "content": user_content})
        return messages

    @classmethod
    def build_refinement_messages(
        cls,
        refinement_prompt: str,
        previous_code: str,
        previous_parameters: Optional[Dict[str, Any]] = None,
        is_cad_task: Optional[bool] = None,
    ) -> List[Dict[str, str]]:
        if is_cad_task is None:
            is_cad_task = cls.is_cad_intent(refinement_prompt)

        # For normal conversational follow-ups: lightweight system prompt without regenerating code
        if not is_cad_task:
            return [
                {"role": "system", "content": CONVERSATIONAL_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"The user has an existing Replicad 3D CAD model open in the viewer:\n\n"
                        f"```typescript\n{previous_code.strip()}\n```\n\n"
                        f"User Prompt:\n{refinement_prompt.strip()}\n\n"
                        "Instructions:\n"
                        "- Answer the user's question, explanation, or comment concisely and helpfully in Markdown.\n"
                        "- DO NOT output or regenerate any Replicad code blocks or 3D geometry scripts, keeping responses fast and relevant."
                    ),
                },
            ]

        # For CAD refinement/modification requests: use full Replicad system prompt
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        context = (
            f"Here is the existing Replicad TypeScript CAD model:\n\n"
            f"```typescript\n{previous_code.strip()}\n```\n\n"
        )
        if previous_parameters:
            context += f"Current parameter values:\n{previous_parameters}\n\n"

        context += (
            f"User Prompt:\n{refinement_prompt.strip()}\n\n"
            "Instructions:\n"
            "- If the user is requesting a change, adjustment, addition, deletion, or modification to this 3D CAD model: "
            "provide the complete updated Replicad TypeScript code enclosed within ```typescript ... ``` incorporating the requested changes.\n"
            "- If the user is asking a general question, asking for explanations about the model, or having a conversation (and NOT asking to modify the 3D model geometry): "
            "answer directly and concisely in Markdown. DO NOT regenerate or output the Replicad code block, keeping responses fast and relevant."
        )

        messages.append({"role": "user", "content": context})
        return messages
