import { useEffect, useRef, useState, useCallback } from 'react';

interface SSEState<T> {
  data: T | null;
  error: string | null;
  isConnected: boolean;
}

export function useSSE<T = unknown>(url: string | null) {
  const [state, setState] = useState<SSEState<T>>({
    data: null,
    error: null,
    isConnected: false,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!url) return;

    const eventSource = new EventSource(`/api${url}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setState((s) => ({ ...s, isConnected: true, error: null }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as T;
        setState((s) => ({ ...s, data }));
      } catch {
        setState((s) => ({ ...s, data: event.data as T }));
      }
    };

    eventSource.onerror = () => {
      setState((s) => ({ ...s, isConnected: false, error: 'Connection lost' }));
      eventSource.close();
    };
  }, [url]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setState((s) => ({ ...s, isConnected: false }));
    }
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { ...state, connect, disconnect };
}
