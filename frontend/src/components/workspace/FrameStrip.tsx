import { useState, useEffect, useRef, useCallback } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

interface Frame {
  filename: string;
  time: number;
  url: string;
}

interface FrameStripProps {
  projectId: string;
  onSeekTo?: (time: number) => void;
  onExtractFrames?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function FrameStrip({ projectId, onSeekTo, onExtractFrames }: FrameStripProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [tooltip, setTooltip] = useState<{ frame: Frame; x: number; y: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const fetchFrames = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/frames`)
      .then((r) => r.json())
      .then((data: Frame[]) => {
        setFrames(Array.isArray(data) ? data : []);
      })
      .catch(() => setFrames([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchFrames();
  }, [fetchFrames]);

  const handleExtract = useCallback(() => {
    setExtracting(true);
    fetch(`/api/projects/${projectId}/extract-frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: 30 }),
    })
      .then((r) => r.json())
      .then(() => {
        fetchFrames();
        onExtractFrames?.();
      })
      .catch(() => {})
      .finally(() => setExtracting(false));
  }, [projectId, fetchFrames, onExtractFrames]);

  if (loading) {
    return (
      <div className="flex h-8 items-center justify-center bg-md-surface-container flex-shrink-0">
        <MaterialIcon name="progress_activity" size={14} className="animate-spin text-md-on-surface-variant" />
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="flex h-8 items-center justify-center bg-md-surface-container gap-2 flex-shrink-0">
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="flex items-center gap-1 rounded-full bg-md-secondary-container px-2.5 py-0.5 text-[11px] font-medium text-md-on-secondary-container hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {extracting ? (
            <MaterialIcon name="progress_activity" size={12} className="animate-spin" />
          ) : (
            <MaterialIcon name="grid_view" size={12} />
          )}
          {extracting ? 'Extracting...' : 'Extract Frames'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-md-surface-container flex-shrink-0">
      {/* Scrollable strip */}
      <div
        ref={stripRef}
        className="flex gap-0.5 overflow-x-auto px-1.5 py-1 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {frames.map((frame) => (
          <button
            key={frame.filename}
            onClick={() => onSeekTo?.(frame.time)}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setTooltip({ frame, x: rect.left + rect.width / 2, y: rect.top });
            }}
            onMouseLeave={() => setTooltip(null)}
            className="relative flex-shrink-0 overflow-hidden rounded group"
            style={{ width: 80, height: 45 }}
            title={`Jump to ${formatTime(frame.time)}`}
          >
            <img
              src={frame.url}
              alt={`Frame at ${formatTime(frame.time)}`}
              className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
              loading="lazy"
              style={{ borderRadius: 3 }}
            />
            {/* Timestamp overlay */}
            <span
              className="absolute bottom-0 left-0 right-0 text-center text-md-inverse-on-surface text-[9px] font-medium leading-3"
              style={{ background: 'rgba(0,0,0,0.55)', borderRadius: '0 0 3px 3px' }}
            >
              {formatTime(frame.time)}
            </span>
            {/* Hover ring */}
            <div className="absolute inset-0 rounded opacity-0 group-hover:opacity-100 ring-2 ring-md-primary transition-opacity" style={{ borderRadius: 3 }} />
          </button>
        ))}
      </div>

      {/* Hover tooltip with larger preview */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x - 100, window.innerWidth - 216),
            top: tooltip.y - 138,
          }}
        >
          <div className="rounded-lg overflow-hidden shadow-xl ring-1 ring-md-outline-variant bg-md-surface-container">
            <img
              src={tooltip.frame.url}
              alt=""
              style={{ width: 200, height: 112 }}
              className="object-cover block"
            />
            <div className="px-2 py-0.5 text-center text-[11px] text-md-on-surface-variant">
              {formatTime(tooltip.frame.time)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
