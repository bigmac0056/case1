import httpx
from src.core.config import settings


class LLMClient:
    def __init__(self):
        self.base_url = settings.ai_base_url.rstrip("/")
        self.model = settings.ai_default_model

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": self.model,
            "prompt": user_prompt,
            "system": system_prompt,
            "options": {
                "num_predict": 256,
                "num_ctx": 1024,
            }
        }

        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.base_url}/chat",
                json=payload,
            )
            response.raise_for_status()
            result = response.json()

            message = result.get("message") if isinstance(result, dict) else None
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    return content

            # fallback for /generate-like payloads
            content = result.get("response") if isinstance(result, dict) else None
            if isinstance(content, str):
                return content

            raise RuntimeError("AI backend returned unexpected response format")


llm_client = LLMClient()
