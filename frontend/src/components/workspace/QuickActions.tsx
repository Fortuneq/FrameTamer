import { MaterialIcon } from '../ui/MaterialIcon';
import clsx from 'clsx';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  type: string;
}

const actions: QuickAction[] = [
  { id: 'transcribe', label: 'Transcribe', icon: 'mic', type: 'transcribe' },
  { id: 'filler', label: 'Filler Words', icon: 'filter_alt', type: 'filler-words' },
  { id: 'smart-edit', label: 'Smart Edit', icon: 'auto_fix_high', type: 'smart-edit' },
  { id: 'chapters', label: 'Chapters', icon: 'bookmark', type: 'chapters' },
  { id: 'export', label: 'Export', icon: 'download', type: 'export' },
];

interface QuickActionsProps {
  onAction: (type: string) => void;
  runningTypes: Set<string>;
  disabled?: boolean;
}

export function QuickActions({ onAction, runningTypes, disabled = false }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {actions.map((action) => {
        const isRunning = runningTypes.has(action.type);
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.type)}
            disabled={disabled || isRunning}
            className={clsx(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
              'border border-gray-700 hover:border-gray-500 hover:bg-gray-800',
              'text-gray-400 hover:text-gray-200',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isRunning ? (
              <MaterialIcon name="progress_activity" size={14} className="animate-spin" />
            ) : (
              <MaterialIcon name={action.icon} size={14} />
            )}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
