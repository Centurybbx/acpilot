import { useEffect, useState } from 'react';
import { ChatInput } from '../chat/ChatInput.js';
import { ChatView } from '../chat/ChatView.js';
import { ConnectionBar } from './ConnectionBar.js';
import { HomeInput } from './HomeInput.js';
import { HomeView } from './HomeView.js';
import { StatusBar } from './StatusBar.js';
import { TopBar } from './TopBar.js';

interface AppShellProps {
  onSend: (prompt: string) => Promise<void>;
  onCancel: () => void;
  onReconnect: () => void;
  onForgetDevice: () => void;
  mode?: 'home' | 'chat';
}

export function AppShell({
  onSend,
  onCancel,
  onReconnect,
  onForgetDevice,
  mode = 'chat'
}: AppShellProps) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
            <h2 className="mb-4 text-lg font-bold">Threads</h2>
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-100 p-2 text-sm font-medium text-slate-700">
                Project A / Repo 1
              </div>
              <div className="rounded-lg p-2 text-sm text-slate-600 hover:bg-slate-50">
                Project B / Repo 2
              </div>
            </div>
          </div>
        </div>

        <TopBar
          onForgetDevice={onForgetDevice}
          onMenuClick={() => setIsSidebarOpen(true)}
          mode={mode}
        />
        <ConnectionBar onReconnect={onReconnect} />

        {mode === 'home' ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <HomeView />
            </div>
            <HomeInput onSend={onSend} />
          </>
        ) : (
          <>
            <ChatView />
            <ChatInput onSend={onSend} onCancel={onCancel} />
          </>
        )}

        <StatusBar />
      </div>
    </div>
  );
}
