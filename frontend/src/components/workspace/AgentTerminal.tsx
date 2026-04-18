import { useEffect, useCallback, useMemo, useRef } from 'react';
import { AgentTab } from './AgentTab';
import { TerminalOutput } from './TerminalOutput';
import { PromptInput } from './PromptInput';
import { useAgentStream } from '../../hooks/useAgentStream';
import type { AgentTask } from '../../hooks/useAgentTasks';
import type { StreamStatus } from '../../hooks/useAgentStream';
import { MaterialIcon } from '../ui/MaterialIcon';

interface AgentTerminalProps {
  projectId: string;
  tasks: AgentTask[];
  activeTaskId: string | null;
  onSetActiveTask: (id: string | null) => void;
  onCloseTask: (id: string) => void;
  onStartTask: (type: string, endpoint: string, body?: Record<string, unknown>) => Promise<string | null>;
  onContinueTask: (instruction: string, fromTaskId: string) => Promise<string | null>;
  onKillTask: (taskId: string) => Promise<void>;
  onNewChat: () => void;
  onUpdateTaskLines: (taskId: string, lines: string[]) => void;
  onUpdateTaskStatus: (taskId: string, status: StreamStatus) => void;
  onTaskComplete: () => void;
}

export function AgentTerminal({
  projectId,
  tasks,
  activeTaskId,
  onSetActiveTask,
  onCloseTask,
  onStartTask,
  onContinueTask,
  onKillTask,
  onNewChat,
  onUpdateTaskLines,
  onUpdateTaskStatus,
  onTaskComplete,
}: AgentTerminalProps) {
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const streamTaskId = activeTask?.status === 'streaming' ? activeTask.id : null;
  const { lines: streamLines, status: streamStatus } = useAgentStream(streamTaskId);

  useEffect(() => {
    if (streamTaskId && streamLines.length > 0) {
      onUpdateTaskLines(streamTaskId, streamLines);
    }
  }, [streamTaskId, streamLines, onUpdateTaskLines]);

  useEffect(() => {
    if (streamTaskId && (streamStatus === 'done' || streamStatus === 'error')) {
      onUpdateTaskStatus(streamTaskId, streamStatus);
      if (streamStatus === 'done') {
        onTaskComplete();
      }
    }
  }, [streamTaskId, streamStatus, onUpdateTaskStatus, onTaskComplete]);

  const displayLines = activeTask
    ? activeTask.status === 'streaming'
      ? streamLines
      : activeTask.lines
    : [];

  const handleSendPrompt = useCallback(
    async (text: string) => {
      // If active task is an empty chat placeholder, close it and start fresh
      if (activeTask && activeTask.status === 'idle' && activeTask.lines.length === 0) {
        onCloseTask(activeTask.id);
        await onStartTask(
          'custom',
          `/api/agents/projects/${projectId}/ai/custom`,
          { instruction: text },
        );
        return;
      }

      // If active task is completed/errored, try to continue the Claude session
      if (activeTask && (activeTask.status === 'done' || activeTask.status === 'error')) {
        // Pass the task id explicitly — don't rely on global active state which may have changed
        const result = await onContinueTask(text, activeTask.id);
        if (result) return; // successfully continued
        // Fallback: start new task if continue failed (no sessionId on backend)
      }

      // Default: start a new task
      await onStartTask(
        'custom',
        `/api/agents/projects/${projectId}/ai/custom`,
        { instruction: text },
      );
    },
    [projectId, onStartTask, onContinueTask, activeTask, onCloseTask],
  );

  const handleQuickAction = useCallback(
    async (type: string) => {
      const endpointMap: Record<string, string> = {
        transcribe: `/api/agents/projects/${projectId}/transcribe`,
        'filler-words': `/api/agents/projects/${projectId}/ai/filler-words`,
        chapters: `/api/agents/projects/${projectId}/ai/chapters`,
        export: `/api/agents/projects/${projectId}/export`,
      };
      const endpoint = endpointMap[type];
      if (endpoint) {
        await onStartTask(type, endpoint);
      }
    },
    [projectId, onStartTask],
  );

  const handleNewChat = useCallback(() => {
    onNewChat();
    setTimeout(() => promptRef.current?.focus(), 50);
  }, [onNewChat]);

  const runningTypes = useMemo(
    () => new Set(tasks.filter((t) => t.status === 'streaming').map((t) => t.type)),
    [tasks],
  );

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-md-surface overflow-hidden">
      {/* Row 1: Tab bar — fixed height */}
      <div className="flex items-center border-b border-md-outline-variant bg-md-surface-container-low">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto px-1 pt-1">
          {tasks.map((task) => (
            <AgentTab
              key={task.id}
              id={task.id}
              type={task.type}
              status={task.status}
              isActive={task.id === activeTaskId}
              onClick={() => onSetActiveTask(task.id)}
              onClose={() => onCloseTask(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-md-on-surface-variant">
              <MaterialIcon name="chat" size={14} />
              Agent Chat
            </div>
          )}
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1 mr-2 px-2 py-1 rounded-md text-xs font-medium text-md-on-surface-variant hover:bg-md-surface-container-high transition-colors cursor-pointer"
          title="New Chat"
        >
          <MaterialIcon name="add" size={16} />
          New Chat
        </button>
      </div>

      {/* Row 2: Chat messages — scrollable, takes remaining space */}
      <TerminalOutput
        lines={displayLines}
        className="overflow-auto bg-md-surface"
        userPrompt={activeTask?.userPrompt}
        projectId={projectId}
      />

      {/* Row 3: Input area — fixed height at bottom */}
      <PromptInput
        onSend={handleSendPrompt}
        onQuickAction={handleQuickAction}
        onStop={streamTaskId ? () => onKillTask(streamTaskId) : undefined}
        isStreaming={!!streamTaskId}
        disabled={!projectId}
        runningTypes={runningTypes}
        textareaRef={promptRef}
      />
    </div>
  );
}
