import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { VideoPreview } from '../components/workspace/VideoPreview';
import { TranscriptPanel } from '../components/workspace/TranscriptPanel';
import { AgentTerminal } from '../components/workspace/AgentTerminal';
import { OutputsPanel } from '../components/workspace/OutputsPanel';
import { FrameStrip } from '../components/workspace/FrameStrip';
import { useAgentTasks } from '../hooks/useAgentTasks';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import type { StreamStatus } from '../hooks/useAgentStream';
import type { Project } from '../types';

export function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptRefreshKey, setTranscriptRefreshKey] = useState(0);
  const [outputsRefreshKey, setOutputsRefreshKey] = useState(0);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | undefined>(undefined);
  const [seekToTime, setSeekToTime] = useState<number | undefined>(undefined);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [chatWidth, setChatWidth] = useState(360);
  const [frameInterval, setFrameInterval] = useState(30);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [showFrameMenu, setShowFrameMenu] = useState(false);
  const frameMenuRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const chatDragging = useRef(false);

  const {
    tasks, activeTaskId, setActiveTaskId, startTask, continueActiveTask,
    createEmptyChat, updateTaskLines, updateTaskStatus, closeTask, killTask,
  } = useAgentTasks(projectId);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(d => { if (!cancelled) setProject(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/frames`)
      .then(r => r.json())
      .then((f: unknown[]) => {
        if (f.length === 0) {
          fetch(`/api/projects/${projectId}/extract-frames`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interval: 30 }),
          }).catch(() => {});
        }
      }).catch(() => {});
  }, [projectId]);

  const handleStartTask = useCallback(
    async (type: string, endpoint: string, body?: Record<string, unknown>) => {
      if (!projectId) return null;
      return startTask(projectId, type, endpoint, body);
    }, [projectId, startTask],
  );

  const handleTaskComplete = useCallback(() => {
    setTranscriptRefreshKey(k => k + 1);
    setOutputsRefreshKey(k => k + 1);
  }, []);

  const handleExtractFrames = useCallback(async (interval: number) => {
    if (!projectId) return;
    setFrameInterval(interval);
    setShowFrameMenu(false);
    setExtractingFrames(true);
    try {
      await fetch(`/api/projects/${projectId}/extract-frames`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
    } finally {
      setExtractingFrames(false);
    }
  }, [projectId]);

  // Close frame menu on outside click
  useEffect(() => {
    if (!showFrameMenu) return;
    const handler = (e: MouseEvent) => {
      if (frameMenuRef.current && !frameMenuRef.current.contains(e.target as Node)) {
        setShowFrameMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFrameMenu]);

  const currentVideoUrl = activeVideoUrl;
  const projectVideoUrl = project?.video_filename ? `/api/projects/${projectId}/video` : undefined;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-md-on-surface-variant">
        <MaterialIcon name="progress_activity" size={32} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-md-error">
        <MaterialIcon name="error" size={32} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hidden import input */}
      <input
        ref={importRef}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files;
          if (!files || !projectId) return;
          for (const file of files) {
            const fd = new FormData();
            fd.append('file', file);
            await fetch(`/api/projects/${projectId}/import`, { method: 'POST', body: fd }).catch(() => {});
          }
          setOutputsRefreshKey(k => k + 1);
          if (importRef.current) importRef.current.value = '';
        }}
      />

      {/* Header */}
      <div className="flex items-center h-10 px-4 border-b border-md-outline-variant bg-md-surface gap-2 flex-shrink-0">
        <MaterialIcon name="movie" size={18} className="text-md-on-surface-variant" />
        <span className="text-sm font-medium text-md-on-surface truncate flex-1">
          {project?.name || 'Untitled'}
        </span>
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-1 px-2 h-7 rounded-full text-xs font-medium bg-md-secondary-container text-md-on-secondary-container hover:brightness-95 transition-colors cursor-pointer"
          title="Import media"
        >
          <MaterialIcon name="add" size={14} />
          Import
        </button>

        {/* Frame extraction button */}
        <div className="relative" ref={frameMenuRef}>
          <button
            onClick={() => setShowFrameMenu(v => !v)}
            disabled={extractingFrames}
            className="flex items-center gap-1 px-2 h-7 rounded-full text-xs font-medium bg-md-surface-container-high text-md-on-surface-variant hover:bg-md-surface-container hover:text-md-on-surface transition-colors cursor-pointer disabled:opacity-50"
            title="Извлечь кадры для анализа"
          >
            {extractingFrames
              ? <MaterialIcon name="progress_activity" size={14} className="animate-spin" />
              : <MaterialIcon name="photo_library" size={14} />
            }
            {extractingFrames ? 'Кадры...' : `Кадры / ${frameInterval}с`}
            {!extractingFrames && <MaterialIcon name="expand_more" size={12} />}
          </button>
          {showFrameMenu && (
            <div className="absolute right-0 top-8 z-50 min-w-[130px] rounded-lg border border-md-outline-variant bg-md-surface shadow-lg overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] font-medium text-md-on-surface-variant uppercase tracking-wide border-b border-md-outline-variant">
                Интервал между кадрами
              </div>
              {[1, 5, 10, 30].map(s => (
                <button
                  key={s}
                  onClick={() => handleExtractFrames(s)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-md-surface-container transition-colors cursor-pointer ${frameInterval === s ? 'text-md-primary font-medium' : 'text-md-on-surface'}`}
                >
                  <span>каждые {s}с</span>
                  {frameInterval === s && <MaterialIcon name="check" size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${showChat ? 'bg-md-primary-container text-md-on-primary-container' : 'text-md-on-surface-variant hover:bg-md-surface-container-high'}`}
          title="Toggle chat"
        >
          <MaterialIcon name="chat" size={18} />
        </button>
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${showTranscript ? 'bg-md-primary-container text-md-on-primary-container' : 'text-md-on-surface-variant hover:bg-md-surface-container-high'}`}
          title="Toggle transcript"
        >
          <MaterialIcon name="description" size={18} />
        </button>
      </div>

      {/* Body: Chat (optional) | Video column | Transcript (optional) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Agent Chat panel — resizable */}
        {showChat && (
          <>
            <div
              className="flex-shrink-0 bg-md-surface flex flex-col min-h-0 overflow-hidden"
              style={{ width: chatWidth }}
            >
              <AgentTerminal
                projectId={projectId!}
                tasks={tasks}
                activeTaskId={activeTaskId}
                onSetActiveTask={setActiveTaskId}
                onCloseTask={closeTask}
                onStartTask={handleStartTask}
                onContinueTask={continueActiveTask}
                onKillTask={killTask}
                onNewChat={createEmptyChat}
                onUpdateTaskLines={updateTaskLines}
                onUpdateTaskStatus={(id: string, s: StreamStatus) => updateTaskStatus(id, s)}
                onTaskComplete={handleTaskComplete}
              />
            </div>
            {/* Resize handle */}
            <div
              className="w-1 flex-shrink-0 cursor-col-resize bg-md-outline-variant/50 hover:bg-md-primary/40 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                chatDragging.current = true;
                const startX = e.clientX;
                const startW = chatWidth;
                const onMove = (ev: MouseEvent) => {
                  if (!chatDragging.current) return;
                  const newW = Math.max(280, Math.min(600, startW + ev.clientX - startX));
                  setChatWidth(newW);
                };
                const onUp = () => {
                  chatDragging.current = false;
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
          </>
        )}

        {/* Center: Video + frames + outputs */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Video */}
          <div className="flex-1 min-h-0 bg-black">
            <VideoPreview videoUrl={currentVideoUrl} className="h-full w-full" seekToTime={seekToTime} />
          </div>

          {/* Frame strip */}
          {projectId && (
            <FrameStrip projectId={projectId} onSeekTo={t => setSeekToTime(t)} />
          )}

          {/* Outputs */}
          {projectId && (
            <OutputsPanel
              projectId={projectId}
              refreshKey={outputsRefreshKey}
              activeVideoUrl={currentVideoUrl}
              projectVideoUrl={projectVideoUrl}
              onSelectVideo={setActiveVideoUrl}
              onProjectVideoDeleted={() => {
                setProject(p => p ? { ...p, video_filename: '' } : p);
                setActiveVideoUrl(undefined);
              }}
            />
          )}
        </div>

        {/* Right: Transcript panel */}
        {showTranscript && (
          <div className="w-[320px] flex-shrink-0 border-l border-md-outline-variant bg-md-surface overflow-auto">
            <TranscriptPanel
              key={transcriptRefreshKey}
              projectId={projectId}
              refreshKey={transcriptRefreshKey}
              onClose={() => setShowTranscript(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
