import { nanoid } from 'nanoid';
import type {
  AcpEvent,
  AgentCapabilities,
  SessionConfig,
  SessionConfigValue,
  Session,
  SessionStatus,
  ToolCallInfo,
  WsMessage
} from '@acpilot/shared';
import { AcpBridge } from '../agent/acp-bridge.js';
import { AgentProcess, type AgentProcessOptions } from '../agent/process.js';
import { getAgent } from '../agent/registry.js';
import { EventLog } from './event-log.js';

export interface AcpBridgeLike {
  initialize(): Promise<AgentCapabilities>;
  sessionNew(cwd: string, config?: object): Promise<{ sessionId: string }>;
  sessionPrompt(sessionId: string, prompt: string): Promise<void>;
  sessionSetConfigOption(sessionId: string, name: string, value: SessionConfigValue): Promise<void>;
  sessionSetMode(sessionId: string, mode: string): Promise<void>;
  sessionCancel(sessionId: string): Promise<void>;
  respondPermission?(requestId: string, approved: boolean): Promise<void>;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(handler: (event: AcpEvent) => void): void;
  getRawLogs(): string[];
}

export interface ManagedProcessLike {
  agentId: string;
  status: string;
  start(cwd: string): Promise<void>;
  stop(): Promise<void>;
  acquireSession(): void;
  releaseSession(): void;
  resetFuse(): void;
}

export interface AgentRuntime {
  bridge: AcpBridgeLike;
  process: ManagedProcessLike;
}

type SessionRecord = Session & {
  remoteSessionId: string;
  runtime: AgentRuntime;
};

export interface SessionManagerOptions {
  eventLog: EventLog;
  createRuntime?: (agentId: string, cwd: string) => Promise<AgentRuntime>;
  onSessionEvent?: (sessionId: string, message: WsMessage) => void;
  processOptions?: AgentProcessOptions;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly remoteToLocal = new Map<string, string>();
  private readonly runtimes = new Map<string, AgentRuntime>();
  private readonly runtimeCapabilities = new Map<string, AgentCapabilities>();
  private readonly pendingRuntimes = new Map<string, Promise<AgentRuntime>>();
  private readonly subscribedRuntimeIds = new Set<string>();
  private readonly createRuntimeFn: (agentId: string, cwd: string) => Promise<AgentRuntime>;

  constructor(private readonly options: SessionManagerOptions) {
    this.createRuntimeFn =
      options.createRuntime ??
      (async (agentId, cwd) => {
        const agent = getAgent(agentId);
        if (!agent) {
          throw new Error(`unknown agent: ${agentId}`);
        }
        const process = new AgentProcess(agent, {
          crashRestartLimit: options.processOptions?.crashRestartLimit ?? 3,
          sessionIdleTimeoutMs: options.processOptions?.sessionIdleTimeoutMs ?? 30 * 60 * 1000
        });
        await process.start(cwd);
        const bridge = new AcpBridge(process);
        return { bridge, process };
      });
  }

  async create(
    agentId: string,
    cwd: string,
    workspaceType: 'local' | 'worktree'
  ): Promise<Session> {
    const runtime = await this.ensureRuntime(agentId, cwd);
    runtime.process.acquireSession();
    this.bindRuntimeEvents(agentId, runtime);

    const capabilities = await this.getRuntimeCapabilities(agentId, runtime);
    const remote = await runtime.bridge.sessionNew(cwd, {});
    const config = this.buildDefaultConfig(capabilities);
    await this.applyConfigDiff(runtime.bridge, remote.sessionId, capabilities, {}, config);
    const id = nanoid();
    const now = Date.now();
    const session: SessionRecord = {
      id,
      agentId,
      cwd,
      workspaceType,
      status: 'active',
      capabilities,
      config,
      eventSeq: 0,
      createdAt: now,
      lastActiveAt: now,
      remoteSessionId: remote.sessionId,
      runtime
    };
    this.sessions.set(id, session);
    this.remoteToLocal.set(remote.sessionId, id);
    this.emitSessionEvent(id, {
      type: 'agent:status',
      sessionId: id,
      status: 'active'
    });
    this.emitSessionEvent(id, {
      type: 'capabilities:update',
      sessionId: id,
      capabilities
    });
    return this.toSession(session);
  }

  async prompt(sessionId: string, prompt: string, config: SessionConfig = {}): Promise<void> {
    const session = this.getRecord(sessionId);
    const nextConfig = this.mergeConfig(session.capabilities, session.config, config);
    await this.applyConfigDiff(
      session.runtime.bridge,
      session.remoteSessionId,
      session.capabilities,
      session.config,
      nextConfig
    );
    session.config = nextConfig;
    await session.runtime.bridge.sessionPrompt(session.remoteSessionId, prompt);
    session.lastActiveAt = Date.now();
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.getRecord(sessionId);
    await session.runtime.bridge.sessionCancel(session.remoteSessionId);
    session.lastActiveAt = Date.now();
  }

