import { useState, useRef, useCallback } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

interface AttachedImage {
  name: string;
  url: string; // object URL for preview
  file: File;
}

interface QuickAction {
  label: string;
  type: string;
}

const quickActions: QuickAction[] = [
  { label: 'Transcribe', type: 'transcribe' },
  { label: 'Fillers', type: 'filler-words' },
  { label: 'Export', type: 'export' },
];

interface PromptInputProps {
  onSend: (text: string) => void;
  onAttach?: (file: File) => void;
  onQuickAction?: (type: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  runningTypes?: Set<string>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function PromptInput({
  onSend,
  onAttach,
  onQuickAction,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Describe what you want to do...',
  runningTypes,
  textareaRef: externalRef,
}: PromptInputProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImageFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setImages(prev => [...prev, { name: file.name, url, file }]);
    onAttach?.(file);
  }, [onAttach]);

  const removeImage = useCallback((idx: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addImageFile(file);
        return;
      }
    }
  }, [addImageFile]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed);
    setText('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, images, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        addImageFile(file);
      } else {
        onAttach?.(file);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-md-outline-variant p-3">
      {/* Image preview strip */}
      {images.length > 0 && (
        <div className="flex gap-2 px-1">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.url}
                alt={img.name}
                className="h-16 w-16 rounded-lg object-cover border border-md-outline-variant"
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-md-error text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <MaterialIcon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input row */}
      <div className="flex items-end gap-2 rounded-xl bg-md-surface-container border border-md-outline-variant px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant outline-none"
          style={{ maxHeight: '96px' }}
        />
        {/* Attach button */}
        <button
          onClick={handleAttachClick}
          disabled={disabled}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-md-on-surface-variant hover:bg-md-surface-container-high transition-colors disabled:opacity-30 cursor-pointer"
          title="Attach file"
        >
          <MaterialIcon name="attach_file" size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Stop / Send button */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-md-error text-md-on-error transition-colors hover:brightness-110 cursor-pointer"
            title="Остановить агента"
          >
            <MaterialIcon name="stop" size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-md-primary text-md-on-primary transition-colors hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <MaterialIcon name="arrow_upward" size={18} />
          </button>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-3 px-1">
        {/* Model label */}
        <span className="text-xs font-medium text-md-on-surface-variant flex items-center gap-1">
          Claude Code
          <MaterialIcon name="expand_more" size={14} className="text-md-on-surface-variant" />
        </span>

        {/* Bypass indicator */}
        <span className="text-xs text-md-on-surface-variant flex items-center gap-1">
          <MaterialIcon name="bolt" size={14} className="text-yellow-500" />
          bypass
        </span>

        {/* Separator */}
        <div className="h-3 w-px bg-md-outline-variant" />

        {/* Quick action pills */}
        {quickActions.map((action) => {
          const isRunning = runningTypes?.has(action.type);
          return (
            <button
              key={action.type}
              onClick={() => onQuickAction?.(action.type)}
              disabled={disabled || isRunning}
              className="flex items-center gap-1 rounded-full border border-md-outline-variant px-2.5 py-0.5 text-xs font-medium text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRunning && (
                <MaterialIcon name="progress_activity" size={12} className="animate-spin" />
              )}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
