import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatView } from '../components/chat/ChatView.js';
import { useSessionStore } from '../stores/session.js';

describe('ChatView', () => {
  beforeEach(() => {
    const messages = new Map();
    messages.set('s1', [
      {
        id: 'm1',
        role: 'assistant',
        content: 'hello from agent',
        timestamp: Date.now()
      },
      {
        id: 'm2',
        role: 'user',
        content: 'hi',
        timestamp: Date.now()
      },
      {
        id: 'm3',
        role: 'permission',
        request: {
          id: 'p1',
          description: 'Allow write',
          action: 'write',
          filePath: '/tmp/project/a.ts'
        },
        timestamp: Date.now()
      }
    ]);

    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages,
      pendingPermissions: []
    });
  });

  it('renders assistant/user messages and permission card', () => {
    render(<ChatView />);

    expect(screen.getByText('hello from agent')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('Permission Required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
  });
});
