export interface Project {
  id: string;
  name: string;
  status: 'created' | 'transcribing' | 'ready' | 'exporting' | 'exported' | 'error';
  videoPath: string;
  videoFilename: string;
  thumbnailPath?: string;
  transcript?: Transcript;
  duration?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  deleted: boolean;
  filler: boolean;
}

export interface AgentTask {
  id: string;
  projectId: string;
  type: 'transcribe' | 'filler_words' | 'smart_edit' | 'export' | 'chapters' | 'custom';
  status: 'running' | 'completed' | 'error';
  prompt: string;
  output: string[];
  result?: unknown;
  startedAt: string;
  completedAt?: string;
  pid?: number;
  errorMessage?: string;
  claudeSessionId?: string; // Claude session ID for --resume
}

export interface MediaFile {
  filename: string;
  originalName: string;
  size: number;
  sizeHuman: string;
  mediaType: string;
}
