import { MaterialIcon } from '../ui/MaterialIcon';
import { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import type { ProjectSummary } from '../../types';

interface ProjectCardProps {
  project: ProjectSummary;
  thumbnailUrl?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

const statusVariants: Record<string, 'success' | 'warning' | 'secondary'> = {
  ready: 'success',
  completed: 'success',
  transcribing: 'warning',
  in_progress: 'warning',
  exporting: 'warning',
  created: 'secondary',
  draft: 'secondary',
  error: 'secondary',
};

const statusLabels: Record<string, string> = {
  ready: 'Ready',
  completed: 'Completed',
  transcribing: 'Transcribing',
  in_progress: 'In Progress',
  exporting: 'Exporting',
  created: 'Created',
  draft: 'Draft',
  error: 'Error',
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectCard({ project, thumbnailUrl, onClick, onDelete }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all hover:shadow-md"
      onClick={onClick}
    >
      <div className="relative aspect-video bg-md-surface-container-high">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={project.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-md-on-surface-variant">
            <MaterialIcon name="movie" size={48} className="opacity-30" />
          </div>
        )}
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="relative">
            <IconButton
              variant="ghost"
              size="sm"
              className="bg-black/50 text-white hover:bg-black/70"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
            >
              <MaterialIcon name="more_horiz" size={18} />
            </IconButton>
            {showMenu && (
              <div
                className="absolute right-0 top-8 z-10 w-36 rounded-xl border border-md-outline-variant bg-md-surface-container py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-md-error hover:bg-md-surface-container-high cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete?.();
                  }}
                >
                  <MaterialIcon name="delete" size={16} />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>
        {project.duration > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
            <MaterialIcon name="schedule" size={12} />
            {formatDuration(project.duration)}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-md-on-surface">{project.name}</h3>
          <Badge variant={statusVariants[project.status] ?? 'secondary'}>
            {statusLabels[project.status] ?? project.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-md-on-surface-variant">
          {formatRelativeTime(project.created_at)}
        </p>
      </div>
    </Card>
  );
}
