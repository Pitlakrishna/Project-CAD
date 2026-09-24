"""Context builder for assembling LLM prompts and message sequences."""

import re
from typing import Any, Dict, List, Optional
from src.prompts.system_prompt import CONVERSATIONAL_SYSTEM_PROMPT, SYSTEM_PROMPT


class ContextBuilder:
    """Builds prompt messages for chat completion models (OpenAI, Anthropic, Ollama, Gemini)."""

    @classmethod
    def is_cad_intent(cls, prompt: str, constraints: Optional[Dict[str, Any]] = None) -> bool:
        """Determines if the prompt explicitly directs the system to generate, create, or modify a 3D CAD/print model.
        Prevents burning expensive CAD tokens on informational questions, 3D printing advice, explanations, or chat.
        """
        if constraints and any(v for v in constraints.values() if v is not None and v != ""):
            return True

        text = prompt.strip().lower()
        if not text:
            return False

        # 1. Casual conversational greetings and chit-chat
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

        # 2. Informational questions, advice, troubleshooting, and explanation queries (STRICTLY NON-CAD)
        # Prevents token burn on: "how to slice for 3d printing", "what infill should i use", "why did my print warp", "explain staircase"
        is_informational_or_advice = bool(
            re.search(
                r"^(?:what|which|who|where|when|why|how|can\s+you\s+explain|tell\s+me\s+about|explain|describe|give\s+me\s+advice|suggest|recommend|review|summarize)\b|"
                r"\b(?:how\s+to\s+slice|slicing\s+settings|infill\s+percentage|print\s+settings|bed\s+temperature|nozzle\s+temp|warping|layer\s+height|layer\s+adhesion|stringing|first\s+layer|adhesion|extrusion|difference\s+between|compare)\b",
                text,
            )
        )
        # Check if the informational query has an explicit direct modeling command like "design a", "generate a 3d", "create a 3d"
        has_direct_modeling_command = bool(
            re.search(
                r"\b(?:design|create|build|generate|make|model)\s+(?:me\s+)?(?:a|an|the|\d+|new)?\s*(?:3d|cad|solid|mesh|stl|step|printable)\b|"
                r"\b(?:design|create|build|generate|make|model)\s+(?:me\s+)?(?:a|an|the|\d+|new)?\s*(?:bracket|gear|nut|bolt|screw|washer|enclosure|box|case|housing|flange|nozzle|holder|mount|stand|standoff|chassis|staircase|foundation|cylinder|sphere|cone|clamp|clip|pipe|duct|bushing|propeller|hook|hanger|handle|knob|adapter|tray|cap|cover|lid|vase|planter|plate|wheel|pulley|funnel|rack)\b",
                text,
            )
        )
        if is_informational_or_advice and not has_direct_modeling_command:
            return False

        # 3. Documentation, specs, manuals, and code review (STRICTLY NON-CAD)
        is_documentation_request = bool(
            re.search(
                r"\b(documentation|document|docs|writeup|manual|guide|specifications?|spec sheet|overview|readme|summary|review\s+code|code\s+review)\b",
                text,
            )
        )
        if is_documentation_request and not has_direct_modeling_command:
            return False

        # 4. Explicit 3D Printing / 3D Modeling Directive
        # e.g. "3d print a phone stand", "print a gear in 3d", "print me an enclosure"
        is_direct_3d_print_command = bool(
            re.search(
                r"\b(?:3d\s*print|print\s+(?:in\s+)?3d|print\s+(?:me\s+)?(?:a|an)?)\s+[\w\s]{2,40}\b",
                text,
            ) and not re.search(r"\b(?:how|why|settings?|temperature|bed|slicer|layer|infill|fail|warping|problem|issue)\b", text)
        )
        if is_direct_3d_print_command:
            return True

        # 5. Explicit CAD Creation Verbs coupled with 3D / Mechanical Geometry Objects
        # Must have BOTH a creation/design verb AND a concrete 3D object/part or 3D keyword!
        has_creation_verb = bool(
            re.search(
                r"\b(design|create|build|generate|model|make|construct|extrude|revolve|fabricate)\b",
                text,
            )
        )
        has_3d_target = bool(
            re.search(
                r"\b(3d|cad|solid|mesh|replicad|stl|step|model|assembly|printable)\b|"
                r"\b(bracket|gear|nut|bolt|screw|washer|enclosure|box|case|housing|flange|mount|stand|standoff|chassis|hinge|staircase|foundation|cylinder|sphere|cone|nozzle|holder|clamp|clip|pipe|duct|bushing|propeller|hook|hanger|handle|knob|adapter|tray|cap|cover|lid|vase|planter|plate|wheel|pulley|funnel|rack)\b",
                text,
            )
        )

        if has_creation_verb and has_3d_target:
            return True

        # 6. Explicit Parametric Modification Directives (Editing an existing CAD model)
        # e.g. "modify height to 50mm", "make it wider by 10mm", "add 4 screw holes", "fillet the edges", "increase the glass lid thickness"
        is_cad_modification = bool(
            re.search(
                r"\b(modify|resize|scale|enlarge|shrink)\b|"
                r"\bmake\s+(?:it|the\s+[\w\s]{1,25})\s+(wider|thicker|taller|bigger|smaller|longer|narrower|shorter)\b|"
                r"\b(increase|decrease|reduce)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(radius|diameter|height|width|length|thickness|size|depth)\b|"
                r"\badd\s+(?:\d+\s+)?(?:[\w\s]{1,20}\s+)?(mm|cm|holes?|screws?|fillets?|chamfers?|slots?|ribs?|cutouts?|pockets?)\b|"
                r"\b(fillet|chamfer|round|bevel)\s+(?:the\s+)?(?:[\w\s]{1,20}\s+)?(edges?|corners?)\b|"
                r"\bchange\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(radius|diameter|height|width|length|thickness|color|material|dimension)\b",
                text,
            )
        )
        if is_cad_modification:
            return True

        # Default to False: Do NOT burn CAD tokens unless the user specifically asked for a 3D model!
        return False

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
