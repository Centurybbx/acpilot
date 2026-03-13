import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../components/chat/ChatInput.js';
import { useAgentsStore } from '../stores/agents.js';
import { useSessionStore } from '../stores/session.js';

describe('ChatInput', () => {
  beforeEach(() => {
    const capabilities = new Map();
    capabilities.set('s1', {
      commands: [{ name: 'explain' }, { name: 'fix' }],
      configOptions: [{ name: 'model', type: 'enum', values: ['gpt-5', 'gpt-4.1'] }]
    });

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
          config: { model: 'gpt-5' },
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map(),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });
    useAgentsStore.setState({ agents: [], capabilities });
  });

  it('fills slash command and submits prompt', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);

    render(<ChatInput onSend={onSend} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '/ explain' }));
    const input = screen.getByPlaceholderText('Ask ACpilot anything...');
    expect(input).toHaveValue('/explain');

    await user.type(input, ' hello');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('/explain hello');
  });

  it('writes dynamic control changes into the current session config', async () => {
    const user = userEvent.setup();

    render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} />);

    const modelSelect = screen.getAllByRole('combobox')[0];
    expect(modelSelect).toHaveValue('gpt-5');

    await user.selectOptions(modelSelect, 'gpt-4.1');

    expect(useSessionStore.getState().sessions[0]?.config).toEqual({ model: 'gpt-4.1' });
  });
});
