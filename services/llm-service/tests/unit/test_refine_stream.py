from unittest.mock import MagicMock, patch
from src.api.schemas import RefineCadRequest
from src.domain.services import CadGenerationService


def _collect_async_gen(agen):
    """Drives an async generator whose inner awaits do not suspend on OS I/O."""
    items = []
    while True:
        coro = agen.__anext__()
        try:
            coro.send(None)
        except StopIteration as stop:
            items.append(stop.value)
        except StopAsyncIteration:
            break
    return items


def test_refine_cad_stream_replicad_path():
    """Verify refine_cad_stream executes the Replicad CAD refinement branch cleanly."""
    mock_provider = MagicMock()

    async def fake_stream(**kwargs):
        yield {"type": "token", "content": "Updated box width.\n"}
        yield {
            "type": "final_payload",
            "raw_response": (
                "Updated box width.\n"
                "```typescript\n"
                'import { makeBox } from "replicad";\n'
                "export const defaultParams = { width: 20 };\n"
                "export default function main(p = defaultParams) { return makeBox(p.width, 10, 10); }\n"
                "```"
            ),
            "raw_thoughts": "",
            "model": "gemini-2.5-flash",
            "token_usage": 50,
            "latency_ms": 12.0,
        }

    mock_provider.generate_stream = fake_stream

    with patch("src.domain.services.get_llm_provider", return_value=mock_provider):
        svc = CadGenerationService(cache=MagicMock(), event_publisher=MagicMock())
        req = RefineCadRequest(
            prompt="Make width 20mm",
            previous_code="export default function main() { return makeBox(10, 10, 10); }",
            provider="gemini",
        )
        events = _collect_async_gen(svc.refine_cad_stream(req))

    assert len(events) == 2
    assert events[-1]["type"] == "done"
    assert "makeBox" in events[-1]["metadata"]["replicad_code"]
    assert events[-1]["metadata"]["parameters"] == {"width": 20}
    assert events[-1]["metadata"]["model"] == "gemini-2.5-flash"
