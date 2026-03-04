import { create } from 'zustand';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

interface ConnectionStore {
  status: ConnectionStatus;
  reconnectProgress: number;
  lastSeqMap: Map<string, number>;
  disconnectReason: 'network' | 'background' | 'daemon-restart' | null;
  socket: WebSocket | null;
  token: string | null;
  connect: (token: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setReconnectProgress: (progress: number) => void;
  setDisconnectReason: (
    reason: 'network' | 'background' | 'daemon-restart' | null
  ) => void;
  setSocket: (socket: WebSocket | null) => void;
  updateLastSeq: (sessionId: string, seq: number) => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  reconnectProgress: 0,
  lastSeqMap: new Map(),
  disconnectReason: null,
  socket: null,
  token: null,
  connect: (token) =>
    set({
      token,
      status: 'connecting'
    }),
  setStatus: (status) => set({ status }),
  setReconnectProgress: (reconnectProgress) =>
    set({ reconnectProgress: Math.max(0, Math.min(100, reconnectProgress)) }),
  setDisconnectReason: (disconnectReason) => set({ disconnectReason }),
  setSocket: (socket) => set({ socket }),
  updateLastSeq: (sessionId, seq) =>
    set((state) => {
      const next = new Map(state.lastSeqMap);
      const existing = next.get(sessionId) ?? 0;
      if (seq > existing) {
        next.set(sessionId, seq);
      }
      return { lastSeqMap: next };
    }),
  disconnect: () =>
    set({
      status: 'disconnected',
      reconnectProgress: 0,
      disconnectReason: null,
      socket: null,
      token: null
    })
}));