  get(sessionId: string): Session | undefined {
    const record = this.sessions.get(sessionId);
    return record ? this.toSession(record) : undefined;
  }

  listActive(): Session[] {
    return [...this.sessions.values()]
      .filter((session) => session.status === 'active' || session.status === 'initializing')
      .map((session) => this.toSession(session));
  }

  async handlePermissionResponse(
    sessionId: string,
    requestId: string,
    approved: boolean
  ): Promise<void> {
    const session = this.getRecord(sessionId);
    if (typeof session.runtime.bridge.respondPermission === 'function') {
      await session.runtime.bridge.respondPermission(requestId, approved);
      return;
    }
    await session.runtime.bridge.request('permission/response', {
      sessionId: session.remoteSessionId,
      requestId,
      approved
    });
  }

  async close(sessionId: string): Promise<void> {
    const session = this.getRecord(sessionId);
    session.status = 'closed';
    session.runtime.process.releaseSession();
    this.emitSessionEvent(sessionId, {
      type: 'agent:status',
      sessionId,
      status: 'closed'
    });
  }

  getLogs(sessionId: string): string[] {
    const session = this.getRecord(sessionId);
    return session.runtime.bridge.getRawLogs();
  }

  getEventLog(): EventLog {
    return this.options.eventLog;
  }

