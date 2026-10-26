"""
Model calls used by the researcher (Gemini Interactions API, or Claude / OpenAI web search).

- grounded(): web search grounding + thought summaries. Returns the report
  text with [n] citation markers, the cited sources, the search queries and the
  model's thinking summaries (the raw material for reasoning traces).
- structured(): JSON output validated against a Pydantic model (no tools; the
  API does not return citations together with a JSON schema).
"""

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Type, TypeVar
from urllib.parse import urlparse

from pydantic import BaseModel

from builder.gemini_client import GeminiClient

T = TypeVar("T", bound=BaseModel)
REDIRECT_HOST = "vertexaisearch.cloud.google.com"


@dataclass
class Thought:
    text: str
    queries: List[str] = field(default_factory=list)


@dataclass
class GroundedResult:
    text: str
    sources: List[Dict[str, str]]
    queries: List[str]
    thoughts: List[Thought]

    def numbered_sources(self) -> str:
        return "\n".join(f"[{i}] {s['title']} - {s['url']}" for i, s in enumerate(self.sources, 1))


def _retry(fn, attempts: int = 2, wait_s: float = 3.0):
    for attempt in range(attempts):
        try:
            return fn()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(wait_s)


def grounded(client: GeminiClient, prompt: str, system_instruction: str, thinking_level: str = "medium") -> GroundedResult:
    """One web-search-grounded call. Citation markers [n] index into result.sources."""
    if client.provider == "anthropic":
        return _retry(lambda: _grounded_anthropic(client, prompt, system_instruction, thinking_level))
    if client.provider in ("openai", "bedrock"):
        return _retry(lambda: _grounded_openai(client, prompt, system_instruction, thinking_level))
    interaction = _retry(lambda: client.client.interactions.create(
        model=client.model,
        input=prompt,
        system_instruction=system_instruction,
        tools=[{"type": "google_search"}],
        generation_config={"thinking_level": thinking_level, "thinking_summaries": "auto"},
    ))
    thoughts: List[Thought] = []
    queries: List[str] = []
    text = ""
    annotations: List[Any] = []
    for step in interaction.steps or []:
        kind = getattr(step, "type", "")
        if kind == "thought":
            summary = " ".join(getattr(part, "text", "") or "" for part in (step.summary or [])).strip()
            if summary:
                thoughts.append(Thought(summary))
        elif kind == "google_search_call":
            step_queries = list(getattr(step.arguments, "queries", None) or [])
            queries.extend(step_queries)
            if thoughts:
                thoughts[-1].queries.extend(step_queries)
        elif kind == "model_output":
            for content in step.content or []:
                if getattr(content, "type", "") == "text":
                    offset = len(text)
                    text += content.text
                    for ann in getattr(content, "annotations", None) or []:
                        if getattr(ann, "type", "") == "url_citation" and getattr(ann, "url", None):
                            annotations.append((offset + (ann.end_index or 0), ann.title or "", ann.url))
    return _cited(text, annotations, queries, thoughts)


def _grounded_openai(client: GeminiClient, prompt: str, system_instruction: str, thinking_level: str) -> GroundedResult:
    response = client.client.responses.create(
        model=client.model,
        instructions=system_instruction,
        input=prompt,
        tools=[{"type": "web_search"}],
        reasoning={"effort": thinking_level, "summary": "auto"},
    )
    thoughts: List[Thought] = []
    queries: List[str] = []
    text = ""
    annotations: List[Any] = []
    for item in response.output or []:
        kind = getattr(item, "type", "")
        if kind == "reasoning":
            summary = " ".join(getattr(part, "text", "") or "" for part in (item.summary or [])).strip()
            if summary:
                thoughts.append(Thought(summary))
        elif kind == "web_search_call":
            query = getattr(getattr(item, "action", None), "query", None)
            if query:
                queries.append(query)
                if thoughts:
                    thoughts[-1].queries.append(query)
        elif kind == "message":
            for content in item.content or []:
                if getattr(content, "type", "") == "output_text":
                    offset = len(text)
                    text += content.text
                    for ann in getattr(content, "annotations", None) or []:
                        if getattr(ann, "type", "") == "url_citation" and getattr(ann, "url", None):
                            annotations.append((offset + (ann.end_index or 0), ann.title or "", ann.url))
    return _cited(text, annotations, queries, thoughts)


