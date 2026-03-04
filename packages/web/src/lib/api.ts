import type { ApiResponse, Session, WsClientMessage } from '@acpilot/shared';

async function requestJson<T>(
  path: string,
  init: RequestInit,
  token?: string
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('content-type', 'application/json');
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error ?? `request failed: ${response.status}`);
  }
  return payload.data;
}

export interface AgentDef {
  id: string;
  displayName: string;
  command?: string;
  args?: string[];
  mvpLevel?: 'ga' | 'beta';
}

export async function fetchAgents(token: string): Promise<AgentDef[]> {
  return requestJson<AgentDef[]>('/agents', { method: 'GET' }, token);
}

export async function createSession(
  token: string,
  payload: { agentId: string; cwd: string; workspaceType: 'local' | 'worktree' }
): Promise<Session> {
  return requestJson<Session>(
    '/sessions',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    token
  );
}

export async function sendPrompt(
  token: string,
  sessionId: string,
  prompt: string
): Promise<{ accepted: boolean }> {
  return requestJson<{ accepted: boolean }>(
    `/sessions/${sessionId}/prompt`,
    {
      method: 'POST',
      body: JSON.stringify({ prompt })
    },
    token
  );
}

export async function cancelPrompt(
  token: string,
  sessionId: string
): Promise<{ canceled: boolean }> {
  return requestJson<{ canceled: boolean }>(
    `/sessions/${sessionId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({})
    },
    token
  );
}

export async function verifyToken(token: string): Promise<{ valid: boolean; expired: boolean }> {
  return requestJson<{ valid: boolean; expired: boolean }>(
    '/auth/token/verify',
    {
      method: 'POST',
      body: JSON.stringify({ token })
    },
    token
  );
}

export async function refreshToken(
  token: string
): Promise<{ token: string; expiresAt: number }> {
  return requestJson<{ token: string; expiresAt: number }>(
    '/auth/token/refresh',
    {
      method: 'POST',
      body: JSON.stringify({})
    },
    token
  );
}

export async function fetchSessionLogs(token: string, sessionId: string): Promise<string[]> {
  return requestJson<string[]>(`/sessions/${sessionId}/logs`, { method: 'GET' }, token);
}

export function sendWsMessage(ws: WebSocket | null, message: WsClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(message));
}
