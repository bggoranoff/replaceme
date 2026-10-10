"""
Gemini API Client for Agentic Calls in ReplaceMe.
Uses the standard Google Gemini REST API or SDK, requiring no complex external dependencies.
"""

import os
import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any


class GeminiClient:
    """
    Lightweight client for Google's Gemini models via official REST endpoint.
    Reads GOOGLE_API_KEY or GEMINI_API_KEY from environment.
    """

    DEFAULT_MODEL = "gemini-2.5-flash"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        self.model = model or os.getenv("GEMINI_MODEL", self.DEFAULT_MODEL)

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: float = 0.2) -> str:
        """
        Calls Gemini generateContent endpoint.
        """
        if not self.is_configured():
            raise ValueError(
                "Gemini API key not found. Please set GOOGLE_API_KEY or GEMINI_API_KEY in your environment or .env file."
            )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

        contents = [{"parts": [{"text": prompt}]}]
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "topP": 0.95,
            }
        }

        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                resp_json = json.loads(response.read().decode("utf-8"))
                candidates = resp_json.get("candidates", [])
                if not candidates:
                    raise RuntimeError(f"No candidates returned from Gemini API: {resp_json}")
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts]
                return "".join(text_parts)
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode("utf-8")
            raise RuntimeError(f"Gemini API HTTP Error {http_err.code}: {error_body}") from http_err
        except Exception as exc:
            raise RuntimeError(f"Gemini API request failed: {exc}") from exc
