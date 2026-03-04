import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../components/chat/ChatInput.js';
import { ChatView } from '../components/chat/ChatView.js';
import { useAgentsStore } from '../stores/agents.js';
import { useSessionStore } from '../stores/session.js';

describe('advanced ui behaviors', () => {
  beforeEach(() => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [
        {
          id: 's1',
          agentId: 'claude',
          cwd: '/tmp/project',
          workspaceType: 'local',
          status: 'active',
          capabilities: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map(),
      pendingPermissions: []
    });
    useAgentsStore.setState({
      agents: [],
      capabilities: new Map()
    });
  });

  it('falls back to modes selector when configOptions is missing', async () => {
    const capabilities = new Map();
    capabilities.set('s1', {
      modes: [{ name: 'auto' }, { name: 'manual' }]
    });
    useAgentsStore.setState({ agents: [], capabilities });

    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('mode')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'auto' })).toBeInTheDocument();
  });

  it('shows collapsible tool call cards in chat stream', async () => {
    const user = userEvent.setup();
    const messages = new Map();
    messages.set('s1', [
      {
        id: 'm1',
        role: 'assistant',
        content: 'I used a tool',
        toolCalls: [
          {
            name: 'read_file',
            input: { path: 'src/App.tsx' },
            output: { ok: true }
          }
        ],
        timestamp: Date.now()
      }
    ]);
    useSessionStore.setState((state) => ({ ...state, messages }));

    render(<ChatView />);

    expect(screen.getByText('Tool Call: read_file')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show details' }));

    expect(screen.getByText(/src\/App.tsx/)).toBeInTheDocument();
  });
});
