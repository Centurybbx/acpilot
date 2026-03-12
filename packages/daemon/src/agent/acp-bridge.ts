import { EventEmitter } from 'node:events';
import type {
  AcpEvent,
  AcpRequest,
  AcpResponse,
  AgentCapabilities
} from '@acpilot/shared';

export interface BridgeProcessLike extends EventEmitter {
  writeRaw(line: string): void;
}

type PendingRequest = {
  resolve: (value: AcpResponse) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
};

type JsonRpcId = number | string | null;

type PermissionOption = {
  optionId: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string;
};

type PendingPermissionRequest = {
  rpcId: JsonRpcId;
  options: PermissionOption[];
};

type JsonRpcIncoming = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

const REQUEST_TIMEOUT_MS = 30_000;
const ACP_PROTOCOL_VERSION = 1;
const CLIENT_NAME = 'acpilot-daemon';
const CLIENT_VERSION = '0.1.0';

export class AcpBridge {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingPermission = new Map<string, PendingPermissionRequest>();
  private readonly eventHandlers = new Set<(event: AcpEvent) => void>();
  private readonly rawLogs: string[] = [];

  constructor(private readonly process: BridgeProcessLike) {
    this.process.on('stdout:line', (line: string) => {
      this.handleStdoutLine(line);
    });
    this.process.on('stderr:line', (line: string) => {
      this.rawLogs.push(line);
    });
  }

