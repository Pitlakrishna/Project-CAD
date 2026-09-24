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

    # 3D Printing advice, slicer settings, troubleshooting, & questions (MUST NOT burn CAD tokens)
    assert ContextBuilder.is_cad_intent("how do I slice this model for 3d printing?") is False
    assert ContextBuilder.is_cad_intent("what infill should I use for 3d printing?") is False
    assert ContextBuilder.is_cad_intent("why is my 3d print warping?") is False
    assert ContextBuilder.is_cad_intent("can you explain how 3d printing works?") is False
    assert ContextBuilder.is_cad_intent("what temperature for PLA 3d printing?") is False
    assert ContextBuilder.is_cad_intent("how to calibrate 3d printer e-steps?") is False
    assert ContextBuilder.is_cad_intent("is 3d printing safe indoors?") is False
    assert ContextBuilder.is_cad_intent("when ever user ask then only genrate 3d printing because tocken will burn") is False

    # Explicit 3D CAD modeling and direct 3D printing requests should trigger CAD generation
    assert ContextBuilder.is_cad_intent("create an enclosure box with lid") is True
    assert ContextBuilder.is_cad_intent("make a cylinder with radius 20mm") is True
    assert ContextBuilder.is_cad_intent("design a mounting bracket") is True
    assert ContextBuilder.is_cad_intent("3d print me a phone stand") is True
    assert ContextBuilder.is_cad_intent("design a 3d gear with 20 teeth") is True
    assert ContextBuilder.is_cad_intent("build a staircase model") is True

    # Parametric modifications on existing CAD models should trigger CAD generation
    assert ContextBuilder.is_cad_intent("Increase the glass lid thickness by 2mm") is True
    assert ContextBuilder.is_cad_intent("modify height to 50mm") is True
    assert ContextBuilder.is_cad_intent("make it wider by 10mm") is True
    assert ContextBuilder.is_cad_intent("add 4 screw holes") is True
    assert ContextBuilder.is_cad_intent("fillet the top edges") is True
