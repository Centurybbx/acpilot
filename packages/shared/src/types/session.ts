import type { AgentCapabilities } from './acp.js';

export type SessionStatus =
  | 'initializing'
  | 'active'
  | 'suspended'
  | 'closed'
  | 'error';

export type SessionConfigValue = string | boolean;

export type SessionConfig = Record<string, SessionConfigValue>;

export interface Session {
  id: string;
  agentId: string;
  cwd: string;
  branch?: string;
  workspaceType: 'local' | 'worktree';
  status: SessionStatus;
  capabilities: AgentCapabilities;
  config: SessionConfig;
  eventSeq: number;
  createdAt: number;
  lastActiveAt: number;
}
