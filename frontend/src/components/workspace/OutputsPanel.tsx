import { useState, useEffect, useRef } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

interface MediaFile {
  filename: string;
  size: number;
  sizeHuman: string;
  type: 'video' | 'image' | 'audio' | 'other';
  url: string;
  createdAt: string;
}

interface OutputsPanelProps {
  projectId: string;
  refreshKey?: number;
  activeVideoUrl?: string;
  projectVideoUrl?: string;
  onSelectVideo?: (url: string) => void;
  onProjectVideoDeleted?: () => void;
  className?: string;
}

export function OutputsPanel({
  projectId,
  refreshKey = 0,
  activeVideoUrl,
  projectVideoUrl,
  onSelectVideo,
  onProjectVideoDeleted,
  className = '',
}: OutputsPanelProps) {
  const [inputs, setInputs] = useState<MediaFile[]>([]);
  const [outputs, setOutputs] = useState<MediaFile[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = () => {
    fetch(`/api/projects/${projectId}/inputs`)
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data: MediaFile[]) => setInputs(data))
      .catch(() => setInputs([]));
    fetch(`/api/projects/${projectId}/outputs`)
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data: MediaFile[]) => setOutputs(data))
      .catch(() => setOutputs([]));
  };

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 10_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  const handleSelect = (url: string) => {
    onSelectVideo?.(url);
  };

  const handleDelete = async (e: React.MouseEvent, file: MediaFile) => {
    e.stopPropagation();
    if (!confirm(`Удалить файл "${file.filename}"?`)) return;
    await fetch(`/api/projects/${projectId}/files/${encodeURIComponent(file.filename)}`, {
      method: 'DELETE',
    }).catch(() => {});
    if (activeVideoUrl === file.url) {
      onSelectVideo?.(undefined as unknown as string);
    }
    fetchAll();
  };

  const handleDeleteOriginal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Удалить оригинальное видео проекта? Это действие необратимо.')) return;
    await fetch(`/api/projects/${projectId}/video`, { method: 'DELETE' }).catch(() => {});
    onProjectVideoDeleted?.();
  };

  const handleDownload = (e: React.MouseEvent, file: MediaFile) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.filename;
    a.click();
  };

  const hasAnything = !!projectVideoUrl || inputs.length > 0 || outputs.length > 0;
  if (!hasAnything) return null;

  return (
    <div
      className={`border-t border-md-outline-variant bg-md-surface-container px-2 py-1.5 flex-shrink-0 ${className}`}
    >
      {/* Original project video */}
      {projectVideoUrl && (
        <>
          <div className="mb-1 flex items-center gap-1.5">
            <MaterialIcon name="movie" size={12} className="text-md-on-surface-variant" />
            <span className="text-[11px] font-medium text-md-on-surface-variant uppercase tracking-wide">
              Оригинал
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 mb-1.5" style={{ scrollbarWidth: 'thin' }}>
            <OriginalVideoCard
              url={projectVideoUrl}
              isSelected={activeVideoUrl === projectVideoUrl}
              onSelect={() => onSelectVideo?.(projectVideoUrl)}
              onDelete={handleDeleteOriginal}
            />
          </div>
        </>
      )}

      {/* Inputs section */}
      {inputs.length > 0 && (
        <>
          <div className="mb-1 flex items-center gap-1.5">
            <MaterialIcon name="file_upload" size={12} className="text-md-on-surface-variant" />
            <span className="text-[11px] font-medium text-md-on-surface-variant uppercase tracking-wide">
              Импортировано
            </span>
            <span className="ml-0.5 rounded-full bg-md-secondary-container px-1.5 text-[11px] text-md-on-secondary-container">
              {inputs.length}
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 mb-1.5" style={{ scrollbarWidth: 'thin' }}>
            {inputs.map((file) => (
              <MediaCard
                key={file.filename}
                file={file}
                isSelected={activeVideoUrl === file.url}
                canDelete
                onSelect={() => handleSelect(file.url)}
                onDelete={(e) => handleDelete(e, file)}
                onDownload={(e) => handleDownload(e, file)}
              />
            ))}
          </div>
        </>
      )}

      {/* Outputs section */}
      {outputs.length > 0 && (
        <>
          <div className="mb-1 flex items-center gap-1.5">
            <MaterialIcon name="folder_open" size={12} className="text-md-on-surface-variant" />
            <span className="text-[11px] font-medium text-md-on-surface-variant uppercase tracking-wide">
              Outputs
            </span>
            <span className="ml-0.5 rounded-full bg-md-secondary-container px-1.5 text-[11px] text-md-on-secondary-container">
              {outputs.length}
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }}>
            {outputs.map((file) => (
              <MediaCard
                key={file.filename}
                file={file}
                isSelected={activeVideoUrl === file.url}
                canDelete={false}
                onSelect={() => handleSelect(file.url)}
                onDownload={(e) => handleDownload(e, file)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Original video card
// ---------------------------------------------------------------------------

interface OriginalVideoCardProps {
  url: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function OriginalVideoCard({ url, isSelected, onSelect, onDelete }: OriginalVideoCardProps) {
  return (
    <div
      onClick={onSelect}
      className={[
        'group relative flex-shrink-0 rounded-lg border overflow-hidden transition-all cursor-pointer',
        'bg-md-surface-container-high',
        isSelected
          ? 'border-md-primary ring-1 ring-md-primary'
          : 'border-md-outline-variant hover:border-md-outline',
      ].join(' ')}
      style={{ width: 150 }}
      title="Оригинальное видео"
    >
      <div className="relative flex items-center justify-center bg-black overflow-hidden" style={{ height: 80 }}>
        <video src={url} preload="metadata" muted className="max-h-full max-w-full object-contain" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="rounded-full bg-md-primary/90 p-1">
            <MaterialIcon name="play_arrow" size={16} className="text-md-on-primary" />
          </div>
        </div>
        {isSelected && (
          <div className="absolute left-1 top-1 rounded-full bg-md-primary px-1.5 py-0.5">
            <span className="text-[10px] font-medium text-md-on-primary">Playing</span>
          </div>
        )}
        <button
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
          title="Удалить оригинальное видео"
        >
          <MaterialIcon name="delete" size={12} className="text-white" />
        </button>
      </div>
      <div className="px-1.5 py-1">
        <p className="truncate text-[11px] font-medium text-md-on-surface">Оригинал</p>
        <p className="text-[10px] text-md-on-surface-variant">Исходное видео</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual media card -- compact
// ---------------------------------------------------------------------------

interface MediaCardProps {
  file: MediaFile;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
}

function MediaCard({ file, isSelected, canDelete, onSelect, onDelete, onDownload }: MediaCardProps) {
  const isClickable = file.type === 'video';

  const typeIcon =
    file.type === 'video'
      ? 'movie'
      : file.type === 'image'
        ? 'image'
        : file.type === 'audio'
          ? 'audio_file'
          : 'insert_drive_file';

  return (
    <div
      onClick={isClickable ? onSelect : undefined}
      className={[
        'group relative flex-shrink-0 rounded-lg border overflow-hidden transition-all',
        'bg-md-surface-container-high',
        isSelected
          ? 'border-md-primary ring-1 ring-md-primary'
          : 'border-md-outline-variant hover:border-md-outline',
        isClickable ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
      style={{ width: 150 }}
      title={isClickable ? `Воспроизвести ${file.filename}` : file.filename}
    >
      {/* Thumbnail area */}
      <div
        className="relative flex items-center justify-center bg-black overflow-hidden"
        style={{ height: 80 }}
      >
        {file.type === 'video' && (
          <video
            src={file.url}
            preload="metadata"
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
        {file.type === 'image' && (
          <img
            src={file.url}
            alt={file.filename}
            className="max-h-full max-w-full object-contain"
          />
        )}
        {(file.type === 'audio' || file.type === 'other') && (
          <MaterialIcon name={typeIcon} size={28} className="text-white/40" />
        )}

        {/* Play overlay for video */}
        {file.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <div className="rounded-full bg-md-primary/90 p-1">
              <MaterialIcon name="play_arrow" size={16} className="text-md-on-primary" />
            </div>
          </div>
        )}

        {/* Selected badge */}
        {isSelected && (
          <div className="absolute left-1 top-1 rounded-full bg-md-primary px-1.5 py-0.5">
            <span className="text-[10px] font-medium text-md-on-primary">Playing</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-full bg-black/60 p-0.5 hover:bg-red-600/80"
              title="Удалить"
            >
              <MaterialIcon name="delete" size={12} className="text-white" />
            </button>
          )}
          <button
            onClick={onDownload}
            className="rounded-full bg-black/60 p-0.5 hover:bg-black/80"
            title="Скачать"
          >
            <MaterialIcon name="download" size={12} className="text-white" />
          </button>
        </div>
      </div>

      {/* File info */}
      <div className="px-1.5 py-1">
        <p
          className="truncate text-[11px] font-medium text-md-on-surface"
          title={file.filename}
        >
          {file.filename}
        </p>
        <p className="text-[10px] text-md-on-surface-variant">{file.sizeHuman}</p>
      </div>
    </div>
  );
}
