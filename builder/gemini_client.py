import os
from typing import Optional, Dict, Any
from google import genai
from google.genai import types

class GeminiClient:
    """
    Lightweight client for Google's Gemini models via the official google-genai SDK.
    Reads GOOGLE_API_KEY or GEMINI_API_KEY from environment.
    """

    DEFAULT_MODEL = "gemini-3.8-flash"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model = model or os.getenv("GEMINI_MODEL", self.DEFAULT_MODEL)
        # Created lazily so callers can check is_configured() and fall back offline without a key
        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            if not self.is_configured():
                raise ValueError(
                    "Gemini API key not found. Please set GOOGLE_API_KEY or GEMINI_API_KEY in your environment or .env file."
                )
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: float = 0.3) -> str:
        """
        Backward compatible raw text generation.
        """
        interaction = self.client.interactions.create(
            model=self.model,
            input=prompt,
            system_instruction=system_instruction,
            generation_config={"temperature": temperature}
        )
        return interaction.output_text

    def generate_structured(self, prompt: str, schema: type, system_instruction: Optional[str] = None, temperature: float = 0.3) -> str:
        """
        New structured output generation for the Researcher.
        """
        interaction = self.client.interactions.create(
            model=self.model,
            input=prompt,
            system_instruction=system_instruction,
            generation_config={"temperature": temperature},
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": schema.model_json_schema()
            }
        )
        return interaction.output_text
