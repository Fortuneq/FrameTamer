"""Tests for Pydantic models."""
import pytest
from app.models.transcript import Word, TranscriptSegment, Transcript, Chapter, EditRange
from app.models.project import Project, ProjectStatus, VideoInfo
from app.models.timeline import Timeline, Track, Clip, ClipType
from app.models.export import ExportSettings, ExportFormat, ExportResolution


class TestWordModel:
    def test_defaults(self):
        w = Word(word="hello", start=0.0, end=0.5)
        assert w.confidence == 1.0
        assert w.deleted is False
        assert w.filler is False
        assert w.speaker is None

    def test_deleted_flag(self):
        w = Word(word="um", start=1.0, end=1.2, deleted=True, filler=True)
        assert w.deleted is True
        assert w.filler is True


class TestTranscriptSegment:
    def _make_segment(self) -> TranscriptSegment:
        return TranscriptSegment(
            start=0.0,
            end=3.0,
            words=[
                Word(word="Hello", start=0.0, end=0.5),
                Word(word="world", start=0.6, end=1.0),
                Word(word="um", start=1.1, end=1.3, deleted=True),
            ],
        )

    def test_text_excludes_deleted(self):
        seg = self._make_segment()
        assert "um" not in seg.text

    def test_full_text_includes_deleted(self):
        seg = self._make_segment()
        assert "um" in seg.full_text


class TestTranscript:
    def _make_transcript(self) -> Transcript:
        # Words 'One' and 'two' are adjacent with < 0.05s gap → merge into one range.
        # 'three' is deleted → skipped.
        # 'four' and 'five' are in a second segment after a long pause → separate range.
        return Transcript(
            language="en",
            duration=5.0,
            segments=[
                TranscriptSegment(
                    start=0.0,
                    end=2.0,
                    words=[
                        Word(word="One", start=0.0, end=0.4),
                        Word(word="two", start=0.44, end=0.9),   # gap = 0.04 < 0.05 → merges
                        Word(word="three", start=1.0, end=1.5, deleted=True),
                    ],
                ),
                TranscriptSegment(
                    start=2.1,
                    end=4.0,
                    words=[
                        Word(word="four", start=2.1, end=2.54),
                        Word(word="five", start=2.58, end=3.0),  # gap = 0.04 < 0.05 → merges
                    ],
                ),
            ],
        )

    def test_get_all_words(self):
        t = self._make_transcript()
        assert len(t.get_all_words()) == 5

    def test_get_active_words(self):
        t = self._make_transcript()
        active = t.get_active_words()
        assert len(active) == 4
        assert all(not w.deleted for w in active)

    def test_get_full_text(self):
        t = self._make_transcript()
        text = t.get_full_text()
        assert "One" in text
        assert "two" in text
        # 'three' is deleted so not in get_full_text
        assert "three" not in text

    def test_get_kept_time_ranges(self):
        t = self._make_transcript()
        ranges = t.get_kept_time_ranges()
        # Words 'One'+'two' merge into one range (gap < 0.05s).
        # 'four'+'five' merge into one range (gap < 0.05s).
        assert len(ranges) == 2
        assert ranges[0][0] == pytest.approx(0.0)
        assert ranges[0][1] == pytest.approx(0.9)
        assert ranges[1][0] == pytest.approx(2.1)
        assert ranges[1][1] == pytest.approx(3.0)

    def test_empty_transcript(self):
        t = Transcript()
        assert t.get_all_words() == []
        assert t.get_kept_time_ranges() == []


class TestTimeline:
    def test_rebuild_from_ranges(self):
        tl = Timeline()
        ranges = [(0.0, 2.0), (3.0, 5.0)]
        tl.rebuild_from_transcript_ranges("video.mp4", ranges)
        assert len(tl.tracks) == 1
        track = tl.tracks[0]
        assert len(track.clips) == 2
        assert tl.duration == pytest.approx(4.0)
        # Second clip starts at 2.0 on timeline (after first clip of 2s)
        assert track.clips[1].timeline_start == pytest.approx(2.0)
        assert track.clips[1].source_start == pytest.approx(3.0)


class TestProject:
    def test_defaults(self):
        p = Project(name="My Video")
        assert p.status == ProjectStatus.CREATED
        assert p.transcript is None
        assert p.video_filename == ""

    def test_get_video_path(self, tmp_path):
        p = Project(name="Test", video_filename="video.mp4")
        path = p.get_video_path(tmp_path)
        assert path is not None
        assert path.name == "video.mp4"

    def test_get_thumbnail_path_none_when_no_filename(self, tmp_path):
        p = Project(name="Test")
        assert p.get_thumbnail_path(tmp_path) is None


class TestExportSettings:
    def test_defaults(self):
        s = ExportSettings()
        assert s.format == ExportFormat.MP4
        assert s.resolution == ExportResolution.ORIGINAL
        assert s.crf == 23

    def test_crf_bounds(self):
        with pytest.raises(Exception):
            ExportSettings(crf=100)
