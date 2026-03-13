import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/layout/AppShell.js';
import { useConnectionStore } from '../stores/connection.js';
import { useSessionStore } from '../stores/session.js';

describe('AppShell sidebar', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'connected',
      reconnectProgress: 100,
      lastSeqMap: new Map(),
      disconnectReason: null,
      socket: null,
      token: null
    });
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [
        {
          id: 's1',
          agentId: 'codex',
          cwd: '/tmp/project-a',
          workspaceType: 'local',
          status: 'active',
          capabilities: {},
          config: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        },
        {
          id: 's2',
          agentId: 'claude',
          cwd: '/tmp/project-b',
          workspaceType: 'local',
          status: 'active',
          capabilities: {},
          config: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map([
        ['s1', []],
        ['s2', []]
      ]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });
  });

  it('renders real sessions in the sidebar and switches current session', async () => {
    const user = userEvent.setup();

    render(
      <AppShell
        mode="home"
        onSend={vi.fn()}
        onCancel={vi.fn()}
        onReconnect={vi.fn()}
        onForgetDevice={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button')[0]!);

    expect(screen.getByText('project-a')).toBeInTheDocument();
    expect(screen.getByText('project-b')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'project-b claude' }));

    expect(useSessionStore.getState().currentSessionId).toBe('s2');
  });

  it('opens the raw logs panel for the current session', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: ['stderr line 1'] })
      })
    );

    render(
      <AppShell
        mode="chat"
        onSend={vi.fn()}
        onCancel={vi.fn()}
        onReconnect={vi.fn()}
        onForgetDevice={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Raw Logs' }));

    expect(await screen.findByText('Raw ACP Logs')).toBeInTheDocument();
    expect(screen.getByText('stderr line 1')).toBeInTheDocument();
  });
});
