import { useEffect, useRef, useMemo } from 'react';
import { ChatMessage } from './ChatMessage';
import { MaterialIcon } from '../ui/MaterialIcon';
import type { ChatMessageData } from './ChatMessage';

interface TerminalOutputProps {
  lines: string[];
  className?: string;
  userPrompt?: string;
  projectId?: string;
}

function parseOutputToMessages(lines: string[]): ChatMessageData[] {
  const messages: ChatMessageData[] = [];

  for (const line of lines) {
    if (line.startsWith('[stderr]')) continue;

    // Маркер сообщения пользователя при продолжении диалога
    if (line.startsWith('\x00USER_MSG:')) {
      const text = line.slice('\x00USER_MSG:'.length);
      messages.push({ type: 'user-prompt', text });
      continue;
    }

    try {
      const evt = JSON.parse(line);

      if (evt.type === 'assistant') {
        for (const block of evt.message?.content ?? []) {
          if (block.type === 'text' && block.text?.trim()) {
            messages.push({ type: 'agent-text', text: block.text.trim() });
          }
          if (block.type === 'tool_use') {
            const toolName = block.name ?? 'Tool';
            const command =
              block.input?.command ||
              block.input?.content ||
              (block.input ? JSON.stringify(block.input).slice(0, 300) : '');
            messages.push({
              type: 'tool-call',
              toolName,
              content: command,
              status: 'running',
              id: block.id,
            });
          }
        }
        continue;
      }

      if (evt.type === 'user') {
        for (const block of evt.message?.content ?? []) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            // Walk backwards to find the matching tool-call and mark it done
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].type === 'tool-call' && messages[i].id === block.tool_use_id) {
                messages[i] = { ...messages[i], status: 'done' };
                break;
              }
            }
          }
        }
        continue;
      }

      if (evt.type === 'result') {
        for (const block of evt.result?.content ?? []) {
          if (block.type === 'text' && block.text?.trim()) {
            messages.push({ type: 'agent-text', text: block.text.trim(), isFinal: true });
          }
        }
        continue;
      }

      // Fallback: try to extract text from simpler event shapes
      if (evt.type === 'text' && evt.text?.trim()) {
        messages.push({ type: 'agent-text', text: evt.text.trim() });
        continue;
      }

      if (evt.type === 'tool_use') {
        const toolName = evt.name ?? 'Tool';
        const command =
          evt.input?.command ||
          evt.input?.content ||
          (evt.input ? JSON.stringify(evt.input).slice(0, 300) : '');
        messages.push({
          type: 'tool-call',
          toolName,
          content: command,
          status: 'running',
          id: evt.id,
        });
        continue;
      }

      if (evt.type === 'status' && evt.text?.trim()) {
        messages.push({ type: 'agent-text', text: evt.text.trim() });
        continue;
      }
    } catch {
      // Not JSON -- show as raw agent text if non-empty
      const trimmed = line.trim();
      if (trimmed) {
        messages.push({ type: 'agent-text', text: trimmed });
      }
    }
  }

  return messages;
}

function detectResultFiles(messages: ChatMessageData[], projectId?: string): ChatMessageData[] {
  if (!projectId) return messages;
  const result: ChatMessageData[] = [];
  const addedFiles = new Set<string>();

  for (const msg of messages) {
    result.push(msg);
    // Look for file mentions in agent text
    if (msg.type === 'agent-text' && msg.text) {
      const filePattern = /[`"]?([\w.-]+\.(mp4|mov|webm|avi|png|jpg|jpeg|gif|wav|mp3))[`"]?/gi;
      let match;
      while ((match = filePattern.exec(msg.text)) !== null) {
        const filename = match[1];
        if (!addedFiles.has(filename) && !filename.includes('/')) {
          addedFiles.add(filename);
          result.push({
            type: 'result-file',
            filePath: filename,
            fileUrl: `/api/projects/${projectId}/files/${filename}`,
          });
        }
      }
    }
  }
  return result;
}

export function TerminalOutput({ lines, className = '', userPrompt, projectId }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const msgs: ChatMessageData[] = [];
    if (userPrompt) {
      msgs.push({ type: 'user-prompt', text: userPrompt });
    }
    msgs.push(...parseOutputToMessages(lines));
    return detectResultFiles(msgs, projectId);
  }, [lines, userPrompt, projectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto px-3 py-2 ${className}`}
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-md-on-surface-variant">
          <MaterialIcon name="smart_toy" size={40} className="opacity-30" />
          <span className="text-sm opacity-60">Type a prompt or use a quick action to start</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
