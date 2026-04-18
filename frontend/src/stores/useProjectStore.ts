import { createContext, useContext } from 'react';
import type { Project } from '../types';

interface ProjectContextValue {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
}

export const ProjectContext = createContext<ProjectContextValue>({
  currentProject: null,
  setCurrentProject: () => {},
});

export function useProjectContext() {
  return useContext(ProjectContext);
}
