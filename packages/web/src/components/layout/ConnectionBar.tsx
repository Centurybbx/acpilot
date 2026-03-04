import { useConnectionStore } from '../../stores/connection.js';

interface ConnectionBarProps {
  onReconnect?: () => void;
}

export function ConnectionBar({ onReconnect }: ConnectionBarProps) {
  const status = useConnectionStore((state) => state.status);
  const progress = useConnectionStore((state) => state.reconnectProgress);
  const reason = useConnectionStore((state) => state.disconnectReason);

  if (status === 'connected') {
    return null;
  }

  if (status === 'disconnected') {
    return (
      <div className="flex items-center justify-between bg-red-50 px-3 py-2 text-xs text-red-700">
        <span>Disconnected</span>
        <button type="button" className="rounded border border-red-200 px-2 py-0.5" onClick={onReconnect}>
          Reconnect
        </button>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 px-3 py-2 text-xs text-blue-700">
      <div>
        Reconnecting to local daemon... {Math.round(progress)}%
        {reason ? ` (${reason})` : ''}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-blue-100">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>
    </div>
  );
}
