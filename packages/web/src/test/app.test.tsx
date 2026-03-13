import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.js';
import * as api from '../lib/api.js';
import { useAgentsStore } from '../stores/agents.js';
import { useConnectionStore } from '../stores/connection.js';
import { useSessionStore } from '../stores/session.js';

const reconnectNow = vi.fn();

vi.mock('../hooks/useWebSocket.js', () => ({
  useWebSocket: vi.fn(() => ({ reconnectNow }))
}));

vi.mock('../lib/api.js', () => ({
  getAuthState: vi.fn(async () => ({
    paired: true,
    bootstrapRequired: false,
    trustedDeviceCount: 1,
    device: {
      id: 'device-1',
      name: 'Phone',
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    }
  })),
  startPairing: vi.fn(),
  completePairing: vi.fn(),
  logout: vi.fn(async () => ({ loggedOut: true })),
  fetchSessions: vi.fn(async () => []),
  fetchAgents: vi.fn(async () => [{ id: 'codex', displayName: 'Codex', mvpLevel: 'ga' }])
}));

describe('App empty state', () => {
  beforeEach(() => {
    reconnectNow.mockReset();
    useAgentsStore.setState({ agents: [], capabilities: new Map() });
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectProgress: 0,
      lastSeqMap: new Map(),
      disconnectReason: null,
      socket: null,
      token: null
    });
    useSessionStore.setState({
      currentSessionId: null,
      sessions: [],
      messages: new Map(),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });
  });

  it('renders the real new session flow when paired with no selected session', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument();
    });

    expect(screen.getByText('Workspace Path')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ask ACpilot anything...')).not.toBeInTheDocument();
  });

  it('shows a real restore toast only after a session restored event', async () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [
        {
          id: 's1',
          agentId: 'codex',
          cwd: '/tmp/project',
          workspaceType: 'local',
          status: 'active',
          capabilities: {},
          config: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });
    useConnectionStore.setState((state) => ({ ...state, status: 'connected' }));

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Session restored')).not.toBeInTheDocument();
    });

    useSessionStore.getState().applyWsMessage({
      type: 'session:restored',
      sessionId: 's1'
    });

    await waitFor(() => {
      expect(screen.getByText('Session restored')).toBeInTheDocument();
    });
  });

  it('hydrates sessions from the daemon after auth refresh', async () => {
    const fetchSessions = vi.spyOn(api, 'fetchSessions');
    fetchSessions.mockResolvedValueOnce([
      {
        id: 's9',
        agentId: 'codex',
        cwd: '/tmp/hydrated-project',
        workspaceType: 'local',
        status: 'active',
        capabilities: {},
        config: {},
        eventSeq: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      }
    ]);

    render(<App />);

    await waitFor(() => {
      expect(fetchSessions).toHaveBeenCalled();
    });
    expect(useSessionStore.getState().sessions[0]?.id).toBe('s9');
  });
});
