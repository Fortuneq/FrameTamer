"""
Claude AI integration service.

Provides higher-level NLP operations on top of the Anthropic API:
  - Filler word detection
  - Auto chapter generation
  - Smart edit by natural language instruction
"""
import json
import logging
import re
from typing import Any

from app.models.transcript import Chapter, EditRange

logger = logging.getLogger(__name__)

# Filler words that are common in Russian/English speech
_DEFAULT_FILLERS = {
    "ну", "вот", "это", "типа", "как бы", "короче", "значит", "собственно",
    "ладно", "так", "в общем", "ну вот", "ну так", "эм", "э", "ах", "ой",
    "um", "uh", "like", "you know", "kind of", "sort of", "basically",
    "actually", "literally", "right", "so", "well",
}


def _get_client():
    """Return a cached Anthropic client, initialised lazily."""
    import anthropic  # type: ignore

    from app.config import settings

    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file or environment variables."
        )
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _model() -> str:
    from app.config import settings
    return settings.anthropic_model


def _call_claude(system_prompt: str, user_message: str, max_tokens: int = 2048) -> str:
    """Synchronous Claude call (runs inside executor thread)."""
    client = _get_client()
    response = client.messages.create(
        model=_model(),
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ---------------------------------------------------------------------------
# Filler word detection
# ---------------------------------------------------------------------------

async def detect_filler_words(transcript_text: str, words: list[dict]) -> list[int]:
    """
    Identify filler word indices in a list of word dicts.

    First applies a fast local check; then asks Claude for additional
    context-based detection.

    Parameters
    ----------
    transcript_text:
        Full transcript string (for Claude context).
    words:
        List of dicts with at least {"word": str, "index": int}.

    Returns
    -------
    list[int]
        Indices (into *words*) that are filler words.
    """
    import asyncio

    # --- Fast local pass ---
    local_hits: set[int] = set()
    for w in words:
        clean = w["word"].lower().strip(".,!?;:")
        if clean in _DEFAULT_FILLERS:
            local_hits.add(w["index"])

    # --- Claude pass (context-aware) ---
    system_prompt = (
        "You are a transcript editor. Identify filler words and meaningless interjections "
        "in the transcript. Return ONLY a JSON array of word indices that are fillers. "
        "Example: [0, 5, 12]. Do not include any explanation."
    )

    # Limit input size to avoid huge prompts
    truncated = transcript_text[:8000]
    words_json = json.dumps(
        [{"i": w["index"], "w": w["word"]} for w in words[:500]], ensure_ascii=False
    )
    user_message = (
        f"Words (index, text):\n{words_json}\n\n"
        f"Transcript:\n{truncated}"
    )

    try:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, _call_claude, system_prompt, user_message, 512)
        # Extract JSON array from response
        match = re.search(r"\[[\d,\s]*\]", raw)
        if match:
            claude_hits: list[int] = json.loads(match.group())
            local_hits.update(claude_hits)
    except Exception as exc:
        logger.warning("Claude filler detection failed: %s", exc)

    return sorted(local_hits)


# ---------------------------------------------------------------------------
# Chapter generation
# ---------------------------------------------------------------------------

async def generate_chapters(transcript_text: str) -> list[Chapter]:
    """
    Ask Claude to split the transcript into logical chapters.

    Returns a list of Chapter objects with title, start, end timestamps.
    The timestamps are approximate because Claude works with text;
    the caller must map them back to word-level timestamps.
    """
    import asyncio

    system_prompt = (
        "You are a video editor assistant. Analyse the transcript and divide it into "
        "logical chapters/sections. Return a JSON array with objects: "
        '{"title": str, "start_word_index": int, "end_word_index": int, "summary": str}. '
        "Aim for 3–10 chapters depending on content length. "
        "Return ONLY the JSON array, no markdown fences."
    )

    truncated = transcript_text[:12000]
    try:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(
            None, _call_claude, system_prompt, truncated, 2048
        )
        # Strip potential markdown code fences
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        chapters_data: list[dict[str, Any]] = json.loads(raw)
        chapters: list[Chapter] = []
        for item in chapters_data:
            chapters.append(
                Chapter(
                    title=item.get("title", "Chapter"),
                    start=float(item.get("start", 0)),
                    end=float(item.get("end", 0)),
                    summary=item.get("summary", ""),
                )
            )
        return chapters
    except Exception as exc:
        logger.error("Chapter generation failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Smart edit
# ---------------------------------------------------------------------------

async def smart_edit(transcript_text: str, instruction: str) -> list[EditRange]:
    """
    Given a natural-language instruction, ask Claude to return ranges
    of words to delete or keep.

    Example instructions:
        "Remove all off-topic digressions"
        "Cut everything except the product demo part"
        "Delete all questions from the interviewer"

    Returns list of EditRange(start_word_index, end_word_index, action, reason).
    """
    import asyncio

    system_prompt = (
        "You are a professional video editor. Given a transcript and an instruction, "
        "identify word ranges to delete or keep. Return a JSON array of objects: "
        '{"start_word_index": int, "end_word_index": int, "action": "delete"|"keep", "reason": str}. '
        "Word indices are 0-based over the entire flat list of words. "
        "Return ONLY the JSON array."
    )

    truncated = transcript_text[:12000]
    user_message = f"Instruction: {instruction}\n\nTranscript:\n{truncated}"

    try:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(
            None, _call_claude, system_prompt, user_message, 2048
        )
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        ranges_data: list[dict[str, Any]] = json.loads(raw)
        edit_ranges: list[EditRange] = []
        for item in ranges_data:
            edit_ranges.append(
                EditRange(
                    start_word_index=int(item.get("start_word_index", 0)),
                    end_word_index=int(item.get("end_word_index", 0)),
                    action=item.get("action", "delete"),
                    reason=item.get("reason", ""),
                )
            )
        return edit_ranges
    except Exception as exc:
        logger.error("Smart edit failed: %s", exc)
        return []
