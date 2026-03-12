import { useEffect, useMemo, useState } from 'react';
import type { AuthState } from '@acpilot/shared';
import { AppShell } from './components/layout/AppShell.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import {
  completePairing,
  getAuthState,
  logout,
  startPairing
} from './lib/api.js';
import { useConnectionStore } from './stores/connection.js';
import { useSessionStore } from './stores/session.js';

function LoadingGate() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold text-slate-900">Connect to Local Daemon</h1>
      <p className="text-center text-sm text-slate-600">Checking trusted device status...</p>
    </div>
  );
}

interface PairingGateProps {
  authState: Exclude<AuthState, { paired: true }>;
  onPaired: () => Promise<void>;
}

function PairingGate({ authState, onPaired }: PairingGateProps) {
  const [deviceName, setDeviceName] = useState('My Phone');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBootstrap = authState.trustedDeviceCount === 0;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col justify-center gap-4 px-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">
          {isBootstrap ? 'Pair This Device' : 'Request Pairing Approval'}
        </h1>
        <p className="text-sm text-slate-600">
          {isBootstrap
            ? 'Generate a pairing request, then enter the 6-digit code shown in the daemon terminal to trust this browser.'
            : 'This daemon already has trusted devices. Generate a pairing request, then enter the 6-digit code shown in the daemon terminal to add or re-pair this browser.'}
        </p>
      </div>

      <label className="grid gap-1 text-sm text-slate-700">
        <span>Device Name</span>
        <input
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="My Phone"
        />
      </label>

      {challengeId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
            Check Your Terminal
          </div>
          <p className="mt-2 text-sm text-amber-900">
            A 6-digit pairing code has been printed in the daemon&apos;s terminal. Enter it below to trust this browser.
          </p>
        </div>
      ) : null}

      {challengeId ? (
        <label className="grid gap-1 text-sm text-slate-700">
          <span>Pairing Code</span>
          <input
            value={inputCode}
            onChange={(event) => setInputCode(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tracking-[0.2em]"
            placeholder="123456"
            inputMode="numeric"
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!challengeId ? (
        <button
          type="button"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              const challenge = await startPairing(deviceName.trim() || undefined);
              setChallengeId(challenge.challengeId);
              setInputCode('');
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setSubmitting(false);
            }
          }}
          className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting
            ? 'Generating...'
            : 'Generate Pairing Code'}
        </button>
      ) : (
        <button
          type="button"
          disabled={!inputCode.trim() || submitting}
          onClick={async () => {
            if (!challengeId) {
              return;
            }
            setSubmitting(true);
            setError(null);
            try {
              await completePairing({
                challengeId,
                code: inputCode.trim(),
                deviceName: deviceName.trim() || undefined
              });
              await onPaired();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setSubmitting(false);
            }
          }}
          className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Pairing...' : 'Trust This Device'}
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [restoredToastVisible, setRestoredToastVisible] = useState(false);

  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const cancelPrompt = useSessionStore((state) => state.cancelPrompt);

  const { reconnectNow } = useWebSocket(Boolean(authState?.paired));
  const connectionStatus = useConnectionStore((state) => state.status);

  async function forgetCurrentDevice() {
    await logout();
    useSessionStore.setState({ currentSessionId: null, sessions: [] });
    await refreshAuthState();
  }

  async function refreshAuthState() {
    setAuthError(null);
    try {
      const nextState = await getAuthState();
      setAuthState(nextState);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  useEffect(() => {
    void refreshAuthState();
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'connected' || !authState?.paired) {
      return;
    }
    setRestoredToastVisible(true);
    const timer = window.setTimeout(() => {
      setRestoredToastVisible(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [authState?.paired, connectionStatus]);

  const content = useMemo(() => {
    if (authError) {
      return (
        <div className="mx-auto flex h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-4">
          <p className="text-center text-sm text-red-600">{authError}</p>
          <button
            type="button"
            className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              void refreshAuthState();
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    if (!authState) {
      return <LoadingGate />;
    }

    if (!authState.paired) {
      return (
        <PairingGate
          authState={authState}
          onPaired={async () => {
            await refreshAuthState();
          }}
        />
      );
    }

    const currentSession = sessions.find((session) => session.id === currentSessionId);

    if (!currentSessionId) {
      return (
        <AppShell
          mode="home"
          onReconnect={reconnectNow}
          onForgetDevice={() => {
            void forgetCurrentDevice();
          }}
          onSend={async () => {
            // Placeholder: This should create a session using selected CLI/Model
            console.log('Home input sent - session creation logic needed');
          }}
          onCancel={() => {}}
        />
      );
    }

    if (currentSession?.status === 'closed' || currentSession?.status === 'error') {
      return (
        <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col justify-center gap-3 px-4">
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
            Session expired — Start a new session
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                useSessionStore.setState({ currentSessionId: null });
              }}
            >
              Start New Session
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700"
              onClick={async () => {
                await forgetCurrentDevice();
              }}
            >
              Forget Device
            </button>
          </div>
        </div>
      );
    }

    return (
      <AppShell
        onReconnect={reconnectNow}
        onForgetDevice={() => {
          void forgetCurrentDevice();
        }}
        onSend={async (prompt) => {
          await sendPrompt(prompt);
        }}
        onCancel={() => {
          void cancelPrompt();
        }}
      />
    );
  }, [
    authError,
    authState,
    cancelPrompt,
    currentSessionId,
    forgetCurrentDevice,
    reconnectNow,
    sendPrompt,
    sessions
  ]);

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
