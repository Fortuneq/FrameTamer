import axios from 'axios';
import type { Project, ProjectSummary, Transcript, MediaFileInfo, ExportSettings, UserSettings } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Projects
export async function getProjects(): Promise<ProjectSummary[]> {
  const { data } = await api.get<ProjectSummary[]>('/projects');
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/projects/${id}`);
  return data;
}

export async function createProject(file: File, name: string): Promise<Project> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  const { data } = await api.post<Project>('/projects', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function updateProject(id: string, payload: { name?: string; description?: string }): Promise<Project> {
  const { data } = await api.patch<Project>(`/projects/${id}`, payload);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export function getProjectThumbnailUrl(id: string): string {
  return `/api/projects/${id}/thumbnail`;
}

// Transcripts
export async function getTranscript(projectId: string): Promise<Transcript> {
  const { data } = await api.get<Transcript>(`/projects/${projectId}/transcript`);
  return data;
}

export async function updateTranscript(projectId: string, transcript: Partial<Transcript>): Promise<Transcript> {
  const { data } = await api.put<Transcript>(`/projects/${projectId}/transcript`, transcript);
  return data;
}

// Media
export async function getMediaFiles(): Promise<MediaFileInfo[]> {
  const { data } = await api.get<MediaFileInfo[]>('/media');
  return data;
}

export async function uploadMedia(file: File): Promise<MediaFileInfo> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<MediaFileInfo>('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteMedia(filename: string): Promise<void> {
  await api.delete(`/media/${filename}`);
}

export function getMediaFileUrl(filename: string): string {
  return `/api/media/${filename}`;
}

// Export
export async function startExport(projectId: string, settings: ExportSettings): Promise<{ task_id: string }> {
  const { data } = await api.post<{ task_id: string }>(`/projects/${projectId}/export`, settings);
  return data;
}

// Settings
export async function getSettings(): Promise<UserSettings> {
  const { data } = await api.get<UserSettings>('/settings');
  return data;
}

export async function updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const { data } = await api.put<UserSettings>('/settings', settings);
  return data;
}

// AI
export async function generateInfographic(projectId: string, prompt: string, options: Record<string, string>): Promise<{ code: string; preview_url: string }> {
  const { data } = await api.post<{ code: string; preview_url: string }>(`/projects/${projectId}/ai/infographic`, { prompt, ...options });
  return data;
}

// SSE helper
export function createSSEConnection(url: string, onMessage: (data: unknown) => void, onError?: (err: Event) => void): EventSource {
  const eventSource = new EventSource(`/api${url}`);
  eventSource.onmessage = (event) => {
    try {
      const data: unknown = JSON.parse(event.data as string);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };
  if (onError) {
    eventSource.onerror = onError;
  }
  return eventSource;
}

export default api;
