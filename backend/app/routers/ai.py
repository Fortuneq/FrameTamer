"""
AI features router (Claude integration).

POST /api/projects/{id}/ai/filler-words  – detect filler words
POST /api/projects/{id}/ai/chapters      – generate chapters
POST /api/projects/{id}/ai/smart-edit    – smart editing by instruction
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.transcript import Chapter, EditRange
from app.services import project as project_svc
from app.services.ai_service import (
    detect_filler_words,
    generate_chapters,
    smart_edit,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["ai"])


# ---------------------------------------------------------------------------
# Filler word detection
# ---------------------------------------------------------------------------

class FillerWordsResponse(BaseModel):
    filler_indices: list[int]
    count: int


@router.post("/{project_id}/ai/filler-words", response_model=FillerWordsResponse)
async def detect_fillers(project_id: str) -> FillerWordsResponse:
    """
    Analyse the transcript with Claude and identify filler words.
    Returns flat word indices that should be marked as fillers.
    """
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="Transcript not available")

    # Build flat word list with global indices
    all_words = project.transcript.get_all_words()
    words_for_claude = [
        {"index": i, "word": w.word} for i, w in enumerate(all_words)
    ]
    transcript_text = project.transcript.get_full_text()

    indices = await detect_filler_words(transcript_text, words_for_claude)

    # Persist filler flags on the words
    index_set = set(indices)
    flat_i = 0
    for seg in project.transcript.segments:
        for word in seg.words:
            if flat_i in index_set:
                word.filler = True
            flat_i += 1

    await project_svc.save_project(project)

    return FillerWordsResponse(filler_indices=indices, count=len(indices))


# ---------------------------------------------------------------------------
# Chapter generation
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ai/chapters", response_model=list[Chapter])
async def get_chapters(project_id: str) -> list[Chapter]:
    """Generate chapter markers from the transcript using Claude."""
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="Transcript not available")

    transcript_text = project.transcript.get_full_text()
    if not transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")

    chapters = await generate_chapters(transcript_text)
    if not chapters:
        raise HTTPException(
            status_code=422,
            detail="Could not generate chapters. Check ANTHROPIC_API_KEY and try again.",
        )

    return chapters


# ---------------------------------------------------------------------------
# Smart edit
# ---------------------------------------------------------------------------

class SmartEditRequest(BaseModel):
    instruction: str


@router.post("/{project_id}/ai/smart-edit", response_model=list[EditRange])
async def ai_smart_edit(project_id: str, payload: SmartEditRequest) -> list[EditRange]:
    """
    Apply a natural-language instruction to the transcript.
    Returns edit ranges that the frontend should highlight/apply.
    """
    if not payload.instruction.strip():
        raise HTTPException(status_code=400, detail="Instruction cannot be empty")

    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="Transcript not available")

    transcript_text = project.transcript.get_full_text()
    ranges = await smart_edit(transcript_text, payload.instruction)

    if not ranges:
        raise HTTPException(
            status_code=422,
            detail="No edit suggestions returned. Try a more specific instruction.",
        )

    # Optionally auto-apply delete ranges to the transcript
    all_words = project.transcript.get_all_words()
    for edit_range in ranges:
        if edit_range.action == "delete":
            for idx in range(
                edit_range.start_word_index,
                min(edit_range.end_word_index + 1, len(all_words)),
            ):
                all_words[idx].deleted = True

    # Persist changes
    flat_i = 0
    for seg in project.transcript.segments:
        for word in seg.words:
            word.deleted = all_words[flat_i].deleted
            flat_i += 1

    await project_svc.save_project(project)

    return ranges
