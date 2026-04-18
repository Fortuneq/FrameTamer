export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audio_codec: string;
  file_size: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  video_filename: string;
  audio_filename: string;
  thumbnail_filename: string;
  video_info: VideoInfo | null;
  transcript: unknown | null;
  timeline: unknown | null;
  error_message: string;
}

/** Backend ProjectSummary shape from GET /api/projects */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  video_filename: string;
  thumbnail_filename: string;
  duration: number;
  has_transcript: boolean;
}

export interface TranscriptWord {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  deleted: boolean;
  speaker_id: string;
}

export interface SpeakerSegment {
  id: string;
  speaker_id: string;
  speaker_name: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

export interface Transcript {
  id: string;
  project_id: string;
  segments: SpeakerSegment[];
  language: string;
  created_at: string;
}

export interface MediaFile {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'template';
  size: number;
  duration?: number;
  thumbnail?: string;
  url: string;
  created_at: string;
}

/** Backend MediaFileInfo shape from GET /api/media */
export interface MediaFileInfo {
  filename: string;
  original_name: string;
  size: number;
  size_human: string;
  media_type: string;
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'captions' | 'ai_gfx';
  label: string;
  color: string;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  track_id: string;
  start: number;
  end: number;
  source_start: number;
  source_end: number;
  label: string;
}

export interface ExportSettings {
  format: string;
  resolution: string;
  frame_rate: string;
  quality: string;
  audio_codec: string;
  normalize_audio: boolean;
  render_ai_overlays: boolean;
  burn_in_captions: boolean;
}

export interface AITemplate {
  id: string;
  name: string;
  type: 'bar_chart' | 'pie_chart' | 'lower_third' | 'data_callout' | 'animated_text' | 'counter';
  thumbnail?: string;
  description: string;
}

export interface UserSettings {
  display_name: string;
  email: string;
  plan: string;
  auto_save: boolean;
  hardware_acceleration: boolean;
  automatic_transcription: boolean;
  default_language: string;
  ai_usage: {
    transcription: number;
    infographics: number;
    text_editing: number;
  };
}

export type SettingsTab = 'general' | 'subscription' | 'ai_models' | 'shortcuts' | 'storage';
