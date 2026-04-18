import { NavLink, useLocation } from 'react-router-dom';
import { MaterialIcon } from '../ui/MaterialIcon';
import clsx from 'clsx';

function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

export function NavRail() {
  const location = useLocation();
  const projectId = extractProjectId(location.pathname);

  return (
    <aside className="flex h-screen w-20 flex-shrink-0 flex-col items-center bg-md-surface-container py-3 gap-2">
      {/* Logo / Home */}
      <NavLink
        to="/"
        className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-md-primary-container text-md-on-primary-container transition-all hover:shadow-md"
      >
        <MaterialIcon name="movie_edit" size={24} />
      </NavLink>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-auto">
        {/* Dashboard */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-center transition-all w-[72px]',
              isActive
                ? 'text-md-on-secondary-container'
                : 'text-md-on-surface-variant hover:bg-md-surface-container-high',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={clsx(
                  'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                  isActive && 'bg-md-secondary-container',
                )}
              >
                <MaterialIcon name="home" size={24} filled={isActive} />
              </span>
              <span className="text-[11px] font-medium leading-tight">Home</span>
            </>
          )}
        </NavLink>

        {/* Active project indicator */}
        {projectId && (
          <>
            <div className="my-1 h-px w-8 bg-md-outline-variant" />
            <NavLink
              to={`/project/${projectId}`}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-center transition-all w-[72px]',
                  isActive
                    ? 'text-md-on-secondary-container'
                    : 'text-md-on-surface-variant hover:bg-md-surface-container-high',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-md-secondary-container',
                    )}
                  >
                    <MaterialIcon name="smart_display" size={24} filled={isActive} />
                  </span>
                  <span className="text-[11px] font-medium leading-tight">Editor</span>
                </>
              )}
            </NavLink>
          </>
        )}
      </nav>

      {/* Bottom: Settings */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          clsx(
            'flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 transition-all',
            isActive
              ? 'text-md-on-secondary-container'
              : 'text-md-on-surface-variant hover:bg-md-surface-container-high',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={clsx(
                'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                isActive && 'bg-md-secondary-container',
              )}
            >
              <MaterialIcon name="settings" size={24} filled={isActive} />
            </span>
            <span className="text-[11px] font-medium leading-tight">Settings</span>
          </>
        )}
      </NavLink>
    </aside>
  );
}
