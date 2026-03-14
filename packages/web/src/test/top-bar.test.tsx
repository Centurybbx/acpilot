import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../components/layout/TopBar.js';
import { useSessionStore } from '../stores/session.js';

describe('TopBar', () => {
  beforeEach(() => {
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
  });

  it('renders the real branch name when session metadata includes it', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: [
        {
          ...state.sessions[0]!,
          branch: 'feat/real-session-entry-tdd'
        }
      ]
    }));

    render(<TopBar mode="chat" onForgetDevice={vi.fn()} onMenuClick={vi.fn()} />);

    expect(screen.getByText('project')).toBeInTheDocument();
    expect(screen.getByText('feat/real-session-entry-tdd')).toBeInTheDocument();
    expect(screen.queryByText('MAIN BRANCH')).not.toBeInTheDocument();
  });

  it('exposes accessible labels for icon-only actions', () => {
    render(<TopBar mode="chat" onForgetDevice={vi.fn()} onMenuClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forget device' })).toBeInTheDocument();
  });

  it('hides branch fallback text when the session has no branch metadata', () => {
    render(<TopBar mode="chat" onForgetDevice={vi.fn()} onMenuClick={vi.fn()} />);

    expect(screen.getByText('project')).toBeInTheDocument();
    expect(screen.queryByText('MAIN BRANCH')).not.toBeInTheDocument();
    expect(screen.queryByText('ac-pilot-core')).not.toBeInTheDocument();
  });
});
