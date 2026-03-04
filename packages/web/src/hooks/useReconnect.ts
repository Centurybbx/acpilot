import { useConnectionStore } from '../stores/connection.js';

export function useReconnect() {
  const status = useConnectionStore((state) => state.status);
  const progress = useConnectionStore((state) => state.reconnectProgress);

  return {
    status,
    progress,
    isRecovering: status === 'reconnecting'
  };
}
