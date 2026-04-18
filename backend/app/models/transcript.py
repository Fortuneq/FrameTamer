from pydantic import BaseModel, Field


class Word(BaseModel):
    word: str
    start: float  # seconds
    end: float
    confidence: float = 1.0
    deleted: bool = False
    filler: bool = False
    speaker: str | None = None

    model_config = {"json_schema_extra": {"example": {"word": "привет", "start": 0.5, "end": 0.9, "confidence": 0.98}}}


class TranscriptSegment(BaseModel):
    id: str = Field(default="")
    speaker: str | None = None
    start: float
    end: float
    words: list[Word] = Field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.word for w in self.words if not w.deleted)

    @property
    def full_text(self) -> str:
        """Full text including deleted words (for display in editor)."""
        return " ".join(w.word for w in self.words)


class Transcript(BaseModel):
    segments: list[TranscriptSegment] = Field(default_factory=list)
    language: str = "ru"
    duration: float = 0.0

    def get_all_words(self) -> list[Word]:
        """Flatten all words from all segments."""
        words: list[Word] = []
        for seg in self.segments:
            words.extend(seg.words)
        return words

    def get_active_words(self) -> list[Word]:
        """Words that are not deleted."""
        return [w for w in self.get_all_words() if not w.deleted]

    def get_full_text(self) -> str:
        """Full transcript text (active words only)."""
        return " ".join(w.word for w in self.get_active_words())

    def get_kept_time_ranges(self) -> list[tuple[float, float]]:
        """
        Returns list of (start, end) time ranges that remain after deletions.
        Merges adjacent words into continuous segments.
        """
        active = self.get_active_words()
        if not active:
            return []

        ranges: list[tuple[float, float]] = []
        seg_start = active[0].start
        seg_end = active[0].end

        for word in active[1:]:
            # Allow small gaps (< 0.05s) to merge into one segment
            if word.start - seg_end < 0.05:
                seg_end = word.end
            else:
                ranges.append((seg_start, seg_end))
                seg_start = word.start
                seg_end = word.end

        ranges.append((seg_start, seg_end))
        return ranges


class Chapter(BaseModel):
    title: str
    start: float
    end: float
    summary: str = ""


class EditRange(BaseModel):
    """A range suggested by AI to delete or keep."""
    start_word_index: int
    end_word_index: int
    action: str = "delete"  # delete | keep
    reason: str = ""
