"""Unit tests for ContextBuilder and prompts."""

from src.prompts.context_builder import ContextBuilder
from src.prompts.system_prompt import SYSTEM_PROMPT


def test_build_generation_messages():
    prompt = "Create a cylinder with a glass lens on top"
    constraints = {
        "max_dimensions": "50x50x80",
        "materials": "aluminum, glass",
        "glass": "high transparency",
    }
    messages = ContextBuilder.build_generation_messages(
        user_prompt=prompt,
        constraints=constraints,
        include_examples=True,
    )

    assert len(messages) >= 3
    assert messages[0]["role"] == "system"
    assert "Replicad" in messages[0]["content"]
    assert "glass" in messages[0]["content"].lower()

    last_msg = messages[-1]
    assert last_msg["role"] == "user"
    assert "Max Dimensions (mm): 50x50x80" in last_msg["content"]
    assert "Requested Materials: aluminum, glass" in last_msg["content"]


def test_build_refinement_messages():
    refine_prompt = "Increase the glass lid thickness by 2mm"
    previous_code = "export default function main() { return []; }"
    previous_params = {"glassThickness": 3.0}

    messages = ContextBuilder.build_refinement_messages(
        refinement_prompt=refine_prompt,
        previous_code=previous_code,
        previous_parameters=previous_params,
    )

    assert messages[0]["role"] == "system"
    user_msg = messages[-1]["content"]
    assert "Increase the glass lid thickness by 2mm" in user_msg
    assert "export default function main" in user_msg
    assert "'glassThickness': 3.0" in user_msg


def test_is_cad_intent():
    # Greetings and short tokens should not trigger CAD generation
    assert ContextBuilder.is_cad_intent("hi") is False
    assert ContextBuilder.is_cad_intent("hello") is False
    assert ContextBuilder.is_cad_intent("yo") is False
    assert ContextBuilder.is_cad_intent("hi there") is False
    assert ContextBuilder.is_cad_intent("hey there") is False
    assert ContextBuilder.is_cad_intent("what's up") is False
    assert ContextBuilder.is_cad_intent("how are you?") is False

    # Documentation and specification requests should not trigger CAD generation
    assert ContextBuilder.is_cad_intent("write documentation for this design") is False
    assert ContextBuilder.is_cad_intent("provide a spec sheet overview") is False
    assert ContextBuilder.is_cad_intent("what are the materials used in 3D printing?") is False
    assert ContextBuilder.is_cad_intent("tell me about replicad") is False

    # Explicit 3D CAD modeling requests should trigger CAD generation
    assert ContextBuilder.is_cad_intent("create an enclosure box with lid") is True
    assert ContextBuilder.is_cad_intent("make a cylinder with radius 20mm") is True
    assert ContextBuilder.is_cad_intent("design a mounting bracket") is True
