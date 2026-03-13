import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewSessionFlow } from '../components/session/NewSessionFlow.js';
import { useAgentsStore } from '../stores/agents.js';
import { useConnectionStore } from '../stores/connection.js';
import { useSessionStore } from '../stores/session.js';

describe('NewSessionFlow', () => {
  beforeEach(() => {
    useAgentsStore.setState({
      agents: [{ id: 'codex', displayName: 'Codex', mvpLevel: 'ga' }],
      capabilities: new Map(),
      fetchAgents: vi.fn().mockResolvedValue(undefined)
    });
    useConnectionStore.setState({
      status: 'connected',
      reconnectProgress: 100,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills the starter prompt from the preset cards', async () => {
    const user = userEvent.setup();

    render(<NewSessionFlow />);

    await user.click(screen.getByRole('button', { name: 'Debug CLI' }));

    expect(
      (screen.getByLabelText('Starter Prompt') as HTMLTextAreaElement).value
    ).toContain('debug this CLI issue');
  });

  it('creates a session and auto-sends the starter prompt', async () => {
    const user = userEvent.setup();
    const createSession = vi.fn().mockImplementation(async () => {
      useSessionStore.setState({ currentSessionId: 's1' });
    });
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn()
    } as unknown as WebSocket;

    useConnectionStore.setState({ socket });
    useSessionStore.setState({
      createSession: createSession as never,
      sendPrompt: sendPrompt as never
    });

    render(<NewSessionFlow />);

    await user.click(screen.getByRole('button', { name: 'Write Docs' }));
    await user.click(screen.getByRole('button', { name: 'Codex ga' }));
    await user.type(screen.getByLabelText('Workspace Path'), '/tmp/project');
    await user.click(screen.getByRole('button', { name: 'Create Session' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith('codex', '/tmp/project', 'local');
    });
    await waitFor(() => {
      expect(socket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"session:subscribe"')
      );
    });
    await waitFor(() => {
      expect(sendPrompt).toHaveBeenCalledWith(expect.stringContaining('documentation'));
    });
  });
});