  async tryResumeSession(
    sessionId: string
  ): Promise<'resumed' | 'loaded' | 'unsupported' | 'expired'> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return 'expired';
    }

    if (session.status === 'active' && session.runtime.process.status === 'running') {
      return 'resumed';
    }

    if (session.capabilities.supportsResume) {
      try {
        await session.runtime.bridge.request('session/resume', {
          sessionId: session.remoteSessionId,
          cwd: session.cwd,
          mcpServers: []
        });
        return 'resumed';
      } catch {
        return 'expired';
      }
    }

    if (session.capabilities.supportsLoad) {
      try {
        await session.runtime.bridge.request('session/load', {
          sessionId: session.remoteSessionId,
          cwd: session.cwd,
          mcpServers: []
        });
        return 'loaded';
      } catch {
        return 'expired';
      }
    }

    return 'unsupported';
  }

  private bindRuntimeEvents(agentId: string, runtime: AgentRuntime): void {
    if (this.subscribedRuntimeIds.has(agentId)) {
      return;
    }
    this.subscribedRuntimeIds.add(agentId);
    runtime.bridge.onEvent((event) => {
      this.handleAcpEvent(event);
    });
  }

  private handleAcpEvent(event: AcpEvent): void {
    const params = event.params ?? {};
    const remoteSessionId = String(params.sessionId ?? '');
    if (!remoteSessionId) {
      return;
    }
    const localSessionId = this.remoteToLocal.get(remoteSessionId);
    if (!localSessionId) {
      return;
    }
    const session = this.sessions.get(localSessionId);
    if (!session) {
      return;
    }

    switch (event.method) {
      case 'session/message':
      case 'session/message_delta': {
        const nextSeq = this.options.eventLog.getLatestSeq(localSessionId) + 1;
        this.emitSessionEvent(localSessionId, {
          type: 'agent:message',
          sessionId: localSessionId,
          seq: nextSeq,
          content: {
            role: 'assistant',
            content: String(params.content ?? ''),
            isStreaming: Boolean(params.isStreaming),
            toolCalls: Array.isArray(params.toolCalls)
              ? (params.toolCalls as ToolCallInfo[])
              : undefined
          }
        });
        session.lastActiveAt = Date.now();
        return;
      }
      case 'permission/request': {
        this.emitSessionEvent(localSessionId, {
          type: 'permission:request',
          sessionId: localSessionId,
          request: {
            id: String(params.id ?? ''),
            description: String(params.description ?? 'Permission required'),
            action: String(params.action ?? 'unknown'),
            filePath:
              typeof params.filePath === 'string' ? params.filePath : undefined
          }
        });
        return;
      }
      case 'available_commands_update': {
        const commandsRaw = Array.isArray(params.commands)
          ? (params.commands as NonNullable<AgentCapabilities['commands']>)
          : [];
        const commands = commandsRaw.filter((command, index) => {
          const name = command?.name;
          if (!name) {
            return false;
          }
          return commandsRaw.findIndex((item) => item?.name === name) === index;
        });
        session.capabilities = {
          ...session.capabilities,
          commands
        };
        this.runtimeCapabilities.set(session.agentId, {
          ...(this.runtimeCapabilities.get(session.agentId) ?? session.capabilities),
          commands
        });
        this.emitSessionEvent(localSessionId, {
          type: 'capabilities:update',
          sessionId: localSessionId,
          capabilities: session.capabilities
        });
        return;
      }
      case 'session/status': {
        const status = this.normalizeStatus(params.status);
        session.status = status;
        this.emitSessionEvent(localSessionId, {
          type: 'agent:status',
          sessionId: localSessionId,
          status
        });
        return;
      }
      default:
        return;
    }
  }

  private normalizeStatus(value: unknown): SessionStatus {
    if (
      value === 'initializing' ||
      value === 'active' ||
      value === 'suspended' ||
      value === 'closed' ||
      value === 'error'
    ) {
      return value;
    }
    return 'active';
  }

  private emitSessionEvent(sessionId: string, message: WsMessage): void {
    const seq = this.options.eventLog.append(sessionId, message);
    const session = this.sessions.get(sessionId);
    if (session) {
      session.eventSeq = seq;
    }
    const outbound =
      message.type === 'agent:message' ? { ...message, seq } : message;
    this.options.onSessionEvent?.(sessionId, outbound);
  }

  private async ensureRuntime(agentId: string, cwd: string): Promise<AgentRuntime> {
    const existing = this.runtimes.get(agentId);
    if (existing && existing.process.status === 'running') {
      return existing;
    }
    const pending = this.pendingRuntimes.get(agentId);
    if (pending) {
      return pending;
    }

    const runtimePromise = (async () => {
      const runtime = await this.createRuntimeFn(agentId, cwd);
      if (runtime.process.status !== 'running') {
        await runtime.process.start(cwd);
      }
      this.runtimes.set(agentId, runtime);
      this.runtimeCapabilities.delete(agentId);
      return runtime;
    })();

    this.pendingRuntimes.set(agentId, runtimePromise);
    try {
      return await runtimePromise;
    } finally {
      this.pendingRuntimes.delete(agentId);
    }
  }

  private async getRuntimeCapabilities(
    agentId: string,
    runtime: AgentRuntime
  ): Promise<AgentCapabilities> {
    const existing = this.runtimeCapabilities.get(agentId);
    if (existing) {
      return existing;
    }
    const initialized = await runtime.bridge.initialize();
    this.runtimeCapabilities.set(agentId, initialized);
    return initialized;
  }

  private getRecord(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`session not found: ${sessionId}`);
    }
    return session;
  }

  private buildDefaultConfig(capabilities: AgentCapabilities): SessionConfig {
    const config: SessionConfig = {};

    for (const option of capabilities.configOptions ?? []) {
      if (option.type === 'boolean') {
        config[option.name] = false;
        continue;
      }

      const fallback = option.default ?? option.values?.[0];
      if (fallback !== undefined) {
        config[option.name] = fallback;
      }
    }

    if (capabilities.modes?.length && config.mode === undefined) {
      config.mode = capabilities.modes[0]?.name ?? 'default';
    }

    return config;
  }

  private mergeConfig(
    capabilities: AgentCapabilities,
    currentConfig: SessionConfig,
    nextConfig: SessionConfig
  ): SessionConfig {
    const merged = { ...currentConfig };
    for (const [name, value] of Object.entries(nextConfig)) {
      merged[name] = this.normalizeConfigValue(capabilities, name, value);
    }
    return merged;
  }

  private normalizeConfigValue(
    capabilities: AgentCapabilities,
    name: string,
    value: SessionConfigValue
  ): SessionConfigValue {
    const option = capabilities.configOptions?.find((item) => item.name === name);
    if (option) {
      if (option.type === 'boolean') {
        return Boolean(value);
      }
      if (typeof value !== 'string') {
        throw new Error(`config option "${name}" expects a string value`);
      }
      if (option.type === 'enum' && option.values?.length && !option.values.includes(value)) {
        throw new Error(`config option "${name}" must be one of: ${option.values.join(', ')}`);
      }
      return value;
    }

    if (name === 'mode' && capabilities.modes?.length) {
      if (typeof value !== 'string') {
        throw new Error('mode expects a string value');
      }
      if (!capabilities.modes.some((mode) => mode.name === value)) {
        throw new Error(`mode must be one of: ${capabilities.modes.map((mode) => mode.name).join(', ')}`);
      }
      return value;
    }

    throw new Error(`unknown config option "${name}"`);
  }

  private async applyConfigDiff(
    bridge: AcpBridgeLike,
    remoteSessionId: string,
    capabilities: AgentCapabilities,
    currentConfig: SessionConfig,
    nextConfig: SessionConfig
  ): Promise<void> {
    for (const [name, value] of Object.entries(nextConfig)) {
      if (currentConfig[name] === value) {
        continue;
      }

      const option = capabilities.configOptions?.find((item) => item.name === name);
      if (option) {
        await bridge.sessionSetConfigOption(remoteSessionId, name, value);
        continue;
      }

      if (name === 'mode' && capabilities.modes?.length && typeof value === 'string') {
        await bridge.sessionSetMode(remoteSessionId, value);
      }
    }
  }

  private toSession(session: SessionRecord): Session {
    const { remoteSessionId: _remoteSessionId, runtime: _runtime, ...rest } = session;
    return {
      ...rest,
      config: { ...rest.config }
    };
  }
}
