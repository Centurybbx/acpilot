import { Folder, Menu, Settings } from 'lucide-react';
import { useSessionStore } from '../../stores/session.js';

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

interface TopBarProps {
  onForgetDevice: () => void;
  onMenuClick?: () => void;
  mode?: 'home' | 'chat';
}

export function TopBar({ onForgetDevice, onMenuClick, mode = 'chat' }: TopBarProps) {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const currentSession = useSessionStore((state) =>
    state.sessions.find((session) => session.id === currentSessionId)
  );

  const projectName = currentSession ? basename(currentSession.cwd) : 'ac-pilot-core';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur">
      {mode === 'home' ? (
        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          onClick={onMenuClick}
        >
          <Menu size={20} />
        </button>
      ) : (
        <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Folder size={18} />
        </button>
      )}

      <div className="text-center">
        {mode === 'home' ? (
          <div className="text-lg font-bold text-slate-900">ACpilot</div>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-900">{projectName}</div>
            <div className="text-[11px] text-slate-500">MAIN BRANCH</div>
          </>
        )}
      </div>

      <button
        type="button"
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        onClick={onForgetDevice}
      >
        <Settings size={18} />
      </button>
    </header>
  );
}
