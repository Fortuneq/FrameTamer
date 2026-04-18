import { MaterialIcon } from '../ui/MaterialIcon';
import { IconButton } from '../ui/IconButton';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useEffect } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface VideoPreviewProps {
  className?: string;
  videoUrl?: string;
  seekToTime?: number; // when this value changes, seek video to that time (in seconds)
}

export function VideoPreview({ className = '', videoUrl, seekToTime }: VideoPreviewProps) {
  const {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    togglePlay,
    toggleMute,
    seek,
  } = useVideoPlayer();

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.src = videoUrl;
      videoRef.current.load();
    }
  }, [videoUrl, videoRef]);

  // Seek when seekToTime changes (only when it's a valid number)
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime >= 0) {
      seek(seekToTime);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekToTime]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasVideo = !!videoUrl;

  return (
    <div className={`flex flex-col bg-black rounded-xl overflow-hidden ${className}`}>
      {/* Video area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden min-h-0">
        <video
          ref={videoRef}
          className="max-h-full max-w-full"
          playsInline
          style={{ display: hasVideo ? 'block' : 'none' }}
        />
        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-white/40">
              <MaterialIcon name="movie" size={48} />
              <span className="text-sm">No video loaded</span>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="group h-1 cursor-pointer bg-white/20"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          seek(x * duration);
        }}
      >
        <div
          className="h-full bg-md-primary transition-all group-hover:h-1.5"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 bg-black/80 px-3 py-1.5">
        <IconButton onClick={() => seek(Math.max(0, currentTime - 10))} className="text-white/70 hover:text-white hover:bg-white/10">
          <MaterialIcon name="fast_rewind" size={18} />
        </IconButton>
        <IconButton onClick={togglePlay} className="text-white hover:bg-white/10">
          <MaterialIcon name={isPlaying ? 'pause' : 'play_arrow'} size={24} />
        </IconButton>
        <IconButton onClick={() => seek(Math.min(duration, currentTime + 10))} className="text-white/70 hover:text-white hover:bg-white/10">
          <MaterialIcon name="fast_forward" size={18} />
        </IconButton>
        <span className="ml-1 text-xs tabular-nums text-white/70">
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </span>
        <div className="flex-1" />
        <IconButton onClick={toggleMute} className="text-white/70 hover:text-white hover:bg-white/10">
          <MaterialIcon name={isMuted ? 'volume_off' : 'volume_up'} size={18} />
        </IconButton>
      </div>
    </div>
  );
}
