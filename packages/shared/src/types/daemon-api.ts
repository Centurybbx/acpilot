import type {
  AgentCapabilities,
  ToolCallInfo
} from './acp.js';
import type { SessionStatus } from './session.js';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface TrustedDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}

export type AuthState =
  | {
      paired: true;
      bootstrapRequired: false;
      trustedDeviceCount: number;
      device: TrustedDevice;
    }
  | {
      paired: false;
      bootstrapRequired: boolean;
      trustedDeviceCount: number;
    };

export interface PairingChallenge {
  challengeId: string;
  expiresAt: number;
}

export interface PairingCompletion {
  device: TrustedDevice;
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

export type WsMessage =
  | {
      type: 'agent:message';
      sessionId: string;
      seq: number;
      content: AgentMessage;
    }
  | {
      type: 'agent:status';
      sessionId: string;
      status: SessionStatus;
    }
  | {
      type: 'permission:request';
      sessionId: string;
      request: PermissionRequest;
    }
  | {
      type: 'capabilities:update';
      sessionId: string;
      capabilities: AgentCapabilities;
    }
  | {
      type: 'connection:status';
      status: 'connected' | 'reconnecting' | 'disconnected';
      reason?: 'network' | 'background' | 'daemon-restart';
      progress?: number;
    }
  | {
      type: 'session:restored';
      sessionId: string;
    }
  | {
      type: 'session:expired';
      sessionId: string;
    };

export type WsClientMessage =
  | {
      type: 'permission:response';
      sessionId: string;
      requestId: string;
      approved: boolean;
    }
  | {
      type: 'session:resume';
      sessionId: string;
      lastSeq: number;
    };
