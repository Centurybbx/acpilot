import type { AgentCapabilities, ToolCallInfo } from './acp.js';
import type { SessionStatus } from './session.js';
export interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: string;
}
export interface AgentMessage {
    role: 'assistant';
    content: string;
    isStreaming?: boolean;
    toolCalls?: ToolCallInfo[];
}
export interface PermissionRequest {
    id: string;
    description: string;
    filePath?: string;
    action: string;
}
export type WsMessage = {
    type: 'agent:message';
    sessionId: string;
    seq: number;
    content: AgentMessage;
} | {
    type: 'agent:status';
    sessionId: string;
    status: SessionStatus;
} | {
    type: 'permission:request';
    sessionId: string;
    request: PermissionRequest;
} | {
    type: 'capabilities:update';
    sessionId: string;
    capabilities: AgentCapabilities;
} | {
    type: 'connection:status';
    status: 'connected' | 'reconnecting' | 'disconnected';
    reason?: 'network' | 'background' | 'daemon-restart';
    progress?: number;
} | {
    type: 'session:restored';
    sessionId: string;
} | {
    type: 'session:expired';
    sessionId: string;
};
export type WsClientMessage = {
    type: 'permission:response';
    sessionId: string;
    requestId: string;
    approved: boolean;
} | {
    type: 'session:resume';
    sessionId: string;
    lastSeq: number;
};
//# sourceMappingURL=daemon-api.d.ts.map