import type { AgentCapabilities } from './acp.js';
export type SessionStatus = 'initializing' | 'active' | 'suspended' | 'closed' | 'error';
export interface Session {
    id: string;
    agentId: string;
    cwd: string;
    workspaceType: 'local' | 'worktree';
    status: SessionStatus;
    capabilities: AgentCapabilities;
    eventSeq: number;
    createdAt: number;
    lastActiveAt: number;
}
//# sourceMappingURL=session.d.ts.map