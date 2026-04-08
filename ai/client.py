import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from config import GEMINI_MODEL

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

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

    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=full_system,
    )

    raw_prompt = (
        "Respond only in raw JSON with no markdown formatting or code fences.\n\n"
        + user_prompt
    )

    try:
        response = model.generate_content(raw_prompt)
        text = response.text.strip()

        # Strip accidental code fences if the model ignored instructions
        if text.startswith("```"):
            lines = text.split("\n")
            # drop first line (```json or ```) and last line (```)
            text = "\n".join(lines[1:-1]).strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned non-JSON response: {e}\nRaw: {text!r}")
    except Exception as e:
        raise RuntimeError(f"Gemini API call failed: {e}")
