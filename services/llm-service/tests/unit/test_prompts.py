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


def test_history_injection_in_context_builder():
    history = [
        {"role": "user", "content": "Can you generate a PDF report about Bitumen Roads?"},
        {
            "role": "assistant",
            "content": (
                "Yes, I can generate a PDF report about Bitumen Roads. "
                "Please specify what sections or information you would like to include."
            ),
        },
    ]

    messages = ContextBuilder.build_generation_messages(
        user_prompt="Include Introduction, Materials, and Cost Analysis.",
        history=history,
    )

    # Verify messages contains system prompt, previous user, previous assistant, and current user
    assert len(messages) == 4
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "Bitumen Roads" in messages[1]["content"]
    assert messages[2]["role"] == "assistant"
    assert "Please specify what sections" in messages[2]["content"]
    assert messages[3]["role"] == "user"
    assert "Cost Analysis" in messages[3]["content"]


def test_document_tool_prompt_schemas():
    from src.prompts.system_prompt import CONVERSATIONAL_WITH_DOCS_SYSTEM_PROMPT, SYSTEM_PROMPT

    # Verify both prompts contain all 5 specialized domain tools
    for prompt_text in (CONVERSATIONAL_WITH_DOCS_SYSTEM_PROMPT, SYSTEM_PROMPT):
        assert "generate_word_document" in prompt_text
        assert "generate_pdf_report" in prompt_text
        assert "generate_excel_sheet" in prompt_text
        assert "generate_presentation" in prompt_text
        assert "generate_csv_export" in prompt_text
        # Verify schema field examples are present
        assert "executive_summary" in prompt_text
        assert "sections" in prompt_text
        assert "sheets" in prompt_text
        assert "slides" in prompt_text


def test_conversational_prompt_excludes_tools_on_casual_chat():
    from src.prompts.system_prompt import CONVERSATIONAL_SYSTEM_PROMPT
    assert "```tool:" not in CONVERSATIONAL_SYSTEM_PROMPT
    assert "generate_word_document" not in CONVERSATIONAL_SYSTEM_PROMPT


def test_casual_thank_you_not_cad_or_doc_intent():
    assert ContextBuilder.is_cad_intent("Thank you so much") is False
    assert ContextBuilder.is_document_intent("Thank you so much") is False
    assert ContextBuilder.is_document_intent("thank you") is False
    assert ContextBuilder.is_document_intent("thanks for the doc") is False
    assert ContextBuilder.is_document_intent("thanks a lot!") is False

    # Generation messages for casual thank-you must use lightweight conversational prompt
    messages = ContextBuilder.build_generation_messages("Thank you so much")
    assert "```tool:" not in messages[0]["content"]

    # Refinement messages for casual thank-you must not instruct to output tools
    refine_messages = ContextBuilder.build_refinement_messages(
        refinement_prompt="Thank you so much",
        previous_code="export default function main() { return []; }",
    )
    assert "```tool:" not in refine_messages[0]["content"]
    assert "NEVER invoke or output any document tool" in refine_messages[-1]["content"]


def test_sanitize_tool_calls_suppresses_hallucination_on_casual_chat():
    from src.domain.services import CadGenerationService
    from src.api.schemas import ToolCallResult

    fake_tool = ToolCallResult(
        tool_name="generate_word_document",
        artifact_type="docx",
        filename="Astra.docx",
        title="ChatGPT Astra",
        data={},
    )
    fake_explanation = "You're welcome!\n```tool:generate_word_document\n{}\n```"

    cleaned_tools, cleaned_exp = CadGenerationService._sanitize_tool_calls_and_explanation(
        prompt="Thank you so much",
        is_cad_task=False,
        tool_calls=[fake_tool],
        explanation=fake_explanation,
    )
    assert len(cleaned_tools) == 0
    assert "```tool:" not in cleaned_exp
    assert "You're welcome!" in cleaned_exp

    # Pure CAD prompt without document request must suppress document tools
    cad_tools, cad_exp = CadGenerationService._sanitize_tool_calls_and_explanation(
        prompt="Generate 3D design for laptop . assume dimentions.",
        is_cad_task=True,
        tool_calls=[fake_tool],
        explanation="Laptop model:\n```tool:generate_word_document\n{}\n```",
    )
    assert len(cad_tools) == 0
    assert "```tool:" not in cad_exp

    # CAD prompt explicitly requesting documentation must retain document tools
    doc_tools, doc_exp = CadGenerationService._sanitize_tool_calls_and_explanation(
        prompt="Generate 3D design for laptop with Word document",
        is_cad_task=True,
        tool_calls=[fake_tool],
        explanation="Laptop model with specs:\n```tool:generate_word_document\n{}\n```",
    )
    assert len(doc_tools) == 1



def test_clarification_protocol_in_system_prompts():
    from src.prompts.system_prompt import CONVERSATIONAL_SYSTEM_PROMPT, SYSTEM_PROMPT

    for prompt_text in (CONVERSATIONAL_SYSTEM_PROMPT, SYSTEM_PROMPT):
        assert "CLARIFICATION" in prompt_text
        assert "missing information" in prompt_text.lower() or "missing details" in prompt_text.lower()


def test_is_threejs_scene_intent():
    # Organic nature and landscape prompts should trigger Three.js WebGL scenes
    assert ContextBuilder.is_threejs_scene_intent("Create a mountain valley with a winding river") is True
    assert ContextBuilder.is_threejs_scene_intent("Rolling hills with green meadow and trees") is True
    assert ContextBuilder.is_threejs_scene_intent("Photorealistic nature landscape with a lake") is True
    assert ContextBuilder.is_threejs_scene_intent("Generate a Three.js scene of a forest") is True
    assert ContextBuilder.is_threejs_scene_intent("Lush canyon terrain with waterfall") is True

    # Pure mechanical parts should NOT trigger Three.js scenes
    assert ContextBuilder.is_threejs_scene_intent("Create an M4 hex nut and bolt") is False
    assert ContextBuilder.is_threejs_scene_intent("Design a drone motor mount bracket") is False
    assert ContextBuilder.is_threejs_scene_intent("Parametric planetary gearbox") is False
    assert ContextBuilder.is_threejs_scene_intent("Electronics enclosure with snap fit lid") is False


def test_build_threejs_messages_and_extraction():
    from src.domain.services import CadGenerationService

    messages = ContextBuilder.build_threejs_messages("Photorealistic mountain valley with river")
    assert len(messages) >= 2
    assert messages[0]["role"] == "system"
    assert "buildScene(tools)" in messages[0]["content"]
    assert "noise2D" in messages[0]["content"]

    sample_llm_response = (
        "Here is the procedural Three.js WebGL scene for your mountain valley:\n\n"
        "```javascript\n"
        "function buildScene(tools) {\n"
        "  const { THREE, add, noise2D, createPBRMaterial } = tools;\n"
        "  const geo = new THREE.PlaneGeometry(300, 300, 100, 100);\n"
        "  add(new THREE.Mesh(geo, createPBRMaterial({ type: 'grass' })));\n"
        "}\n"
        "```\n\n"
        "The scene features multi-octave Perlin noise elevation."
    )

    code, exp = CadGenerationService._extract_threejs_scene_code(sample_llm_response)
    assert code is not None
    assert "function buildScene" in code
    assert "createPBRMaterial" in code
    assert "The scene features multi-octave" in exp




