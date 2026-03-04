import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentDef } from './registry.js';

export type AgentProcessStatus =
  | 'starting'
  | 'running'
  | 'crashed'
  | 'stopped'
  | 'fused';

export interface AgentProcessOptions {
  crashRestartLimit: number;
  sessionIdleTimeoutMs: number;
  spawnImpl?: typeof spawn;
}

export class AgentProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private restartCount = 0;
  private activeSessions = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private currentCwd = process.cwd();
  private readonly spawnImpl: typeof spawn;
  public status: AgentProcessStatus = 'stopped';

  constructor(
    private readonly agent: AgentDef,
    private readonly options: AgentProcessOptions
  ) {
    super();
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  get agentId(): string {
    return this.agent.id;
  }

  get pid(): number {
    return this.child?.pid ?? -1;
  }

  async start(cwd: string): Promise<void> {
    this.currentCwd = cwd;
    if (this.status === 'running' || this.status === 'starting') {
      return;
    }
    if (this.status === 'fused') {
      throw new Error(`agent process is fused: ${this.agentId}`);
    }
    this.status = 'starting';
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnImpl(this.agent.command, this.agent.args, {
        cwd,
        env: {
          ...process.env,
          ...this.agent.env
        },
        stdio: ['pipe', 'pipe', 'pipe']
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      this.status = 'crashed';
      this.emit('status', this.status);
      throw this.normalizeSpawnError(error);
    }
    this.child = child;

    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        child.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        child.off('spawn', onSpawn);
        this.child = null;
        this.status = 'crashed';
        this.emit('status', this.status);
        reject(this.normalizeSpawnError(error));
      };
      child.once('spawn', onSpawn);
      child.once('error', onError);
    });

    this.bindOutput(child);
    this.bindExit(child);
    this.bindRuntimeError(child);
    this.status = 'running';
    this.emit('status', this.status);
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.status = 'stopped';
      return;
    }
    const child = this.child;
    this.child = null;
    this.status = 'stopped';

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
    this.emit('status', this.status);
  }

  writeRaw(line: string): void {
    if (!this.child?.stdin.writable) {
      throw new Error(`agent ${this.agentId} stdin is not writable`);
    }
    this.child.stdin.write(line);
  }

  acquireSession(): void {
    this.activeSessions += 1;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  releaseSession(): void {
    this.activeSessions = Math.max(0, this.activeSessions - 1);
    if (this.activeSessions > 0 || this.options.sessionIdleTimeoutMs <= 0) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      void this.stop();
    }, this.options.sessionIdleTimeoutMs);
  }

  resetFuse(): void {
    this.restartCount = 0;
    if (this.status === 'fused') {
      this.status = 'stopped';
    }
  }

  private bindOutput(child: ChildProcessWithoutNullStreams): void {
    let stdoutBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        this.emit('stdout:line', line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        this.emit('stderr:line', line);
      }
    });
  }

  private bindExit(child: ChildProcessWithoutNullStreams): void {
    child.once('exit', (code) => {
      this.handleUnexpectedTermination(child, code ?? -1);
    });
  }

  private bindRuntimeError(child: ChildProcessWithoutNullStreams): void {
    child.on('error', (error: Error) => {
      this.emit('stderr:line', `agent runtime error: ${error.message}`);
      this.handleUnexpectedTermination(child, -1);
    });
  }

  private async handleCrash(exitCode: number): Promise<void> {
    if (this.status === 'fused') {
      return;
    }
    this.restartCount += 1;
    this.emit('crash', { exitCode, restartCount: this.restartCount });
    if (this.restartCount > this.options.crashRestartLimit) {
      this.fuse();
      return;
    }
    const backoffMs = 2 ** (this.restartCount - 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    try {
      await this.start(this.currentCwd);
    } catch {
      this.fuse();
    }
  }

  private handleUnexpectedTermination(
    child: ChildProcessWithoutNullStreams,
    exitCode: number
  ): void {
    if (this.child !== child) {
      return;
    }
    this.child = null;
    if (this.status === 'stopped' || this.status === 'fused') {
      return;
    }
    this.status = 'crashed';
    this.emit('status', this.status);
    void this.handleCrash(exitCode);
  }

  private normalizeSpawnError(error: unknown): Error {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return new Error(
        `Agent command not found: ${this.agent.command}. ` +
          `Install it or configure the command path.`
      );
    }
    return err instanceof Error ? err : new Error(String(error));
  }

  private fuse(): void {
    this.status = 'fused';
    this.emit('status', this.status);
  }
}
