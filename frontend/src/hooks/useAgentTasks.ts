import { useState, useCallback, useEffect } from 'react';
import type { StreamStatus } from './useAgentStream';

export interface AgentTask {
  id: string;
  type: string;
  status: StreamStatus;
  lines: string[];
  startedAt: number;
  userPrompt?: string;
}

// ---------------------------------------------------------------------------
// Global store — survives unmount/remount of components
// ---------------------------------------------------------------------------

type Listener = () => void;

const globalTasks = new Map<string, AgentTask[]>();
const globalActive = new Map<string, string | null>();
const loadedProjects = new Set<string>();
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function getTasksFor(pid: string): AgentTask[] {
  return globalTasks.get(pid) ?? [];
}

function setTasksFor(pid: string, updater: (prev: AgentTask[]) => AgentTask[]) {
  globalTasks.set(pid, updater(getTasksFor(pid)));
  notify();
}

function getActiveFor(pid: string): string | null {
  return globalActive.get(pid) ?? null;
}

function setActiveFor(pid: string, id: string | null) {
  globalActive.set(pid, id);
  notify();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAgentTasksReturn {
  tasks: AgentTask[];
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  startTask: (projectId: string, type: string, endpoint: string, body?: Record<string, unknown>) => Promise<string | null>;
  continueActiveTask: (instruction: string, fromTaskId: string) => Promise<string | null>;
  newChat: (projectId: string, prompt: string) => Promise<string | null>;
  createEmptyChat: () => string;
  updateTaskLines: (taskId: string, lines: string[]) => void;
  updateTaskStatus: (taskId: string, status: StreamStatus) => void;
  closeTask: (taskId: string) => void;
  killTask: (taskId: string) => Promise<void>;
}

export function useAgentTasks(projectId?: string): UseAgentTasksReturn {
  const pid = projectId ?? '';
  const [, forceUpdate] = useState(0);

  // Subscribe to global store changes
  useEffect(() => {
    const listener = () => forceUpdate(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  // Load existing tasks from backend once per project
  useEffect(() => {
    if (!pid || loadedProjects.has(pid)) return;
    loadedProjects.add(pid);

    fetch(`/api/agents/projects/${pid}/tasks`)
      .then((res) => res.json())
      .then((data: { id: string; type: string; status: string; startedAt?: string; started_at?: string; output?: string[] }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped: AgentTask[] = data.map((t) => ({
            id: t.id,
            type: t.type,
            status: (t.status === 'running' ? 'streaming' : t.status === 'completed' ? 'done' : t.status === 'failed' ? 'error' : 'idle') as StreamStatus,
            lines: t.output ?? [],
            startedAt: t.startedAt ? new Date(t.startedAt).getTime() : t.started_at ? new Date(t.started_at).getTime() : Date.now(),
          }));
          setTasksFor(pid, (prev) => {
            const existingIds = new Set(prev.map(t => t.id));
            return [...prev, ...mapped.filter(t => !existingIds.has(t.id))];
          });
        }
      })
      .catch(() => {});
  }, [pid]);

  const tasks = getTasksFor(pid);
  const activeTaskId = getActiveFor(pid);

  const setActiveTaskId = useCallback(
    (id: string | null) => setActiveFor(pid, id),
    [pid],
  );

  const startTask = useCallback(
    async (_projectId: string, type: string, endpoint: string, body?: Record<string, unknown>): Promise<string | null> => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const taskId = data.task_id || data.taskId || data.id;
        if (!taskId) return null;

        const userPrompt = (body?.instruction as string | undefined) ?? undefined;
        setTasksFor(pid, (prev) => [...prev, {
          id: taskId,
          type,
          status: 'streaming' as StreamStatus,
          lines: [],
          startedAt: Date.now(),
          userPrompt,
        }]);
        setActiveFor(pid, taskId);
        return taskId;
      } catch (err) {
        console.error('Failed to start task:', err);
        return null;
      }
    },
    [pid],
  );

  const continueActiveTask = useCallback(
    async (instruction: string, fromTaskId: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/agents/tasks/${fromTaskId}/continue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { taskId: string };
        const newTaskId = data.taskId;
        if (!newTaskId) return null;

        // Новый backend-таск стримит продолжение сессии.
        // Переиспользуем ID старого фронт-таска чтобы оставаться в том же табе:
        // удаляем старый таск и добавляем новый с тем же id что у бэкенда,
        // но сохраняем историю строк.
        setTasksFor(pid, (prev) => {
          const oldTask = prev.find(t => t.id === fromTaskId);
          const oldLines = oldTask?.lines ?? [];
          // Добавляем маркер сообщения пользователя в историю
          const separator = `\x00USER_MSG:${instruction}`;
          const rest = prev.filter(t => t.id !== fromTaskId);
          return [...rest, {
            id: newTaskId,
            type: 'custom',
            status: 'streaming' as StreamStatus,
            lines: [...oldLines, separator],
            startedAt: Date.now(),
            userPrompt: oldTask?.userPrompt, // сохраняем первый промпт для отображения вверху
          }];
        });
        setActiveFor(pid, newTaskId);
        return newTaskId;
      } catch (err) {
        console.error('Failed to continue task:', err);
        return null;
      }
    },
    [pid],
  );

  const newChat = useCallback(
    async (ppid: string, prompt: string): Promise<string | null> => {
      return startTask(ppid, 'custom', `/api/agents/projects/${ppid}/ai/custom`, { instruction: prompt });
    },
    [startTask],
  );

  const createEmptyChat = useCallback((): string => {
    const id = `chat-${Date.now()}`;
    setTasksFor(pid, (prev) => [...prev, {
      id,
      type: 'chat',
      status: 'idle' as StreamStatus,
      lines: [],
      startedAt: Date.now(),
    }]);
    setActiveFor(pid, id);
    return id;
  }, [pid]);

  const updateTaskLines = useCallback((taskId: string, lines: string[]) => {
    setTasksFor(pid, (prev) => prev.map((t) => (t.id === taskId ? { ...t, lines } : t)));
  }, [pid]);

  const updateTaskStatus = useCallback((taskId: string, status: StreamStatus) => {
    setTasksFor(pid, (prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }, [pid]);

  const closeTask = useCallback((taskId: string) => {
    const currentActive = getActiveFor(pid);
    setTasksFor(pid, (prev) => {
      const remaining = prev.filter((t) => t.id !== taskId);
      if (currentActive === taskId) {
        setActiveFor(pid, remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      return remaining;
    });
  }, [pid]);

  const killTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/agents/tasks/${taskId}/kill`, { method: 'POST' });
      setTasksFor(pid, (prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'error' as StreamStatus } : t)));
    } catch {}
  }, [pid]);

  return {
    tasks,
    activeTaskId,
    setActiveTaskId,
    startTask,
    continueActiveTask,
    newChat,
    createEmptyChat,
    updateTaskLines,
    updateTaskStatus,
    closeTask,
    killTask,
  };
}
