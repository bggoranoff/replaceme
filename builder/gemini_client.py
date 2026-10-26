import os
from typing import Optional, Dict, Any, Tuple

# Provider -> (API key env vars, default model). LLM_PROVIDER picks one; otherwise the first with a key wins.
PROVIDERS: Dict[str, Tuple[Tuple[str, ...], str]] = {
    "google": (("GEMINI_API_KEY", "GOOGLE_API_KEY"), "gemini-3.8-flash"),
    "anthropic": (("ANTHROPIC_API_KEY",), "claude-opus-5-5"),
    "openai": (("OPENAI_API_KEY",), "gpt-6-luna"),
    "bedrock": (("AWS_BEARER_TOKEN_BEDROCK",), "openai.gpt-6-luna"),
}


def detect_provider() -> str:
    chosen = os.getenv("LLM_PROVIDER", "").strip().lower()
    if chosen:
        if chosen not in PROVIDERS:
            raise ValueError(f"LLM_PROVIDER must be one of {', '.join(PROVIDERS)}, got {chosen!r}")
        return chosen
    for name, (keys, _) in PROVIDERS.items():
        if any((os.getenv(k) or "").strip() for k in keys):
            return name
    return "google"


class GeminiClient:
    """
    Model client for Google Gemini, Anthropic, OpenAI or OpenAI models on AWS Bedrock (bedrock-mantle).
    Set LLM_PROVIDER (google | anthropic | openai | bedrock) and LLM_MODEL, or just one provider's key.
    """

    DEFAULT_MODEL = PROVIDERS["google"][1]

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None, provider: Optional[str] = None):
        self.provider = provider or detect_provider()
        keys, default_model = PROVIDERS[self.provider]
        self.api_key = api_key or next((os.getenv(k) for k in keys if os.getenv(k)), None)
        legacy_model = os.getenv("GEMINI_MODEL") if self.provider == "google" else None
        self.model = model or os.getenv("LLM_MODEL") or legacy_model or default_model
        # Created lazily so callers can check is_configured() and fall back offline without a key
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self.is_configured():
                raise ValueError(
                    f"No API key for provider {self.provider!r}. Set {' or '.join(PROVIDERS[self.provider][0])} in your environment or .env file."
                )
            if self.provider == "google":
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            elif self.provider == "anthropic":
                import anthropic
                self._client = anthropic.Anthropic(api_key=self.api_key)
            else:
                from openai import OpenAI
                base_url = None
                if self.provider == "bedrock":
                    region = os.getenv("AWS_REGION", "us-east-1")
                    base_url = os.getenv("BEDROCK_BASE_URL", f"https://bedrock-mantle.{region}.api.aws/openai/v1")
                self._client = OpenAI(api_key=self.api_key, base_url=base_url)
        return self._client

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: float = 0.3) -> str:
        """
        Backward compatible raw text generation.
        """
        if self.provider == "anthropic":
            message = self.client.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system_instruction or "",
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(b.text for b in message.content if b.type == "text")
        if self.provider in ("openai", "bedrock"):
            return self.client.responses.create(model=self.model, instructions=system_instruction, input=prompt).output_text
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
        if self.provider == "anthropic":
            message = self.client.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=system_instruction or "",
                messages=[{"role": "user", "content": prompt}],
                output_format=schema,
            )
            if message.parsed_output is None:
                raise ValueError(f"Claude returned no structured output (stop_reason={message.stop_reason})")
            return message.parsed_output.model_dump_json()
        if self.provider in ("openai", "bedrock"):
            response = self.client.responses.parse(model=self.model, instructions=system_instruction, input=prompt, text_format=schema)
            if response.output_parsed is None:
                raise ValueError("The model returned no structured output")
            return response.output_parsed.model_dump_json()
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
