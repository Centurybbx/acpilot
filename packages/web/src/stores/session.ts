import type {
  PermissionRequest,
  SessionConfig,
  Session,
  ToolCallInfo,
  WsMessage
} from '@acpilot/shared';
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  cancelPrompt,
  createSession,
  sendPrompt
} from '../lib/api.js';

export type ChatMessage =
  | {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      isStreaming?: boolean;
      toolCalls?: ToolCallInfo[];
      timestamp: number;
    }
  | {
      id: string;
      role: 'permission';
      request: PermissionRequest;
      response?: 'allowed' | 'denied';
      timestamp: number;
    };

interface SessionStore {
  currentSessionId: string | null;
  sessions: Session[];
  messages: Map<string, ChatMessage[]>;
  pendingPermissions: PermissionRequest[];

  createSession: (
    agentId: string,
    cwd: string,
    workspaceType: 'local' | 'worktree'
  ) => Promise<void>;
  sendPrompt: (prompt: string) => Promise<void>;
  cancelPrompt: () => Promise<void>;
  updateSessionConfig: (config: SessionConfig) => void;
  respondPermission: (
    requestId: string,
    approved: boolean
  ) => void;

  appendUserMessage: (sessionId: string, content: string) => void;
  appendAgentMessage: (
    sessionId: string,
    content: string,
    isStreaming?: boolean,
    toolCalls?: ToolCallInfo[]
  ) => void;
  appendPermission: (sessionId: string, request: PermissionRequest) => void;
  updateSessionStatus: (sessionId: string, status: Session['status']) => void;
  applyWsMessage: (message: WsMessage) => void;
}

function withMessage(
  state: SessionStore,
  sessionId: string,
  updater: (items: ChatMessage[]) => ChatMessage[]
): Map<string, ChatMessage[]> {
  const next = new Map(state.messages);
  const items = next.get(sessionId) ?? [];
  next.set(sessionId, updater(items));
  return next;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSessionId: null,
  sessions: [],
  messages: new Map(),
  pendingPermissions: [],

  createSession: async (agentId, cwd, workspaceType) => {
    const session = await createSession({ agentId, cwd, workspaceType });
    set((state) => {
      const nextMessages = new Map(state.messages);
      if (!nextMessages.has(session.id)) {
        nextMessages.set(session.id, []);
      }
      return {
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        messages: nextMessages
      };
    });
  },

  sendPrompt: async (prompt) => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) {
      throw new Error('No active session');
    }
    const session = sessions.find((item) => item.id === currentSessionId);
    get().appendUserMessage(currentSessionId, prompt);
    await sendPrompt(currentSessionId, prompt, session?.config ?? {});
  },

  cancelPrompt: async () => {
    const { currentSessionId } = get();
    if (!currentSessionId) {
      return;
    }
    await cancelPrompt(currentSessionId);
  },

  updateSessionConfig: (config) => {
    const { currentSessionId } = get();
    if (!currentSessionId) {
      return;
    }
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === currentSessionId
          ? {
              ...session,
              config: {
                ...session.config,
                ...config
              }
            }
          : session
      )
    }));
  },

  respondPermission: (requestId, approved) => {
    set((state) => {
      const nextMessages = new Map<string, ChatMessage[]>();
      for (const [sessionId, items] of state.messages) {
        nextMessages.set(
          sessionId,
          items.map((item) => {
            if (item.role !== 'permission' || item.request.id !== requestId) {
              return item;
            }
            return {
              ...item,
              response: approved ? 'allowed' : 'denied'
            };
          })
        );
      }
      return {
        messages: nextMessages,
        pendingPermissions: state.pendingPermissions.filter((request) => request.id !== requestId)
      };
    });
  },

  appendUserMessage: (sessionId, content) => {
    set((state) => ({
      messages: withMessage(state, sessionId, (items) => [
        ...items,
        {
          id: nanoid(),
          role: 'user',
          content,
          timestamp: Date.now()
        }
      ])
    }));
  },

  appendAgentMessage: (sessionId, content, isStreaming, toolCalls) => {
    set((state) => ({
      messages: withMessage(state, sessionId, (items) => {
        if (isStreaming && items.length > 0) {
          const last = items[items.length - 1];
          if (last?.role === 'assistant' && last.isStreaming) {
            const mergedContent =
              content.startsWith(last.content)
                ? content
                : `${last.content}${content}`;
            const updated: ChatMessage = {
              ...last,
              content: mergedContent,
              isStreaming: true
            };
            return [...items.slice(0, -1), updated];
          }
        }
        return [
          ...items,
          {
            id: nanoid(),
            role: 'assistant',
            content,
            isStreaming,
            toolCalls,
            timestamp: Date.now()
          }
        ];
      })
    }));
  },

  appendPermission: (sessionId, request) => {
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, request],
      messages: withMessage(state, sessionId, (items) => [
        ...items,
        {
          id: nanoid(),
          role: 'permission',
          request,
          timestamp: Date.now()
        }
      ])
    }));
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              status
            }
          : session
      )
    }));
  },

  applyWsMessage: (message) => {
    if (message.type === 'agent:message') {
      get().appendAgentMessage(
        message.sessionId,
        message.content.content,
        message.content.isStreaming,
        message.content.toolCalls
      );
      return;
    }
    if (message.type === 'permission:request') {
      get().appendPermission(message.sessionId, message.request);
      return;
    }
    if (message.type === 'agent:status') {
      get().updateSessionStatus(message.sessionId, message.status);
    }
  }
}));
