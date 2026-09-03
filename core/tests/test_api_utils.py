"""Unit tests for the shared API layer (all Anthropic calls mocked)."""

from types import SimpleNamespace

import anthropic
import pytest

import api_utils


class FakeConnectionError(anthropic.APIConnectionError):
    """Retryable error we can raise without building httpx objects."""

    def __init__(self) -> None:  # noqa: D401 — bypass parent ctor on purpose
        Exception.__init__(self, "simulated connection error")


def _tool_response(tool_input: dict) -> SimpleNamespace:
    block = SimpleNamespace(type="tool_use", input=tool_input)
    return SimpleNamespace(content=[block], stop_reason="tool_use")


def _text_response() -> SimpleNamespace:
    block = SimpleNamespace(type="text", text="hello", input=None)
    return SimpleNamespace(content=[block], stop_reason="end_turn")


class FakeClient:
    """Stands in for anthropic.Anthropic(); returns queued results in order."""

    def __init__(self, results: list) -> None:
        self._results = list(results)
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        result = self._results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(api_utils.time, "sleep", lambda _s: None)


def _patch_client(monkeypatch, client: FakeClient) -> None:
    monkeypatch.setattr(api_utils.anthropic, "Anthropic", lambda: client)


@pytest.mark.unit
def test_call_api_returns_tool_input(monkeypatch):
    client = FakeClient([_tool_response({"answer": 42})])
    _patch_client(monkeypatch, client)

    result = api_utils.call_api("prompt ", "input", {"type": "object"}, "my_tool")

    assert result == {"answer": 42}
    call = client.calls[0]
    assert call["tool_choice"] == {"type": "tool", "name": "my_tool"}
    assert call["messages"][0]["content"] == "prompt input"


@pytest.mark.unit
def test_call_api_retries_transient_errors_then_succeeds(monkeypatch):
    client = FakeClient([
        FakeConnectionError(),
        FakeConnectionError(),
        _tool_response({"ok": True}),
    ])
    _patch_client(monkeypatch, client)

    result = api_utils.call_api("p", "i", {}, "t")

    assert result == {"ok": True}
    assert len(client.calls) == 3


@pytest.mark.unit
def test_call_api_gives_up_after_max_retries(monkeypatch):
    client = FakeClient([FakeConnectionError()] * api_utils.MAX_RETRIES)
    _patch_client(monkeypatch, client)

    with pytest.raises(RuntimeError, match="重试"):
        api_utils.call_api("p", "i", {}, "t")
    assert len(client.calls) == api_utils.MAX_RETRIES


@pytest.mark.unit
def test_call_api_raises_when_no_tool_use(monkeypatch):
    client = FakeClient([_text_response()])
    _patch_client(monkeypatch, client)

    with pytest.raises(RuntimeError, match="tool_use"):
        api_utils.call_api("p", "i", {}, "t")


@pytest.mark.unit
def test_call_chat_returns_text(monkeypatch):
    client = FakeClient([SimpleNamespace(content=[SimpleNamespace(text="回答")])])
    _patch_client(monkeypatch, client)

    reply = api_utils.call_chat("system", [{"role": "user", "content": "hi"}])

    assert reply == "回答"
    assert client.calls[0]["system"] == "system"
