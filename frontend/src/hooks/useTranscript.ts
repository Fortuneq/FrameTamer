import { useState, useCallback, useEffect } from 'react';
import type { SpeakerSegment, TranscriptWord } from '../types';

interface ApiWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  deleted: boolean;
  filler: boolean;
}

interface ApiSegment {
  speaker: string;
  start: number;
  end: number;
  words: ApiWord[];
}

interface ApiTranscriptResponse {
  segments: ApiSegment[];
  language: string;
  duration: number;
}

function mapApiToLocal(apiSegments: ApiSegment[]): SpeakerSegment[] {
  const speakerMap = new Map<string, string>();
  let speakerCounter = 0;

  return apiSegments.map((seg, segIdx) => {
    if (!speakerMap.has(seg.speaker)) {
      speakerCounter++;
      speakerMap.set(seg.speaker, `sp${speakerCounter}`);
    }
    const speakerId = speakerMap.get(seg.speaker)!;

    return {
      id: `s${segIdx + 1}`,
      speaker_id: speakerId,
      speaker_name: seg.speaker,
      start: seg.start,
      end: seg.end,
      words: seg.words.map((w, wIdx) => ({
        id: `s${segIdx + 1}_w${wIdx}`,
        text: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        deleted: w.deleted,
        speaker_id: speakerId,
      })),
    };
  });
}

function getGlobalWordIndex(segments: SpeakerSegment[], wordId: string): number {
  let idx = 0;
  for (const seg of segments) {
    for (const w of seg.words) {
      if (w.id === wordId) return idx;
      idx++;
    }
  }
  return -1;
}

interface UseTranscriptReturn {
  segments: SpeakerSegment[];
  activeWordId: string | null;
  setActiveWordId: (id: string | null) => void;
  deleteWord: (wordId: string) => void;
  restoreWord: (wordId: string) => void;
  getWordAtTime: (time: number) => TranscriptWord | null;
  findAndReplace: (find: string, replace: string) => number;
  loading: boolean;
  error: string | null;
}

export function useTranscript(projectId?: string): UseTranscriptReturn {
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/projects/${projectId}/transcript`)
      .then((res) => {
        if (res.status === 404) {
          // No transcript yet — not an error, just empty
          if (!cancelled) setSegments([]);
          return null;
        }
        if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
        return res.json() as Promise<ApiTranscriptResponse>;
      })
      .then((data) => {
        if (!cancelled && data) {
          setSegments(mapApiToLocal(data.segments));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transcript');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const deleteWord = useCallback(
    (wordId: string) => {
      if (!projectId) return;

      setSegments((prev) => {
        const idx = getGlobalWordIndex(prev, wordId);
        if (idx === -1) return prev;

        fetch(`/api/projects/${projectId}/editor/words/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indices: [idx] }),
        }).catch(console.error);

        return prev.map((seg) => ({
          ...seg,
          words: seg.words.map((w) =>
            w.id === wordId ? { ...w, deleted: true } : w,
          ),
        }));
      });
    },
    [projectId],
  );

  const restoreWord = useCallback(
    (wordId: string) => {
      if (!projectId) return;

      setSegments((prev) => {
        const idx = getGlobalWordIndex(prev, wordId);
        if (idx === -1) return prev;

        fetch(`/api/projects/${projectId}/editor/words/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indices: [idx] }),
        }).catch(console.error);

        return prev.map((seg) => ({
          ...seg,
          words: seg.words.map((w) =>
            w.id === wordId ? { ...w, deleted: false } : w,
          ),
        }));
      });
    },
    [projectId],
  );

  const getWordAtTime = useCallback(
    (time: number): TranscriptWord | null => {
      for (const seg of segments) {
        for (const word of seg.words) {
          if (time >= word.start && time <= word.end && !word.deleted) {
            return word;
          }
        }
      }
      return null;
    },
    [segments],
  );

  const findAndReplace = useCallback(
    (find: string, replace: string): number => {
      let count = 0;
      setSegments((prev) => {
        const updated = prev.map((seg) => ({
          ...seg,
          words: seg.words.map((w) => {
            if (w.text.toLowerCase().includes(find.toLowerCase()) && !w.deleted) {
              count++;
              return { ...w, text: w.text.replace(new RegExp(find, 'gi'), replace) };
            }
            return w;
          }),
        }));

        if (projectId && count > 0) {
          const apiSegments = updated.map((seg) => ({
            speaker: seg.speaker_name,
            start: seg.start,
            end: seg.end,
            words: seg.words.map((w) => ({
              word: w.text,
              start: w.start,
              end: w.end,
              confidence: w.confidence,
              deleted: w.deleted,
              filler: false,
            })),
          }));

          fetch(`/api/projects/${projectId}/transcript`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segments: apiSegments }),
          }).catch(console.error);
        }

        return updated;
      });
      return count;
    },
    [projectId],
  );

  return {
    segments,
    activeWordId,
    setActiveWordId,
    deleteWord,
    restoreWord,
    getWordAtTime,
    findAndReplace,
    loading,
    error,
  };
}
