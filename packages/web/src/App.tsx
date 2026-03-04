import { useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/layout/AppShell.js';
import { NewSessionFlow } from './components/session/NewSessionFlow.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { refreshToken as refreshTokenApi, verifyToken } from './lib/api.js';
import { useConnectionStore } from './stores/connection.js';
import { useSessionStore } from './stores/session.js';

function decodeExpiry(token: string): number | null {
  try {
    const [payload] = token.split('.');
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold text-slate-900">Connect to Local Daemon</h1>
      <p className="text-center text-sm text-slate-600">
        Paste the initial token printed by daemon startup logs.
      </p>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Bearer token"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={!value.trim() || checking}
        onClick={async () => {
          setChecking(true);
          setError(null);
          try {
            await onSubmit(value.trim());
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setChecking(false);
          }
        }}
        className="w-full rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {checking ? 'Checking...' : 'Connect'}
      </button>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('acpilot-token'));
  const [restoredToastVisible, setRestoredToastVisible] = useState(false);

  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const cancelPrompt = useSessionStore((state) => state.cancelPrompt);

  const { reconnectNow } = useWebSocket(token);
  const connectionStatus = useConnectionStore((state) => state.status);

  useEffect(() => {
    if (connectionStatus !== 'connected') {
      return;
    }
    setRestoredToastVisible(true);
    const timer = window.setTimeout(() => {
      setRestoredToastVisible(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [connectionStatus]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const expiresAt = decodeExpiry(token);
    if (!expiresAt) {
      return;
    }
    const refreshAt = Math.max(1_000, expiresAt - 5 * 60 * 1000 - Date.now());
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await refreshTokenApi(token);
        sessionStorage.setItem('acpilot-token', refreshed.token);
        setToken(refreshed.token);
      } catch {
        sessionStorage.removeItem('acpilot-token');
        setToken(null);
      }
    }, refreshAt);

    return () => {
      window.clearTimeout(timer);
    };
  }, [token]);

  const content = useMemo(() => {
    if (!token) {
      return (
        <TokenGate
          onSubmit={async (nextToken) => {
            const verified = await verifyToken(nextToken);
            if (!verified.valid) {
              throw new Error(verified.expired ? 'Token expired' : 'Token invalid');
            }
            sessionStorage.setItem('acpilot-token', nextToken);
            setToken(nextToken);
          }}
        />
      );
    }

    const currentSession = sessions.find((session) => session.id === currentSessionId);

    if (!currentSessionId) {
      return <NewSessionFlow token={token} />;
    }

    if (currentSession?.status === 'closed' || currentSession?.status === 'error') {
      return (
        <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col justify-center gap-3 px-4">
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
            Session expired — Start a new session
          </div>
          <button
            type="button"
            className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              useSessionStore.setState({ currentSessionId: null });
            }}
          >
            Start New Session
          </button>
        </div>
      );
    }

    return (
      <AppShell
        onReconnect={reconnectNow}
        onSend={async (prompt) => {
          await sendPrompt(prompt, token);
        }}
        onCancel={() => {
          void cancelPrompt(token);
        }}
      />
    );
  }, [cancelPrompt, currentSessionId, reconnectNow, sendPrompt, sessions, token]);

  return (
    <>
      {content}
      {restoredToastVisible ? (
        <div className="fixed right-3 top-16 rounded-lg bg-green-100 px-3 py-2 text-xs text-green-700 shadow">
          Session restored
        </div>
      ) : null}
    </>
  );
}
