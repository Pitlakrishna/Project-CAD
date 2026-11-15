"""Context builder for assembling LLM prompts and message sequences."""

import re
from typing import Any

from src.prompts.system_prompt import (
    CONVERSATIONAL_SYSTEM_PROMPT,
    CONVERSATIONAL_WITH_DOCS_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)
from src.prompts.threejs_prompt import THREEJS_SCENE_SYSTEM_PROMPT


class ContextBuilder:
    """Builds prompt messages for chat completion models (OpenAI, Anthropic, Ollama, Gemini)."""

    THREEJS_SCENE_TARGETS = (
        r"\b(?:valleys?|mountains?|hills?|canyons?|terrains?|landscapes?|rivers?|lakes?|ponds?|"
        r"waterfalls?|meadows?|forests?|foliage|woods?|nature|plazas?|parks?|environments?|"
        r"game\s*scenes?|cgi|sculpted|organic\s*(?:mesh|trees?|terrain|landscape)|"
        r"threejs\s*scenes?|webgl\s*scenes?|threejs|webgl)\b"
    )

    CAD_DESIGN_TARGETS = (
        r"(?:3d|2d|cad|solid|mesh|replicad|stl|step|stp|dxf|dwg|printable|model|assembly|"
        r"designs?|drawings?|drafts?|sketches?|profiles?|sections?|blueprints?|layouts?|schematics?|"
        r"floor\s*plans?|floorplans?|architectur(?:e|al)|"
        r"houses?|homes?|buildings?|residen(?:ce|tial)|villas?|apartments?|rooms?|walls?|"
        r"courtyards?|garages?|patios?|decks?|sheds?|cabins?|foundations?|footings?|staircases?|"
        r"brackets?|gears?|nuts?|bolts?|screws?|washers?|enclosures?|boxes?|cases?|housings?|"
        r"flanges?|nozzles?|holders?|mounts?|stands?|standoffs?|chassis|cylinders?|spheres?|"
        r"cones?|clamps?|clips?|pipes?|ducts?|bushings?|propellers?|hooks?|hangers?|handles?|"
        r"knobs?|adapters?|trays?|caps?|covers?|lids?|vases?|planters?|plates?|wheels?|"
        r"pulleys?|funnels?|racks?|bearings?|spacers?|couplings?|fittings?|"
        r"taps?|faucets?|valves?|fixtures?|motors?|spouts?|drones?|hardware|devices?|parts?|products?)"
    )

    @classmethod
    def is_document_intent(cls, prompt: str) -> bool:
        """Determines if the prompt explicitly requests a document, report, presentation, spreadsheet, or export."""
        text = prompt.strip().lower()
        if not text:
            return False

        # Casual conversational greetings, thank-yous, chit-chat, and praise (STRICTLY NOT a document generation request)
        clean_punct = re.sub(r"[^\w\s]", "", text).strip()
        is_greeting_or_thanks = bool(
            re.search(
                r"^(?:thanks|thank you|thx|many thanks|appreciate it)(?:\s+(?:so much|a lot|very much|for\b.*))?$|"
                r"^(?:hi|hello|hey|greetings|good morning|good afternoon|good evening)\b|"
                r"^(?:cool|nice|awesome|great|ok|okay|bye|goodbye)(?:\s+(?:job|work|model|design|doc|document|report))?$",
                clean_punct,
            )
        )
        has_doc_action = bool(
            re.search(
                r"\b(?:generate|create|make|write|build|produce|export|draft|provide|prepare|download)\b",
                text,
            )
        )
        if is_greeting_or_thanks and not has_doc_action:
            return False

        return bool(
            re.search(
                r"\b(?:document|documentation|docs?|report|whitepaper|presentation|slides?|deck|ppt|pptx|excel|spreadsheet|sheets?|bom|csv|export|spec\s*sheet|manual|guide|writeup)\b",
                text,
            )
        )

    @classmethod
    def is_threejs_scene_intent(cls, prompt: str) -> bool:
        """Determines if the prompt requests organic nature, terrain, valleys, rivers, or Three.js WebGL scenes."""
        text = prompt.strip().lower()
        if not text:
            return False
        return bool(re.search(cls.THREEJS_SCENE_TARGETS, text, re.IGNORECASE))

    @classmethod
    def is_cad_intent(cls, prompt: str, constraints: dict[str, Any] | None = None) -> bool:
        """Determines if the prompt explicitly directs the system to generate, create, or modify a 2D/3D CAD,
        architectural floor plan, blueprint, or mechanical model.
        Prevents burning expensive CAD tokens on informational questions, 3D printing advice, explanations, or chat.
        """
        if constraints and any(v for v in constraints.values() if v is not None and v != ""):
            return True

        text = prompt.strip().lower()
        if not text:
            return False

        # 1. Casual conversational greetings, chit-chat, and thank-yous (STRICTLY NON-CAD)
        clean_punct = re.sub(r"[^\w\s]", "", text).strip()
        is_greeting_or_chit_chat = bool(
            re.search(
                r"^(?:hi|hello|hey|hola|howdy|sup|yo|greetings|good morning|good afternoon|good evening|good day)\b|"
                r"^(?:who are you|what are you|what can you do|help|tell me about yourself|how are you)\b|"
                r"^(?:thanks|thank you|thx|thank you so much|thanks so much|thanks a lot|thank you very much|many thanks)\b|"
                r"^(?:cool|nice|awesome|great|ok|okay|bye|goodbye|see you)\b",
                clean_punct,
            )
        )
        if is_greeting_or_chit_chat or len(clean_punct) <= 2:
            return False

        # Slicing, print settings, infill, temperature troubleshooting (STRICTLY NON-CAD)
        if re.search(
            r"\b(?:how\s+(?:do\s+i\s+)?slice|slicing\s+settings|infill\s+percentage|print\s+settings|bed\s+temperature|nozzle\s+temp|warping|layer\s+height|layer\s+adhesion|stringing|first\s+layer|adhesion|extrusion)\b",
            text,
        ):
            return False

        # Check for explicit CAD parametric modification directives (e.g. "make it taller", "add holes", "change color")
        is_cad_modification = bool(
            re.search(
                r"\b(?:modify|edit|update|adjust|alter|tweak|revise|re-?engineer)\b|"
                r"\b(?:resize|scale|enlarge|shrink|stretch|compress|expand)\b|"
                r"\b(?:make|render|turn)\s+(?:it|this|the\s+[\w\s]{1,30})\s+(?:wider|thicker|taller|bigger|smaller|longer|narrower|shorter|deeper|flatter|higher|lower|larger|slimmer|round(?:er)?|square|hollow|solid)\b|"
                r"\b(?:increase|decrease|reduce|double|halve|cut|boost|raise|lower)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|size|depth|clearance|tolerance|spacing|count|number|angle|dimension|scale|elevation)\b|"
                r"\badd\s+(?:\d+\s+)?(?:[\w\s]{1,25}\s+)?(?:mm|cm|holes?|screws?|fillets?|chamfers?|slots?|ribs?|cutouts?|pockets?|threads?|handles?|tabs?|flanges?|bevels?|trees?|lakes?|rivers?|mountains?|buildings?|rooms?|walls?|windows?|doors?)\b|"
                r"\b(?:remove|delete|eliminate|take\s+away|cut\s+out)\s+(?:the\s+)?(?:[\w\s]{1,30})\b|"
                r"\b(?:fillet|chamfer|round|bevel|hollow|pocket|extrude|revolve|cut|draft)\b|"
                r"\b(?:change|set|switch|replace|swap)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|color|material|finish|texture|appearance|dimension|shape|size)\b|"
                r"\b(?:color|paint|make)\s+(?:it|the\s+[\w\s]{1,20})\s+(?:red|blue|green|yellow|black|white|grey|gray|orange|purple|gold|silver|bronze|copper|chrome|metallic|transparent|opaque|glass)\b|"
                r"\b(?:material|make\s+it\s+out\s+of)\s+(?:metal|aluminum|steel|brass|wood|plastic|resin|glass|concrete|stone|pla|abs|petg|nylon)\b|"
                r"\b(?:set|make)\s+(?:the\s+)?\w+\s+(?:to|=)\s+\d+|"
                r"\b(?:more|fewer|less)\s+(?:trees?|hills?|valleys?|foliage|mountains?|detail|segments?|facets?)\b|"
                r"\b(?:taller|shorter|wider|thicker|narrower|longer|bigger|smaller|flatter|higher|lower)\b",
                text,
            )
        )
        if is_cad_modification:
            return True

        # Check for direct modeling / design command (allows up to 6 intervening descriptive words/adjectives)
        has_explicit_design_request = bool(
            re.search(
                r"\b(?:design|create|build|generate|make|draw|draft|construct|fabricate|give|provide|show|produce)\b(?:\s*[,;]?\s*[\w-]+){0,6}\s+" + cls.CAD_DESIGN_TARGETS + r"\b|"
                r"\b(?:model)\s+(?:a\s+|an\s+)?(?:\w+\s+){0,3}" + cls.CAD_DESIGN_TARGETS + r"\b",
                text,
            )
        )

        # 2. Informational questions, advice, troubleshooting, and explanation queries (STRICTLY NON-CAD)
        is_pure_question_starter = bool(re.search(r"^(?:what|which|who|where|when|why|how)\b", text))
        if is_pure_question_starter and not has_explicit_design_request:
            return False

        is_informational_or_advice = bool(
            re.search(
                r"^(?:what|which|who|where|when|why|how|can\s+you\s+explain|tell\s+me\s+about|explain|describe|give\s+me\s+advice|suggest|recommend|review|summarize)\b|"
                r"\b(?:how\s+to\s+slice|slicing\s+settings|infill\s+percentage|print\s+settings|bed\s+temperature|nozzle\s+temp|warping|layer\s+height|layer\s+adhesion|stringing|first\s+layer|adhesion|extrusion|difference\s+between|compare)\b",
                text,
            )
        )
        if is_informational_or_advice and not has_explicit_design_request:
            return False

        # Direct 2D / 3D CAD design directive (e.g. "generate 2d design", "2d floor plan", "2d drawing", "give me a 2d design")
        is_direct_2d_3d_design = bool(
            re.search(
                r"\b(?:2d\s+(?:and|&)\s+3d|3d\s+(?:and|&)\s+2d)\b|"
                r"\b(?:2d|3d)\s+(?:cad|design|drawing|draft|blueprint|floor\s*plan|layout|schematic|model|profile|sketch|part|component)\b|"
                r"\b(?:design|create|make|draw|generate|draft|build|give|provide|show)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:2d|3d)\b|"
                r"\b(?:i\s+want|i\s+need|please\s+give|please\s+make|give\s+me|show\s+me)\s+(?:a\s+|an\s+)?(?:\w+\s+){0,3}" + cls.CAD_DESIGN_TARGETS + r"\b",
                text,
            )
        )
        if is_direct_2d_3d_design:
            return True

        # 3. Pure documentation, manuals, spec sheets, and code review (STRICTLY NON-CAD unless paired with design command)
        is_pure_doc_request = bool(
            re.search(
                r"\b(?:write|provide|give|generate|create|make)\s+(?:me\s+)?(?:a\s+)?(?:documentation|docs|user\s+manual|manual|guide|spec\s*sheet|readme)\b|"
                r"^(?:documentation|docs|manual|guide|spec\s*sheet|overview|readme|summary|review\s+code|code\s+review)\b|"
                r"\b(?:code\s+review|review\s+code)\b",
                text,
            )
        )
        if is_pure_doc_request and not has_explicit_design_request:
            return False

        # 4. Explicit 3D Printing / 3D Modeling Directive
        is_direct_3d_print_command = bool(
            re.search(
                r"\b(?:3d\s*print|print\s+(?:in\s+)?3d|print\s+(?:me\s+)?(?:a|an)?)\s+[\w\s]{2,40}\b",
                text,
            ) and not re.search(r"\b(?:how|why|settings?|temperature|bed|slicer|layer|infill|fail|warping|problem|issue)\b", text)
        )
        if is_direct_3d_print_command:
            return True

        # 5. Direct modeling command accepted
        if has_explicit_design_request:
            return True

        # 6. Explicit CAD Creation Verbs coupled with CAD / architectural / mechanical targets
        has_creation_verb = bool(
            re.search(
                r"\b(design|create|build|generate|model|make|construct|extrude|revolve|fabricate|draw|draft)\b",
                text,
            )
        )
        has_cad_target = bool(re.search(r"\b" + cls.CAD_DESIGN_TARGETS + r"\b", text))

        if has_creation_verb and has_cad_target:
            return True

        # 7. Explicit Parametric Modification Directives (Editing an existing CAD model)
        is_cad_modification = bool(
            re.search(
                r"\b(?:modify|edit|update|adjust|alter|tweak|revise|re-?engineer)\b|"
                r"\b(?:resize|scale|enlarge|shrink|stretch|compress|expand)\b|"
                r"\b(?:make|render|turn)\s+(?:it|this|the\s+[\w\s]{1,30})\s+(?:wider|thicker|taller|bigger|smaller|longer|narrower|shorter|deeper|flatter|higher|lower|larger|slimmer|round(?:er)?|square|hollow|solid)\b|"
                r"\b(?:increase|decrease|reduce|double|halve|cut|boost|raise|lower)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|size|depth|clearance|tolerance|spacing|count|number|angle|dimension|scale|elevation)\b|"
                r"\badd\s+(?:\d+\s+)?(?:[\w\s]{1,25}\s+)?(?:mm|cm|holes?|screws?|fillets?|chamfers?|slots?|ribs?|cutouts?|pockets?|threads?|handles?|tabs?|flanges?|bevels?|trees?|lakes?|rivers?|mountains?|buildings?|rooms?|walls?|windows?|doors?)\b|"
                r"\b(?:remove|delete|eliminate|take\s+away|cut\s+out)\s+(?:the\s+)?(?:[\w\s]{1,30})\b|"
                r"\b(?:fillet|chamfer|round|bevel|hollow|pocket|extrude|revolve|cut|draft)\b|"
                r"\b(?:change|set|switch|replace|swap)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|color|material|finish|texture|appearance|dimension|shape|size)\b|"
                r"\b(?:color|paint|make)\s+(?:it|the\s+[\w\s]{1,20})\s+(?:red|blue|green|yellow|black|white|grey|gray|orange|purple|gold|silver|bronze|copper|chrome|metallic|transparent|opaque|glass)\b|"
                r"\b(?:material|make\s+it\s+out\s+of)\s+(?:metal|aluminum|steel|brass|wood|plastic|resin|glass|concrete|stone|pla|abs|petg|nylon)\b|"
                r"\b(?:set|make)\s+(?:the\s+)?\w+\s+(?:to|=)\s+\d+|"
                r"\b(?:more|fewer|less)\s+(?:trees?|hills?|valleys?|foliage|mountains?|detail|segments?|facets?)\b|"
                r"\b(?:taller|shorter|wider|thicker|narrower|longer|bigger|smaller|flatter|higher|lower)\b",
                text,
            )
        )
        if is_cad_modification:
            return True

        # 8. Clarification Choice, Option Selection, or Auto-Search Directives
        is_clarification_or_search_directive = bool(
            re.search(
                r"\b(?:proceed\s+with|select\s+option|option\s+[1-9]|none\s+of\s+the\s+above|auto-search|search\s+(?:google|web|specs?))\b",
                text,
            )
        )
        if is_clarification_or_search_directive:
            return True

        # Default to False: Do NOT burn CAD tokens unless the user specifically asked for a CAD/architectural/3D model!
        return False

    @classmethod
    def _format_history(cls, history: list[Any] | None, max_turns: int = 8) -> list[dict[str, str]]:
        """Optimizes and formats recent conversation history turns for LLM context.
        - Keeps up to max_turns recent messages (sliding window).
        - Condenses previous large code blocks and artifacts to minimize token usage and cost.
        """
        if not history:
            return []

        formatted: list[dict[str, str]] = []
        recent_history = history[-max_turns:]

        for msg in recent_history:
            role = getattr(msg, "role", None) or (msg.get("role") if isinstance(msg, dict) else None)
            content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else None)
            if not role or not content:
                continue

            clean_role = "assistant" if role in ["assistant", "model", "bot"] else "user"
            clean_content = content.strip()

            if clean_role == "assistant":
                # Token optimization: Strip verbose code blocks from previous turns, retaining conversational summary
                clean_content = re.sub(r"```(?:typescript|ts|javascript|js)[\s\S]*?```", "[3D CAD Code Generated]", clean_content)
                clean_content = re.sub(r"```tool:[a-z_]+[\s\S]*?```", "[Document Artifact Generated]", clean_content)
                clean_content = re.sub(r"<file_artifact[\s\S]*?</file_artifact>", "[Document Artifact Generated]", clean_content)
                clean_content = clean_content.strip()
                if not clean_content:
                    clean_content = "[Response generated successfully]"

            if clean_content:
                formatted.append({"role": clean_role, "content": clean_content})

        return formatted

    @classmethod
    def build_generation_messages(
        cls,
        user_prompt: str,
        constraints: dict[str, Any] | None = None,
        include_examples: bool = False,
        is_cad_task: bool | None = None,
        history: list[Any] | None = None,
    ) -> list[dict[str, str]]:
        if is_cad_task is None:
            is_cad_task = cls.is_cad_intent(user_prompt, constraints)

        formatted_history = cls._format_history(history)

        # For normal conversational prompts: use lightweight prompt with history
        if not is_cad_task:
            is_doc = cls.is_document_intent(user_prompt)
            sys_prompt = CONVERSATIONAL_WITH_DOCS_SYSTEM_PROMPT if is_doc else CONVERSATIONAL_SYSTEM_PROMPT
            messages = [{"role": "system", "content": sys_prompt}]
            messages.extend(formatted_history)
            messages.append({"role": "user", "content": user_prompt.strip()})
            return messages

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

        # Inject recent multi-turn context
        messages.extend(formatted_history)

        user_content = user_prompt.strip()
        if constraints:
            constraint_lines = []
            if "verified_standard_spec" in constraints:
                spec = constraints["verified_standard_spec"]
                constraint_lines.append(f"- Grounded Engineering Standard: {spec.get('title')} (Ref: {spec.get('source')})")
                if spec.get("envelope"):
                    constraint_lines.append(f"- Standard Dimensional Envelope (mm): {spec.get('envelope')}")
                if spec.get("materials"):
                    constraint_lines.append(f"- Certified Engineering Materials: {spec.get('materials')}")
            if "max_dimensions" in constraints:
                constraint_lines.append(f"- Max Dimensions (mm): {constraints['max_dimensions']}")
            if "materials" in constraints:
                constraint_lines.append(f"- Requested Materials: {constraints['materials']}")
            if "glass" in constraints:
                constraint_lines.append(f"- Glass/Optics Requirement: {constraints['glass']}")
            if constraint_lines:
                user_content += "\n\nDesign Constraints & Requirements:\n" + "\n".join(constraint_lines)
                user_content += (
                    "\n\n(Design constraints are specified. Generate the corresponding Replicad TypeScript 3D CAD model adhering to these dimensions and materials.)"
                )

        messages.append({"role": "user", "content": user_content})
        return messages

    @classmethod
    def build_threejs_messages(
        cls,
        user_prompt: str,
        history: list[Any] | None = None,
    ) -> list[dict[str, str]]:
        """Builds prompt messages instructing the model to generate native procedural Three.js WebGL scene code."""
        formatted_history = cls._format_history(history)
        messages = [{"role": "system", "content": THREEJS_SCENE_SYSTEM_PROMPT}]
        messages.extend(formatted_history)
        messages.append({
            "role": "user",
            "content": (
                f"{user_prompt.strip()}\n\n"
                "(Generate native Three.js procedural WebGL scene code. Define `function buildScene(tools)` using `tools.noise2D` "
                "for organic terrain and `tools.add(mesh)` for all objects. Output code in ```javascript markdown fences.)"
            ),
        })
        return messages

    @classmethod
    def build_threejs_refinement_messages(
        cls,
        refinement_prompt: str,
        previous_code: str,
        history: list[Any] | None = None,
    ) -> list[dict[str, str]]:
        """Builds prompt messages to refine or modify an existing Three.js WebGL scene."""
        formatted_history = cls._format_history(history)
        messages = [{"role": "system", "content": THREEJS_SCENE_SYSTEM_PROMPT}]
        messages.extend(formatted_history)
        messages.append({
            "role": "user",
            "content": (
                f"Existing Three.js WebGL Scene Code:\n```javascript\n{previous_code.strip()}\n```\n\n"
                f"User Modification Request:\n{refinement_prompt.strip()}\n\n"
                "Please update the Three.js scene script according to the user's instructions. "
                "Return the complete updated executable `function buildScene(tools)` enclosed within ```javascript ... ```."
            ),
        })
        return messages

    @classmethod
    def build_refinement_messages(
        cls,
        refinement_prompt: str,
        previous_code: str,
        previous_parameters: dict[str, Any] | None = None,
        is_cad_task: bool | None = None,
        history: list[Any] | None = None,
    ) -> list[dict[str, str]]:
        if is_cad_task is None:
            is_cad_task = cls.is_cad_intent(refinement_prompt)

        formatted_history = cls._format_history(history)

        # For normal conversational follow-ups: lightweight system prompt without regenerating code
        if not is_cad_task:
            is_doc = cls.is_document_intent(refinement_prompt)
            sys_prompt = CONVERSATIONAL_WITH_DOCS_SYSTEM_PROMPT if is_doc else CONVERSATIONAL_SYSTEM_PROMPT
            messages = [{"role": "system", "content": sys_prompt}]
            messages.extend(formatted_history)

            if is_doc:
                instruction_block = (
                    "Instructions:\n"
                    "- The user is requesting documentation, specifications, report, presentation, spreadsheet, or export for the existing 3D CAD model above.\n"
                    "- Invoke the appropriate specialized tool block ```tool:<tool_name>\n{...}\n``` populated with rich engineering data (parameters, BOM, tolerances, materials) derived from the model and user prompt.\n"
                    "- DO NOT output or regenerate any Replicad code blocks or 3D geometry scripts."
                )
            else:
                instruction_block = (
                    "Instructions:\n"
                    "- Answer the user's question, explanation, comment, or greeting concisely and helpfully in Markdown.\n"
                    "- DO NOT output or regenerate any Replicad code blocks or 3D geometry scripts, and NEVER invoke or output any document tool blocks or artifacts."
                )

            messages.append({
                "role": "user",
                "content": (
                    f"The user has an existing Replicad 3D CAD model open in the viewer:\n\n"
                    f"```typescript\n{previous_code.strip()}\n```\n\n"
                    f"User Prompt:\n{refinement_prompt.strip()}\n\n"
                    f"{instruction_block}"
                ),
            })
            return messages

        # For CAD refinement/modification requests: use full Replicad system prompt
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(formatted_history)

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
            "provide the complete updated Replicad TypeScript code enclosed within ```typescript ... ``` incorporating the requested changes. Also generate the updated engineering document artifact using ```tool:<tool_name>\\n{...}\\n```.\n"
            "- If the user's requested change is unclear, ambiguous, contradictory, or missing necessary dimensions: "
            "politely ask the user clarifying questions, outline the specific parameters needed, and provide 2-3 practical recommended options. DO NOT regenerate a broken code block until clarified.\n"
            "- If the user is asking for a document, documentation, specifications, report, BOM, or presentation for this model: "
            "provide the document artifact using the matching specialized tool block ```tool:<tool_name>\\n{...}\\n``` populated with the model's actual parameters, dimensions, and materials.\n"
            "- If the user is asking a general question, asking for explanations about the model, or having a conversation (and NOT asking to modify the 3D model geometry): "
            "answer directly and concisely in Markdown. DO NOT regenerate or output the Replicad code block, keeping responses fast and relevant."
        )

        messages.append({"role": "user", "content": context})
        return messages
