import type {
  ApiResponse,
  AuthState,
  PairingChallenge,
  PairingCompletion,
  SessionConfig,
  Session,
  TrustedDevice,
  WsClientMessage
} from '@acpilot/shared';

async function requestJson<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include'
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

export async function getAuthState(): Promise<AuthState> {
  return requestJson<AuthState>('/auth/state', { method: 'GET' });
}

export async function startPairing(deviceName?: string): Promise<PairingChallenge> {
  return requestJson<PairingChallenge>('/auth/pair/start', {
    method: 'POST',
    body: JSON.stringify({ deviceName })
  });
}

export async function completePairing(payload: {
  challengeId: string;
  code: string;
  deviceName?: string;
}): Promise<PairingCompletion> {
  return requestJson<PairingCompletion>('/auth/pair/complete', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function logout(): Promise<{ loggedOut: boolean }> {
  return requestJson<{ loggedOut: boolean }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function fetchTrustedDevices(): Promise<TrustedDevice[]> {
  return requestJson<TrustedDevice[]>('/auth/devices', { method: 'GET' });
}

export async function revokeTrustedDevice(deviceId: string): Promise<TrustedDevice> {
  return requestJson<TrustedDevice>(`/auth/devices/${deviceId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function fetchAgents(): Promise<AgentDef[]> {
  return requestJson<AgentDef[]>('/agents', { method: 'GET' });
}

export async function createSession(payload: {
  agentId: string;
  cwd: string;
  workspaceType: 'local' | 'worktree';
}): Promise<Session> {
  return requestJson<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
  config?: SessionConfig
): Promise<{ accepted: boolean }> {
  return requestJson<{ accepted: boolean }>(`/sessions/${sessionId}/prompt`, {
    method: 'POST',
    body: JSON.stringify({ prompt, config })
  });
}

export async function cancelPrompt(
  sessionId: string
): Promise<{ canceled: boolean }> {
  return requestJson<{ canceled: boolean }>(`/sessions/${sessionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function fetchSessionLogs(sessionId: string): Promise<string[]> {
  return requestJson<string[]>(`/sessions/${sessionId}/logs`, { method: 'GET' });
}

export function sendWsMessage(ws: WebSocket | null, message: WsClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(message));
}