def _grounded_anthropic(client: GeminiClient, prompt: str, system_instruction: str, thinking_level: str) -> GroundedResult:
    messages: List[Dict[str, Any]] = [{"role": "user", "content": prompt}]
    content: List[Any] = []
    for _ in range(5):  # the server pauses long search turns; resend to let it continue
        with client.client.messages.stream(
            model=client.model,
            max_tokens=64000,
            system=system_instruction,
            messages=messages,
            tools=[{"type": "web_search_20260209", "name": "web_search"}],
            thinking={"type": "adaptive", "display": "summarized"},
            output_config={"effort": thinking_level},
        ) as stream:
            message = stream.get_final_message()
        content.extend(message.content)
        if message.stop_reason != "pause_turn":
            break
        messages = [messages[0], {"role": "assistant", "content": content}]
    if message.stop_reason == "refusal":
        raise RuntimeError("Claude declined the research request")
    thoughts: List[Thought] = []
    queries: List[str] = []
    text = ""
    annotations: List[Any] = []
    for block in content:
        if block.type == "thinking" and block.thinking.strip():
            thoughts.append(Thought(block.thinking.strip()))
        elif block.type == "server_tool_use" and block.name == "web_search":
            query = (block.input or {}).get("query")
            if query:
                queries.append(query)
                if thoughts:
                    thoughts[-1].queries.append(query)
        elif block.type == "text":
            text += block.text
            for cite in block.citations or []:
                url = getattr(cite, "url", None)
                if url:
                    annotations.append((len(text), getattr(cite, "title", "") or "", url))
    return _cited(text, annotations, queries, thoughts)


def _cited(text: str, annotations: List[Any], queries: List[str], thoughts: List[Thought]) -> GroundedResult:
    sources: List[Dict[str, str]] = []
    index_by_url: Dict[str, int] = {}
    markers: Dict[int, List[int]] = {}
    for end, title, url in annotations:
        if url not in index_by_url:
            sources.append({"title": title or urlparse(url).netloc, "url": url})
            index_by_url[url] = len(sources)
        bucket = markers.setdefault(min(end, len(text)), [])
        if index_by_url[url] not in bucket:
            bucket.append(index_by_url[url])
    for pos in sorted(markers, reverse=True):
        text = text[:pos] + "".join(f"[{n}]" for n in markers[pos]) + text[pos:]
    _resolve_redirects(sources)
    return GroundedResult(text=text.strip(), sources=sources, queries=queries, thoughts=thoughts)


def structured(client: GeminiClient, prompt: str, schema: Type[T], system_instruction: str, thinking_level: str = "low") -> T:
    """JSON output parsed into `schema`."""
    if client.provider != "google":
        return _retry(lambda: schema.model_validate_json(client.generate_structured(prompt, schema, system_instruction)))

    def call() -> T:
        interaction = client.client.interactions.create(
            model=client.model,
            input=prompt,
            system_instruction=system_instruction,
            generation_config={"thinking_level": thinking_level},
            response_format={"type": "text", "mime_type": "application/json", "schema": schema.model_json_schema()},
        )
        return schema.model_validate(json.loads(interaction.output_text))
    return _retry(call)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _resolve_one(url: str) -> str:
    if urlparse(url).netloc != REDIRECT_HOST:
        return url
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        opener.open(urllib.request.Request(url, method="HEAD"), timeout=float(os.getenv("RESEARCH_RESOLVE_TIMEOUT", "5")))
    except urllib.error.HTTPError as err:
        location = err.headers.get("Location")
        if location and err.code in (301, 302, 303, 307, 308):
            return location
    except Exception:
        pass
    return url


def _resolve_redirects(sources: List[Dict[str, str]]) -> None:
    """Grounding cites short-lived redirect links; replace them with the real page URLs where possible."""
    if not sources:
        return
    with ThreadPoolExecutor(max_workers=min(16, len(sources))) as pool:
        for source, resolved in zip(sources, pool.map(_resolve_one, [s["url"] for s in sources])):
            source["url"] = resolved
