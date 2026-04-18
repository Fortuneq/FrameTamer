import { useEffect, useRef } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';
import { useTranscript } from '../../hooks/useTranscript';
import clsx from 'clsx';

interface TranscriptPanelProps {
  projectId?: string;
  className?: string;
  refreshKey?: number;
  onClose?: () => void;
}

export function TranscriptPanel({ projectId, className = '', refreshKey = 0, onClose }: TranscriptPanelProps) {
  const { segments, loading, error, deleteWord, restoreWord } = useTranscript(projectId);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalWords = segments.reduce(
    (acc, seg) => acc + seg.words.filter((w) => !w.deleted).length,
    0,
  );

  // Scroll to top on refresh
  useEffect(() => {
    if (containerRef.current && refreshKey > 0) {
      containerRef.current.scrollTop = 0;
    }
  }, [refreshKey]);

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-md-outline-variant px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MaterialIcon name="description" size={16} className="text-md-on-surface-variant" />
          <span className="text-sm font-medium text-md-on-surface">Transcript</span>
          {totalWords > 0 && (
            <span className="text-[11px] text-md-on-surface-variant">
              {totalWords} words
            </span>
          )}
          {refreshKey > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-md-primary-container px-1.5 py-0.5 text-[10px] font-medium text-md-on-primary-container">
              <MaterialIcon name="auto_awesome" size={10} />
              AI
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-md-on-surface-variant hover:bg-md-surface-container-high transition-colors"
            title="Close transcript"
          >
            <MaterialIcon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-md-on-surface-variant">
            <MaterialIcon name="progress_activity" size={24} className="animate-spin mb-2" />
            <span className="text-sm">Loading transcript...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-md-error">
            <MaterialIcon name="error" size={24} className="mb-2" />
            <span className="text-sm">{error}</span>
          </div>
        ) : segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-md-on-surface-variant">
            <MaterialIcon name="subtitles_off" size={32} className="mb-2 opacity-40" />
            <span className="text-sm">No transcript yet</span>
            <span className="mt-1 text-xs opacity-60">
              Use the Transcribe button to generate one
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((segment) => (
              <div key={segment.id}>
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-md-primary">
                    {segment.speaker_name}
                  </span>
                  <span className="text-[10px] text-md-on-surface-variant tabular-nums">
                    {formatTimestamp(segment.start)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-md-on-surface">
                  {segment.words.map((word) => (
                    <span
                      key={word.id}
                      onClick={() => {
                        if (word.deleted) {
                          restoreWord(word.id);
                        } else {
                          deleteWord(word.id);
                        }
                      }}
                      className={clsx(
                        'cursor-pointer rounded px-0.5 transition-colors hover:bg-md-surface-container-high',
                        word.deleted && 'line-through opacity-40 bg-red-500/10',
                      )}
                    >
                      {word.text}{' '}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
