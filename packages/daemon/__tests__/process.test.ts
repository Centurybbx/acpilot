import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AgentProcess } from '../src/agent/process.js';
import type { AgentDef } from '../src/agent/registry.js';

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;

  kill = vi.fn(() => true);
}

const baseAgent: AgentDef = {
  id: 'codex',
  displayName: 'Codex',
  command: 'codex-acp',
  args: [],
  mvpLevel: 'ga',
  available: true
};

describe('agent process', () => {
  it('rejects startup with friendly message when command is missing', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new FakeChild();
      queueMicrotask(() => {
        child.emit('error', Object.assign(new Error('spawn codex-acp ENOENT'), { code: 'ENOENT' }));
      });
      return child as never;
    });

    const process = new AgentProcess(baseAgent, {
      crashRestartLimit: 0,
      sessionIdleTimeoutMs: 0,
      spawnImpl: spawnImpl as never
    });

    await expect(process.start('/tmp')).rejects.toThrow(/command not found/i);
    expect(process.status).toBe('crashed');
  });

  it('handles runtime child error without crashing the daemon process', async () => {
    let childRef: FakeChild | null = null;
    const spawnImpl = vi.fn(() => {
      const child = new FakeChild();
      childRef = child;
      queueMicrotask(() => {
        child.emit('spawn');
      });
      return child as never;
    });

    const process = new AgentProcess(baseAgent, {
      crashRestartLimit: 0,
      sessionIdleTimeoutMs: 0,
      spawnImpl: spawnImpl as never
    });

    await process.start('/tmp');
    childRef?.emit('error', new Error('runtime boom'));
    await Promise.resolve();

    expect(process.status).toBe('fused');
  });
});
