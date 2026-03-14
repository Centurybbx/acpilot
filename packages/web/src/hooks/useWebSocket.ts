import { useCallback, useEffect, useRef } from 'react';
import type { WsClientMessage, WsMessage } from '@acpilot/shared';
import { useAgentsStore } from '../stores/agents.js';
import { useConnectionStore } from '../stores/connection.js';
import { useSessionStore } from '../stores/session.js';

const MAX_RETRY_DELAY = 30_000;

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export function useWebSocket(enabled: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectionIdRef = useRef(0);
  const subscribedSessionsRef = useRef(new Set<string>());

  const setStatus = useConnectionStore((state) => state.setStatus);
  const setReconnectProgress = useConnectionStore((state) => state.setReconnectProgress);
  const setSocket = useConnectionStore((state) => state.setSocket);
  const setDisconnectReason = useConnectionStore((state) => state.setDisconnectReason);
  const updateLastSeq = useConnectionStore((state) => state.updateLastSeq);

  const applyWsMessage = useSessionStore((state) => state.applyWsMessage);
  const sessions = useSessionStore((state) => state.sessions);

  const setCapabilities = useAgentsStore((state) => state.setCapabilities);

  const connect = useCallback(
    () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const previousSocket = socketRef.current;
      const connectionId = connectionIdRef.current + 1;
      connectionIdRef.current = connectionId;
      if (
        previousSocket &&
        (previousSocket.readyState === WebSocket.OPEN ||
          previousSocket.readyState === WebSocket.CONNECTING)
      ) {
        previousSocket.close();
      }

      setStatus(reconnectAttemptRef.current === 0 ? 'connecting' : 'reconnecting');
      setReconnectProgress(0);

      const ws = new WebSocket(getWsUrl());
      subscribedSessionsRef.current = new Set();
      socketRef.current = ws;
      setSocket(ws);

      ws.addEventListener('open', () => {
        if (connectionId !== connectionIdRef.current) {
          return;
        }
        reconnectAttemptRef.current = 0;
        setStatus('connected');
        setDisconnectReason(null);
        setReconnectProgress(100);
        if (progressTimerRef.current) {
          window.clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }

        const { lastSeqMap } = useConnectionStore.getState();
        const { sessions } = useSessionStore.getState();
        for (const session of sessions) {
          const lastSeq = lastSeqMap.get(session.id) ?? 0;
          const resume: WsClientMessage = {
            type: 'session:resume',
            sessionId: session.id,
            lastSeq
          };
          ws.send(JSON.stringify(resume));
          subscribedSessionsRef.current.add(session.id);
        }
      });

      ws.addEventListener('message', (event) => {
        if (connectionId !== connectionIdRef.current) {
          return;
        }
        const message = JSON.parse(event.data) as WsMessage;
        const messageSeq =
          'seq' in message && typeof message.seq === 'number' ? message.seq : null;
        if (messageSeq !== null) {
          const currentSeq = useConnectionStore.getState().lastSeqMap.get(message.sessionId) ?? 0;
          if (messageSeq <= currentSeq) {
            return;
          }
          updateLastSeq(message.sessionId, messageSeq);
        }
        if (message.type === 'capabilities:update') {
          setCapabilities(message.sessionId, message.capabilities);
        }
        if (message.type === 'connection:status') {
          setStatus(
            message.status === 'connected'
              ? 'connected'
              : message.status === 'reconnecting'
                ? 'reconnecting'
                : 'disconnected'
          );
          if (message.reason) {
            setDisconnectReason(message.reason);
          }
          if (typeof message.progress === 'number') {
            setReconnectProgress(message.progress);
          }
        }
        applyWsMessage(message);
      });

      ws.addEventListener('close', () => {
        if (connectionId !== connectionIdRef.current) {
          return;
        }
        setStatus('reconnecting');
        setSocket(null);
        socketRef.current = null;
        subscribedSessionsRef.current = new Set();

        const reason =
          document.visibilityState === 'hidden'
            ? 'background'
            : navigator.onLine === false
              ? 'network'
              : 'daemon-restart';
        setDisconnectReason(reason);

        if (progressTimerRef.current) {
          window.clearInterval(progressTimerRef.current);
        }
        progressTimerRef.current = window.setInterval(() => {
          const current = useConnectionStore.getState().reconnectProgress;
          if (current >= 95) {
            return;
          }
          setReconnectProgress(current + 5);
        }, 100);

        reconnectAttemptRef.current += 1;
        const delay = Math.min(2 ** (reconnectAttemptRef.current - 1) * 1000, MAX_RETRY_DELAY);
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      });
    },
    [
      applyWsMessage,
      setCapabilities,
      setDisconnectReason,
      setReconnectProgress,
      setSocket,
      setStatus,
      updateLastSeq
    ]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      connectionIdRef.current += 1;
      setSocket(null);
      socketRef.current?.close();
      socketRef.current = null;
      subscribedSessionsRef.current = new Set();
    };
  }, [connect, enabled]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const session of sessions) {
      if (subscribedSessionsRef.current.has(session.id)) {
        continue;
      }

      socket.send(
        JSON.stringify({
          type: 'session:subscribe',
          sessionId: session.id
        } satisfies WsClientMessage)
      );
      subscribedSessionsRef.current.add(session.id);
    }
  }, [sessions]);

  return {
    send(message: WsClientMessage) {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      socketRef.current.send(JSON.stringify(message));
    },
    reconnectNow() {
      if (!enabled) {
        return;
      }
      connect();
    }
  };
}
