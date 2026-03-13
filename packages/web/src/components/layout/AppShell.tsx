import { useEffect, useState, type ReactNode } from 'react';
import { ChatInput } from '../chat/ChatInput.js';
import { ChatView } from '../chat/ChatView.js';
import { useSessionStore } from '../../stores/session.js';
import { LogViewer } from '../debug/LogViewer.js';
import { ConnectionBar } from './ConnectionBar.js';
import { HomeInput } from './HomeInput.js';
import { HomeView } from './HomeView.js';
import { StatusBar } from './StatusBar.js';
import { TopBar } from './TopBar.js';

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

interface AppShellProps {
  onSend: (prompt: string) => Promise<void>;
  onCancel: () => void;
  onReconnect: () => void;
  onForgetDevice: () => void;
  mode?: 'home' | 'chat';
  homeContent?: ReactNode;
}

export function AppShell({
  onSend,
  onCancel,
  onReconnect,
  onForgetDevice,
  mode = 'chat',
  homeContent
}: AppShellProps) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const selectSession = useSessionStore((state) => state.selectSession);
  const visibleSessions = sessions.filter((session) => session.status !== 'closed');

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };
    viewport.addEventListener('resize', onResize);
    onResize();
    return () => {
      viewport.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="h-dvh bg-app-bg" style={{ paddingBottom: keyboardOffset }}>
      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-x border-slate-200 bg-app-surface">
        {/* Sidebar Overlay */}
        {isSidebarOpen ? (
          <div
            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        {/* Sidebar Drawer */}
        <div
          className={`absolute bottom-0 left-0 top-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-300 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Threads</h2>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  selectSession(null);
                  setIsSidebarOpen(false);
                }}
              >
                New
              </button>
            </div>
            {visibleSessions.length > 0 ? (
              <div className="space-y-2">
                {visibleSessions.map((session) => {
                  const active = session.id === currentSessionId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        active
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        selectSession(session.id);
                        setIsSidebarOpen(false);
                      }}
                    >
                      <div className="text-sm font-medium">{basename(session.cwd)}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{session.agentId}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                No active sessions yet.
              </div>
            )}
          </div>
        </div>

        <TopBar
          onForgetDevice={onForgetDevice}
          onMenuClick={() => setIsSidebarOpen(true)}
          mode={mode}
        />
        <ConnectionBar onReconnect={onReconnect} />

        {mode === 'home' ? (
          homeContent ? (
            <div className="flex-1 overflow-y-auto">{homeContent}</div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <HomeView />
              </div>
              <HomeInput onSend={onSend} />
            </>
          )
        ) : (
          <>
            {currentSessionId ? (
              <div className="border-b border-slate-200 bg-white px-3 py-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setIsLogViewerOpen((open) => !open)}
                >
                  Raw Logs
                </button>
              </div>
            ) : null}
            {isLogViewerOpen && currentSessionId ? <LogViewer sessionId={currentSessionId} /> : null}
            <ChatView />
            <ChatInput onSend={onSend} onCancel={onCancel} />
          </>
        )}

        <StatusBar />
      </div>
    </div>
  );
}
