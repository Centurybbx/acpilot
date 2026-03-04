import { useAgentsStore } from '../../stores/agents.js';
import { useConnectionStore } from '../../stores/connection.js';
import { useSessionStore } from '../../stores/session.js';

export function StatusBar() {
  const status = useConnectionStore((state) => state.status);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const capabilities = useAgentsStore((state) =>
    currentSessionId ? state.capabilities.get(currentSessionId) : undefined
  );
  const contextFiles = capabilities?.contextFiles ?? 0;

  const connected = status === 'connected';

  return (
    <footer className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <div className="flex items-center gap-1.5">
        <span className={connected ? 'text-green-500' : 'text-red-500'}>●</span>
        <span>Local Engine: {connected ? 'Connected' : status}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-blue-500">●</span>
        <span>Context: {contextFiles} Files</span>
      </div>
    </footer>
  );
}
