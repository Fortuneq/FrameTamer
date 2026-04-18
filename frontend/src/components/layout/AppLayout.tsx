import { Outlet } from 'react-router-dom';
import { NavRail } from './NavRail';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-md-surface">
      <NavRail />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
