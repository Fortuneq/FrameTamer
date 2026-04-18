import { useState, useEffect, useRef } from 'react';

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface UseAgentStreamReturn {
  lines: string[];
  status: StreamStatus;
}

export function useAgentStream(taskId: string | null): UseAgentStreamReturn {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    setStatus('streaming');
    setLines([]);

    const es = new EventSource(`/api/agents/tasks/${taskId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'output') {
          setLines((prev) => [...prev, data.text]);
        } else if (data.type === 'done') {
          setStatus(data.status === 'completed' ? 'done' : 'error');
          es.close();
        }
      } catch {
        // Raw text line
        setLines((prev) => [...prev, event.data as string]);
      }
    };

    es.onerror = () => {
      setStatus('error');
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [taskId]);

  return { lines, status };
}
