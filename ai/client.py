import os
import json
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv
from config import GEMINI_MODEL

logger = logging.getLogger(__name__)

load_dotenv()

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

_BASE_SYSTEM = (
    "Always return raw JSON only — no markdown, no code fences, no preamble. "
    "Your entire response must be valid JSON that can be parsed by json.loads()."
)


def call_gemini(system_prompt: str, user_prompt: str) -> dict:
    """
    Send a prompt pair to Gemini and return the parsed JSON response.
    Raises ValueError if the response cannot be parsed as JSON.
    """
    full_system = _BASE_SYSTEM + "\n\n" + system_prompt

    raw_prompt = (
        "Respond only in raw JSON with no markdown formatting or code fences.\n\n"
        + user_prompt
    )

    text = ""
    try:
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=raw_prompt,
            config=types.GenerateContentConfig(
                system_instruction=full_system,
            ),
        )
        text = response.text.strip()
        logger.info(f"Gemini raw response (first 200 chars): {text[:200]}")

        # Strip accidental code fences if the model ignored instructions
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]).strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse failed: {e} | Raw: {text!r}")
        raise ValueError(f"Gemini returned non-JSON response: {e}\nRaw: {text!r}")
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        raise RuntimeError(f"Gemini API call failed: {e}")
