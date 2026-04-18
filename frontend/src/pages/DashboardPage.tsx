import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { getProjects, createProject, deleteProject, getProjectThumbnailUrl } from '../api/client';
import type { ProjectSummary } from '../types';

export function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleNewProject = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCreating(true);
    setError(null);
    try {
      const name = file.name.replace(/\.[^/.]+$/, '');
      const project = await createProject(file, name);
      navigate(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="relative flex h-full flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <header className="flex h-16 items-center justify-between bg-md-surface px-6">
        <h1 className="text-[22px] font-medium text-md-on-surface">ClipForge</h1>
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <MaterialIcon
              name="search"
              size={20}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant"
            />
            <input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-full bg-md-surface-container-high pl-10 pr-4 text-sm text-md-on-surface placeholder:text-md-on-surface-variant outline-none transition-colors focus:ring-2 focus:ring-md-primary"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm text-md-error"
            style={{
              backgroundColor: 'rgb(179 38 30 / 0.1)',
              borderWidth: '1px',
              borderColor: 'rgb(179 38 30 / 0.3)',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-md-on-surface-variant uppercase tracking-wider">
            Projects
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-md-on-surface-variant">
              <MaterialIcon name="progress_activity" size={32} className="animate-spin mb-2" />
              <p className="text-sm">Loading projects...</p>
            </div>
          ) : filtered.length === 0 && searchQuery === '' && projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-md-on-surface-variant">
              <MaterialIcon name="movie" size={48} className="mb-3 opacity-30" />
              <p className="text-sm">No projects yet</p>
              <p className="mt-1 text-xs opacity-60">Upload a video to get started</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    thumbnailUrl={project.thumbnail_filename ? getProjectThumbnailUrl(project.id) : undefined}
                    onClick={() => navigate(`/project/${project.id}`)}
                    onDelete={() => handleDeleteProject(project.id)}
                  />
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-md-on-surface-variant">
                  <p className="text-sm">No projects found</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={handleNewProject}
        disabled={creating}
        className="absolute bottom-6 right-6 flex h-14 items-center gap-2 rounded-2xl bg-md-primary-container px-4 text-md-on-primary-container shadow-lg hover:shadow-xl transition-all cursor-pointer disabled:opacity-50"
      >
        <MaterialIcon name={creating ? 'progress_activity' : 'add'} size={24} className={creating ? 'animate-spin' : ''} />
        <span className="text-sm font-medium">{creating ? 'Creating...' : 'New Project'}</span>
      </button>
    </div>
  );
}
