import os
from typing import Any, Callable

from langchain_groq import ChatGroq

DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL_NAME", "llama-3.3-70b-versatile")
FALLBACK_GROQ_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")


def get_llm(model_name: str | None = None):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable not set")
    return ChatGroq(
        temperature=0.7,
        model_name=model_name or DEFAULT_GROQ_MODEL,
        groq_api_key=api_key,
    )


def get_fallback_model_name():
    fallback = FALLBACK_GROQ_MODEL.strip()
    if fallback and fallback != DEFAULT_GROQ_MODEL:
        return fallback
    return None


def is_rate_limit_error(error: Exception) -> bool:
    detail = str(error).lower()
    return "rate limit" in detail or "rate_limit_exceeded" in detail or "tokens per day" in detail


def invoke_with_fallback(chain_builder: Callable[[ChatGroq], Any], payload: dict):
    fallback_model = get_fallback_model_name()
    model_sequence = [None]
    if fallback_model:
        model_sequence.append(fallback_model)

    last_error = None
    for model_name in model_sequence:
        try:
            llm = get_llm(model_name=model_name)
            chain = chain_builder(llm)
            return chain.invoke(payload)
        except Exception as error:
            last_error = error
            if model_name is None and fallback_model and is_rate_limit_error(error):
                print(f"Primary Groq model rate-limited. Retrying with fallback model {fallback_model}.")
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("No LLM models were available.")
