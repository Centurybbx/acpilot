import { useEffect, useState } from 'react';
import { ChatInput } from '../chat/ChatInput.js';
import { ChatView } from '../chat/ChatView.js';
import { ConnectionBar } from './ConnectionBar.js';
import { StatusBar } from './StatusBar.js';
import { TopBar } from './TopBar.js';

interface AppShellProps {
  onSend: (prompt: string) => Promise<void>;
  onCancel: () => void;
  onReconnect: () => void;
  onForgetDevice: () => void;
}

export function AppShell({
  onSend,
  onCancel,
  onReconnect,
  onForgetDevice
}: AppShellProps) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

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
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-x border-slate-200 bg-app-surface">
        <TopBar onForgetDevice={onForgetDevice} />
        <ConnectionBar onReconnect={onReconnect} />
        <ChatView />
        <ChatInput onSend={onSend} onCancel={onCancel} />
        <StatusBar />
      </div>
    </div>
  );
}
