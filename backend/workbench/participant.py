"""An isolated participant invocation with recording at the actual model boundary.

The boundary-recording pattern was informed by the preserved MindLab reference.
No participant is given a study object, scoring key, allocation label or other session's history.
"""

import asyncio
import json
from dataclasses import asdict

import httpx2
from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessagesTypeAdapter, ModelResponse, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits
from pydantic_core import to_jsonable_python

from .protocol import FIXTURE_VERSION, SYSTEM


class FixtureConnectionError(ConnectionError):
    pass


def fixture_model(profile, attempt_number, delay_ms):
    async def answer(messages, info):
        await asyncio.sleep(delay_ms / 1000)
        if profile == "stall":
            await asyncio.Event().wait()
        if profile == "flaky" and attempt_number == 1:
            raise FixtureConnectionError("Authored one-attempt transport failure.")
        prompts = [json.loads(p.content) for m in messages for p in m.parts if isinstance(p, UserPromptPart)]
        tokens = [o["token"] for o in prompts[0]["options"]]
        token = tokens[0]
        if len(prompts) > 1:
            if profile == "follow" and "peer_statements" in prompts[-1]:
                token = prompts[-1]["peer_statements"][0]["answer"]
            elif profile == "reconsider":
                token = tokens[1]
        if profile == "unknown":
            token = "NOT_AN_OPTION"
        arguments = '{"choice":' if profile == "malformed" else {"choice": token}
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, arguments)])

    return FunctionModel(answer, model_name=f"{FIXTURE_VERSION}:{profile}")


class CaptureModel(WrapperModel):
    def __init__(self, model, emit):
        super().__init__(model)
        self.emit = emit

    async def request(self, messages, model_settings, model_request_parameters):
        self.emit(
            "request",
            {
                "messages": ModelMessagesTypeAdapter.dump_python(messages, mode="json"),
                "settings": to_jsonable_python(model_settings),
                "parameters": to_jsonable_python(asdict(model_request_parameters)),
                "model": self.model_name,
            },
        )
        response = await self.wrapped.request(messages, model_settings, model_request_parameters)
        self.emit("response", ModelMessagesTypeAdapter.dump_python([response], mode="json")[0])
        return response


async def respond(
    *,
    prompt,
    history,
    output_type,
    settings,
    profile,
    attempt_number,
    emit,
    model_name=None,
    api_key=None,
    transport=None,
):
    client = None
    if settings.source == "openai":
        if not model_name or not api_key:
            raise ValueError("Remote model is not configured on the server.")

        async def capture_request(request):
            await request.aread()
            emit("wire_request", json.loads(request.content))

        async def capture_response(response):
            await response.aread()
            record = {"status": response.status_code}
            if response.is_success:
                record["body"] = response.json()
            # Error bodies and all HTTP headers are excluded: they may contain credentials.
            emit("wire_response", record)

        http = httpx2.AsyncClient(
            transport=transport,
            timeout=settings.timeout_seconds,
            event_hooks={"request": [capture_request], "response": [capture_response]},
        )
        client = AsyncOpenAI(api_key=api_key, max_retries=0, http_client=http)
        model = OpenAIChatModel(model_name, provider=OpenAIProvider(openai_client=client))
    else:
        model = fixture_model(profile, attempt_number, settings.fixture_delay_ms)
    model_settings = {"max_tokens": settings.max_tokens, "parallel_tool_calls": False}
    if settings.temperature is not None:
        model_settings["temperature"] = settings.temperature
    agent = Agent(
        CaptureModel(model, emit),
        output_type=output_type,
        system_prompt=SYSTEM,
        retries=0,
        model_settings=model_settings,
    )
    try:
        result = await agent.run(
            prompt,
            message_history=list(history),
            usage_limits=UsageLimits(request_limit=1, tool_calls_limit=0),
        )
        return result.output.choice, result.all_messages()
    finally:
        if client is not None:
            await client.close()
