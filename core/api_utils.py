"""Shared Anthropic API helpers for core/ and scripts/.

统一封装两类调用：
- call_api: tool_choice 强制结构化输出，返回 tool input dict
- call_chat: 普通对话，返回 assistant 文本

所有调用带指数退避重试（连接错误 / 限流 / 5xx）。
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

import anthropic

# 模型名统一在此管理，可用环境变量覆盖
MODEL_SONNET = os.getenv("NOUS_MODEL", "claude-sonnet-4-5-20250929")
MODEL_HAIKU = os.getenv("NOUS_MODEL_HAIKU", "claude-haiku-4-5-20251001")
DEFAULT_MODEL = MODEL_SONNET

MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0  # 秒，每次重试翻倍

_RETRYABLE_ERRORS = (
    anthropic.APIConnectionError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)


def _create_with_retry(client: anthropic.Anthropic, **kwargs: Any) -> anthropic.types.Message:
    """messages.create with exponential backoff on transient errors."""
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return client.messages.create(**kwargs)
        except _RETRYABLE_ERRORS as e:
            last_err = e
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            print(
                f"  [API {e.__class__.__name__}，{delay:.0f}s 后重试 "
                f"({attempt + 1}/{MAX_RETRIES})]",
                file=sys.stderr,
            )
            time.sleep(delay)
    raise RuntimeError(f"API 调用失败（重试 {MAX_RETRIES} 次后放弃）: {last_err}") from last_err


def call_api(
    prompt: str,
    input_text: str,
    schema: dict,
    tool_name: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 16384,
) -> dict:
    """Structured-output call via forced tool_choice. Returns the tool input dict."""
    client = anthropic.Anthropic()
    response = _create_with_retry(
        client,
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt + input_text}],
        tools=[{
            "name": tool_name,
            "description": f"Report {tool_name} results.",
            "input_schema": schema,
        }],
        tool_choice={"type": "tool", "name": tool_name},
    )
    for block in response.content:
        if block.type == "tool_use":
            return block.input
    raise RuntimeError(
        f"API 未返回 tool_use 结果（tool={tool_name}, stop_reason={response.stop_reason}）"
    )


def call_chat(
    system: str,
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
) -> str:
    """Plain chat call. Returns the assistant's text."""
    client = anthropic.Anthropic()
    response = _create_with_retry(
        client,
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    return response.content[0].text
