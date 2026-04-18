import { useState } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

export interface ChatMessageData {
  type: 'agent-text' | 'tool-call' | 'user-prompt' | 'result-file';
  text?: string;
  toolName?: string;
  content?: string;
  status?: 'running' | 'done' | 'error';
  id?: string;
  isFinal?: boolean;
  filePath?: string;
  fileUrl?: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.type === 'user-prompt') {
    return <UserPromptMessage text={message.text ?? ''} />;
  }

  if (message.type === 'result-file') {
    return <ResultFilePreview filePath={message.filePath ?? ''} fileUrl={message.fileUrl ?? ''} />;
  }

  if (message.type === 'tool-call') {
    return (
      <ToolCallBlock
        toolName={message.toolName ?? 'Tool'}
        content={message.content ?? ''}
        status={message.status ?? 'running'}
      />
    );
  }

  // agent-text
  return <AgentTextMessage text={message.text ?? ''} isFinal={message.isFinal} />;
}

function AgentTextMessage({ text, isFinal }: { text: string; isFinal?: boolean }) {
  return (
    <div className="px-1 py-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-xs font-medium text-md-on-surface-variant">Claude</span>
        {isFinal && (
          <span className="text-[10px] font-medium text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded-full">
            done
          </span>
        )}
      </div>
      <p className="text-sm text-md-on-surface leading-relaxed whitespace-pre-wrap ml-4">
        {text}
      </p>
    </div>
  );
}

function UserPromptMessage({ text }: { text: string }) {
  return (
    <div className="px-1 py-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full bg-md-primary flex-shrink-0" />
        <span className="text-xs font-medium text-md-on-surface-variant">You</span>
      </div>
      <p className="text-sm text-md-on-surface leading-relaxed ml-4">{text}</p>
    </div>
  );
}

function ResultFilePreview({ filePath, fileUrl }: { filePath: string; fileUrl: string }) {
  const filename = filePath.split('/').pop() ?? filePath;
  const isVideo = /\.(mp4|mov|webm|avi)$/i.test(filename);
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);

  return (
    <div className="mx-1 my-2 rounded-xl border border-md-outline-variant overflow-hidden bg-md-surface-container">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-md-outline-variant">
        <MaterialIcon name={isVideo ? 'movie' : isImage ? 'image' : 'description'} size={18} className="text-md-primary" />
        <span className="text-sm font-medium text-md-on-surface">{filename}</span>
        <span className="text-[10px] text-md-on-surface-variant bg-md-surface-container-high px-1.5 py-0.5 rounded-full">Result</span>
      </div>
      {isVideo && fileUrl && (
        <video
          src={fileUrl}
          controls
          className="w-full max-h-[300px] bg-black"
          preload="metadata"
        />
      )}
      {isImage && fileUrl && (
        <img src={fileUrl} alt={filename} className="w-full max-h-[300px] object-contain bg-black" />
      )}
      {fileUrl && (
        <div className="flex gap-2 p-2">
          <a
            href={fileUrl}
            download={filename}
            className="flex items-center gap-1 rounded-full bg-md-primary px-3 py-1.5 text-xs font-medium text-md-on-primary hover:brightness-110 transition-colors"
          >
            <MaterialIcon name="download" size={14} />
            Download
          </a>
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({
  toolName,
  content,
  status,
}: {
  toolName: string;
  content: string;
  status: 'running' | 'done' | 'error';
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-md-outline-variant overflow-hidden mx-1 my-1.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2 bg-md-surface-container-high hover:bg-md-surface-container-highest transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-md-on-surface">{toolName}</span>
          {status === 'done' && (
            <MaterialIcon name="check_circle" size={16} className="text-green-500" />
          )}
          {status === 'running' && (
            <MaterialIcon
              name="progress_activity"
              size={16}
              className="animate-spin text-blue-500"
            />
          )}
          {status === 'error' && (
            <MaterialIcon name="error" size={16} className="text-red-500" />
          )}
        </div>
        <MaterialIcon
          name={expanded ? 'expand_less' : 'expand_more'}
          size={20}
          className="text-md-on-surface-variant"
        />
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs font-mono bg-gray-950 text-gray-300 max-h-40 overflow-auto whitespace-pre-wrap break-all">
          {content}
        </pre>
      )}
    </div>
  );
}
