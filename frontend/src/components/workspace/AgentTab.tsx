import { MaterialIcon } from '../ui/MaterialIcon';
import type { StreamStatus } from '../../hooks/useAgentStream';
import clsx from 'clsx';

interface AgentTabProps {
  id: string;
  type: string;
  status: StreamStatus;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  transcribe: 'Transcribe',
  'filler-words': 'Filler Words',
  'smart-edit': 'Smart Edit',
  chapters: 'Chapters',
  export: 'Export',
  custom: 'Chat',
};

export function AgentTab({ type, status, isActive, onClick, onClose }: AgentTabProps) {
  const label = typeLabels[type] || type;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-b-2',
        isActive
          ? 'bg-md-surface text-md-on-surface border-md-primary'
          : 'bg-md-surface-container-low text-md-on-surface-variant border-transparent hover:text-md-on-surface hover:bg-md-surface-container',
      )}
    >
      {/* Status indicator */}
      {status === 'streaming' ? (
        <MaterialIcon name="progress_activity" size={14} className="animate-spin text-blue-500" />
      ) : status === 'done' ? (
        <MaterialIcon name="check_circle" size={14} className="text-green-500" />
      ) : status === 'error' ? (
        <MaterialIcon name="error" size={14} className="text-red-500" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-md-outline-variant" />
      )}

      <span className="max-w-[100px] truncate">{label}</span>

      {/* Close button */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-md-surface-container-high group-hover:opacity-100"
      >
        <MaterialIcon name="close" size={12} />
      </span>
    </button>
  );
}
