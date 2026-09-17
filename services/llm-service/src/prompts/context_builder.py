"""Context builder for assembling LLM prompts and message sequences."""

from typing import Any, Dict, List, Optional
from src.prompts.system_prompt import SYSTEM_PROMPT


class ContextBuilder:
    """Builds prompt messages for chat completion models (OpenAI, Anthropic, Ollama)."""

    @classmethod
    def build_generation_messages(
        cls,
        user_prompt: str,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

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
            "\n\nRemember: Generate valid, watertight Replicad TypeScript code with exported "
            "`defaultParams` and a `main` function returning multi-part assemblies with colors, "
            "materials ('metal', 'plastic', 'glass', etc.), and optical glass properties if applicable."
        )

        messages.append({"role": "user", "content": user_content})
        return messages

    @classmethod
    def build_refinement_messages(
        cls,
        refinement_prompt: str,
        previous_code: str,
        previous_parameters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        context = (
            f"Here is the existing Replicad TypeScript CAD model:\n\n"
            f"```typescript\n{previous_code.strip()}\n```\n\n"
        )
        if previous_parameters:
            context += f"Current parameter values:\n{previous_parameters}\n\n"

        context += (
            f"Requested Modification:\n{refinement_prompt.strip()}\n\n"
            "Please provide the updated Replicad TypeScript code incorporating this modification. "
            "Maintain all existing parts, colors, materials, and glass settings unless specifically requested to change them. "
            "Ensure the output remains valid, parametric, and watertight."
        )

        messages.append({"role": "user", "content": context})
        return messages