  request(method: string, params?: Record<string, unknown>): Promise<AcpResponse> {
    const id = this.nextId++;
    const request: AcpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    this.write(request);

    return new Promise<AcpResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  async initialize(): Promise<AgentCapabilities> {
    const response = await this.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: {
        name: CLIENT_NAME,
        version: CLIENT_VERSION
      },
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false
        },
        terminal: false
      }
    });
    const result = response.result as
      | {
          capabilities?: AgentCapabilities;
          agentCapabilities?: {
            loadSession?: boolean;
            sessionCapabilities?: {
              resume?: unknown;
            };
          };
        }
      | undefined;

    const normalized: AgentCapabilities = {
      ...(result?.capabilities ?? {})
    };

    if (typeof result?.agentCapabilities?.loadSession === 'boolean') {
      normalized.supportsLoad = result.agentCapabilities.loadSession;
    }

    const resumeCapability = result?.agentCapabilities?.sessionCapabilities?.resume;
    if (resumeCapability !== undefined && resumeCapability !== null) {
      normalized.supportsResume = true;
    }

    return normalized;
  }

  async sessionNew(cwd: string, config: object = {}): Promise<{ sessionId: string }> {
    const maybeMcpServers = (config as { mcpServers?: unknown }).mcpServers;
    const mcpServers = Array.isArray(maybeMcpServers) ? maybeMcpServers : [];
    const response = await this.request('session/new', { cwd, mcpServers });
    const result = response.result as { sessionId?: string } | undefined;
    if (!result?.sessionId) {
      throw new Error('ACP session/new did not return sessionId');
    }
    return { sessionId: result.sessionId };
  }

  async sessionPrompt(sessionId: string, prompt: string): Promise<void> {
    await this.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: prompt }]
    });
  }

  async sessionSetConfigOption(
    sessionId: string,
    name: string,
    value: string | boolean
  ): Promise<void> {
    await this.request('session/set_config_option', {
      sessionId,
      name,
      value
    });
  }

  async sessionSetMode(sessionId: string, mode: string): Promise<void> {
    await this.request('session/set_mode', {
      sessionId,
      mode
    });
  }

  async sessionCancel(sessionId: string): Promise<void> {
    this.notify('session/cancel', { sessionId });
  }

  async respondPermission(requestId: string, approved: boolean): Promise<void> {
    const pending = this.pendingPermission.get(requestId);
    if (!pending) {
      await this.request('permission/response', {
        requestId,
        approved
      });
      return;
    }
    this.pendingPermission.delete(requestId);

    const optionId = this.pickPermissionOption(pending.options, approved);
    const result =
      optionId === null
        ? {
            outcome: {
              outcome: 'cancelled'
            }
          }
        : {
            outcome: {
              outcome: 'selected',
              optionId
            }
          };
    this.writeRaw({
      jsonrpc: '2.0',
      id: pending.rpcId,
      result
    });
  }

  onEvent(handler: (event: AcpEvent) => void): void {
    this.eventHandlers.add(handler);
  }

  getRawLogs(): string[] {
    return [...this.rawLogs];
  }

  private write(data: AcpRequest): void {
    this.process.writeRaw(`${JSON.stringify(data)}\n`);
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    this.writeRaw({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  private writeRaw(data: Record<string, unknown>): void {
    this.process.writeRaw(`${JSON.stringify(data)}\n`);
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) {
      return;
    }
    let parsed: JsonRpcIncoming;
    try {
      parsed = JSON.parse(line) as JsonRpcIncoming;
    } catch {
      this.rawLogs.push(`stdout: ${line}`);
      return;
    }

    if (this.isResponse(parsed)) {
      const requestId = parsed.id;
      if (typeof requestId !== 'number') {
        return;
      }
      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
      if (parsed.error) {
        const detail =
          parsed.error.data === undefined
            ? ''
            : ` (${typeof parsed.error.data === 'string' ? parsed.error.data : JSON.stringify(parsed.error.data)})`;
        pending.reject(
          new Error(
            `ACP error ${parsed.error.code}: ${parsed.error.message}${detail}`
          )
        );
        return;
      }
      pending.resolve(parsed);
      return;
    }

    if (this.isRequest(parsed)) {
      this.handleAgentRequest(parsed.id, parsed.method, parsed.params);
      return;
    }

    if (this.isNotification(parsed)) {
      this.handleAgentNotification(parsed.method, parsed.params);
    }
  }

  private isResponse(message: JsonRpcIncoming): message is AcpResponse & { id: JsonRpcId } {
    return message.id !== undefined && (message.result !== undefined || message.error !== undefined);
  }

  private isRequest(
    message: JsonRpcIncoming
  ): message is { id: JsonRpcId; method: string; params?: unknown } {
    return message.id !== undefined && typeof message.method === 'string';
  }

  private isNotification(
    message: JsonRpcIncoming
  ): message is { method: string; params?: unknown } {
    return message.id === undefined && typeof message.method === 'string';
  }

  private handleAgentNotification(method: string, params: unknown): void {
    if (method === 'session/update') {
      const translated = this.translateSessionUpdate(params);
      if (!translated) {
        return;
      }
      this.emitEvent(translated);
      return;
    }
    this.emitEvent({
      jsonrpc: '2.0',
      method,
      params: this.asRecord(params)
    });
  }

  private handleAgentRequest(id: JsonRpcId, method: string, params: unknown): void {
    if (method === 'session/request_permission') {
      const payload = this.asRecord(params);
      const sessionId = String(payload.sessionId ?? '');
      if (!sessionId) {
        this.writeError(id, -32602, 'Invalid params', 'missing sessionId');
        return;
      }

      const requestId = String(id);
      const options = this.parsePermissionOptions(payload.options);
      this.pendingPermission.set(requestId, {
        rpcId: id,
        options
      });
      const toolCall = this.asRecord(payload.toolCall);
      const filePath = this.getToolCallPath(toolCall);
      this.emitEvent({
        jsonrpc: '2.0',
        method: 'permission/request',
        params: {
          sessionId,
          id: requestId,
          description: String(toolCall.title ?? 'Permission required'),
          action: String(toolCall.kind ?? 'unknown'),
          ...(filePath ? { filePath } : {})
        }
      });
      return;
    }

    this.writeError(id, -32601, 'Method not found', method);
  }

  private translateSessionUpdate(params: unknown): AcpEvent | null {
    const payload = this.asRecord(params);
    const sessionId = String(payload.sessionId ?? '');
    if (!sessionId) {
      return null;
    }
    const update = this.asRecord(payload.update);
    const updateType = String(update.sessionUpdate ?? '');

    if (updateType === 'agent_message_chunk') {
      const text = this.extractText(update.content);
      if (text === null) {
        return null;
      }
      return {
        jsonrpc: '2.0',
        method: 'session/message',
        params: {
          sessionId,
          content: text,
          isStreaming: true
        }
      };
    }

    if (updateType === 'available_commands_update') {
      const availableCommands = Array.isArray(update.availableCommands)
        ? update.availableCommands
        : [];
      const commands = availableCommands
        .map((item) => this.asRecord(item))
        .filter((item) => typeof item.name === 'string')
        .map((item) => ({
          name: String(item.name),
          ...(typeof item.description === 'string'
            ? { description: item.description }
            : {})
        }));
      return {
        jsonrpc: '2.0',
        method: 'available_commands_update',
        params: {
          sessionId,
          commands
        }
      };
    }

    return null;
  }

  private extractText(content: unknown): string | null {
    const block = this.asRecord(content);
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
    return null;
  }

  private emitEvent(event: AcpEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.rawLogs.push(`event handler error: ${(error as Error).message}`);
      }
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private parsePermissionOptions(input: unknown): PermissionOption[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((value) => this.asRecord(value))
      .filter(
        (option) =>
          typeof option.optionId === 'string' &&
          typeof option.kind === 'string'
      )
      .map((option) => ({
        optionId: String(option.optionId),
        kind: String(option.kind)
      }));
  }

  private pickPermissionOption(
    options: PermissionOption[],
    approved: boolean
  ): string | null {
    const preferred = approved
      ? ['allow_once', 'allow_always']
      : ['reject_once', 'reject_always'];
    for (const kind of preferred) {
      const option = options.find((item) => item.kind === kind);
      if (option) {
        return option.optionId;
      }
    }
    return null;
  }

  private getToolCallPath(toolCall: Record<string, unknown>): string | null {
    const locations = Array.isArray(toolCall.locations) ? toolCall.locations : [];
    for (const location of locations) {
      const candidate = this.asRecord(location);
      if (typeof candidate.path === 'string' && candidate.path.length > 0) {
        return candidate.path;
      }
    }
    return null;
  }

  private writeError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
    this.writeRaw({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data })
      }
    });
  }
}
