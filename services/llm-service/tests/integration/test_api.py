"""Integration tests for LLM service API endpoints."""

from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    response = client.get("/api/v1/llm/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "provider" in data


def test_generate_cad_endpoint(client: TestClient):
    payload = {
        "prompt": "Create an electronics junction box with a clear glass inspection lid and stainless steel fasteners",
        "provider": "gemini",
        "user_id": "test-user-123",
    }
    response = client.post("/api/v1/llm/generate", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "prompt_id" in data
    assert "replicad_code" in data
    assert "defaultParams" in data["replicad_code"]
    assert "export default function main" in data["replicad_code"]

    # Parts and materials verification
    assert len(data["parts"]) >= 1
    assert data["has_glass"] is True
    assert "glass" in data["materials_used"]

    # Verify glass part properties
    glass_part = next(p for p in data["parts"] if p["material"] == "glass")
    assert glass_part["opacity"] < 1.0
    assert glass_part["transmission"] > 0.5
    assert glass_part["transparent"] is True

    # Verify parameters extraction
    assert len(data["parameter_definitions"]) > 0
    assert "length" in data["parameters"]


def test_validate_cad_endpoint(client: TestClient):
    sample_code = '''
export const defaultParams = {
  radius: 25,
  thickness: 2.0,
};
export default function main(params = defaultParams) {
  return [
    {
      name: "GlassLens",
      shape: null,
      color: "#93c5fd",
      material: "glass",
      opacity: 0.3,
      transmission: 0.95,
      ior: 1.52,
      transparent: true,
    }
  ];
}
'''
    response = client.post("/api/v1/llm/validate", json={"replicad_code": sample_code})
    assert response.status_code == 200
    data = response.json()
    assert data["parameters"]["radius"] == 25
    assert data["has_glass"] is True
    assert len(data["parts"]) == 1
    assert data["parts"][0]["material"] == "glass"


def test_refine_cad_endpoint(client: TestClient):
    payload = {
        "prompt": "Make the glass lid 5mm thicker",
        "previous_code": "export const defaultParams = { h: 10 }; export default function main() { return []; }",
        "previous_parameters": {"h": 10},
        "provider": "gemini",
    }
    response = client.post("/api/v1/llm/refine", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "replicad_code" in data
    assert "prompt_id" in data


def test_verify_key_unsupported_provider(client: TestClient):
    payload = {
        "provider": "nonexistent_provider",
    }
    response = client.post("/api/v1/llm/verify-key", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert "unsupported" in data["message"].lower()


def test_verify_key_missing_credentials(client: TestClient):
    payload = {
        "provider": "openai",
        "api_key": None,
    }
    response = client.post("/api/v1/llm/verify-key", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert "missing" in data["message"].lower()


def test_generate_with_header_credentials(client: TestClient):
    payload = {
        "prompt": "Create an electronics junction box with clear lid",
    }
    headers = {
        "X-Provider": "gemini",
        "X-API-Key": "test-key",
    }
    response = client.post("/api/v1/llm/generate", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "gemini"
    assert "replicad_code" in data


def test_generate_cad_stream_endpoint(client: TestClient):
    payload = {
        "prompt": "Create an aluminum bracket with 4 mounting holes",
        "provider": "gemini",
    }
    response = client.post("/api/v1/llm/generate/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    content = response.text
    assert "data: " in content
    assert '"type": "done"' in content


def test_generate_stream_normal_prompt_greeting(client: TestClient):
    payload = {
        "prompt": "hi",
        "provider": "gemini",
    }
    response = client.post("/api/v1/llm/generate/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    content = response.text
    assert "data: " in content
    assert '"type": "done"' in content

