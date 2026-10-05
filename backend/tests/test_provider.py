import json

import httpx2
import pytest
from pydantic_ai import models
from pydantic_ai.exceptions import ModelHTTPError
from workbench.participant import respond
from workbench.protocol import EXAMPLE, Settings, initial, response_type


async def test_remote_adapter_uses_structured_schema_and_records_wire_without_headers(monkeypatch):
    monkeypatch.setattr(models, "ALLOW_MODEL_REQUESTS", True)
    received = []
    captured = {}

    def fake_provider(request):
        payload = json.loads(request.content)
        received.append(payload)
        assert request.headers["authorization"] == "Bearer mock-only-key"
        assert payload["model"] == "gpt-4.1-mini"
        assert payload["tools"][0]["function"]["parameters"]["properties"]["choice"]["enum"] == [
            "A",
            "B",
            "C",
        ]
        return httpx2.Response(
            200,
            json={
                "id": "mock_response_01",
                "object": "chat.completion",
                "created": 1,
                "model": payload["model"],
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "mock_call_01",
                                    "type": "function",
                                    "function": {
                                        "name": payload["tools"][0]["function"]["name"],
                                        "arguments": '{"choice":"B"}',
                                    },
                                }
                            ],
                        },
                    }
                ],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
            },
        )

    choice, history = await respond(
        prompt=initial(EXAMPLE),
        history=[],
        output_type=response_type(EXAMPLE),
        settings=Settings(source="openai"),
        profile=None,
        attempt_number=1,
        emit=lambda field, value: captured.update({field: value}),
        model_name="gpt-4.1-mini",
        api_key="mock-only-key",
        transport=httpx2.MockTransport(fake_provider),
    )
    assert choice == "B" and len(history) > 1
    assert len(received) == 1
    assert captured["wire_request"] == received[0]
    assert captured["wire_response"]["body"]["id"] == "mock_response_01"
    assert captured["response"]["parts"][0]["args"] == '{"choice":"B"}'
    assert "mock-only-key" not in json.dumps(captured)
    assert "authorization" not in json.dumps(captured).lower()


async def test_no_sdk_retry_or_secret_error_body(monkeypatch):
    monkeypatch.setattr(models, "ALLOW_MODEL_REQUESTS", True)
    calls, captured = [], {}

    def rejected(request):
        calls.append(request)
        return httpx2.Response(429, json={"error": {"message": "SECRET_ECHO", "type": "rate_limit"}})

    with pytest.raises(ModelHTTPError):
        await respond(
            prompt=initial(EXAMPLE),
            history=[],
            output_type=response_type(EXAMPLE),
            settings=Settings(source="openai"),
            profile=None,
            attempt_number=1,
            emit=lambda field, value: captured.update({field: value}),
            model_name="gpt-4.1-mini",
            api_key="mock-only-key",
            transport=httpx2.MockTransport(rejected),
        )
    assert len(calls) == 1
    assert captured["wire_response"] == {"status": 429}
    assert "SECRET_ECHO" not in json.dumps(captured)
