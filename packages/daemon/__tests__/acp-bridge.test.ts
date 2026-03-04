import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { AcpBridge, type BridgeProcessLike } from '../src/agent/acp-bridge.js';

class FakeProcess extends EventEmitter implements BridgeProcessLike {
  public writes: string[] = [];

  writeRaw(line: string): void {
    this.writes.push(line);
  }

  emitStdout(line: string): void {
    this.emit('stdout:line', line);
  }

  emitStderr(line: string): void {
    this.emit('stderr:line', line);
  }
}

describe('acp bridge', () => {
  it('sends requests and resolves matching responses', async () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);

    const promise = bridge.request('initialize', { client: 'acpilot' });

    const outbound = proc.writes[0];
    expect(outbound).toContain('"method":"initialize"');

    const parsed = JSON.parse(outbound);
    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: parsed.id,
        result: { capabilities: { supportsResume: true } }
      })
    );

    const response = await promise;
    expect(response.result).toEqual({ capabilities: { supportsResume: true } });
  });

  it('forwards notification events and stores stderr logs', () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);
    const seen: string[] = [];

    bridge.onEvent((event) => {
      seen.push(event.method);
    });

    proc.emitStdout(JSON.stringify({ jsonrpc: '2.0', method: 'available_commands_update', params: {} }));
    proc.emitStderr('warn line');

    expect(seen).toEqual(['available_commands_update']);
    expect(bridge.getRawLogs()).toContain('warn line');
  });

  it('maps initialize and session helpers to ACP methods', async () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);

    const initPromise = bridge.initialize();
    const initReq = JSON.parse(proc.writes[0]);
    expect(initReq.method).toBe('initialize');
    expect(initReq.params?.protocolVersion).toBe(1);
    expect(initReq.params?.clientInfo?.name).toBe('acpilot-daemon');
    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: initReq.id,
        result: {
          agentCapabilities: {
            loadSession: true,
            sessionCapabilities: {
              resume: {}
            }
          }
        }
      })
    );
    const capabilities = await initPromise;
    expect(capabilities.supportsLoad).toBe(true);
    expect(capabilities.supportsResume).toBe(true);

    const newPromise = bridge.sessionNew('/tmp/project', { model: 'gpt' });
    const newReq = JSON.parse(proc.writes[1]);
    expect(newReq.method).toBe('session/new');
    expect(newReq.params).toEqual({
      cwd: '/tmp/project',
      mcpServers: []
    });
    proc.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: newReq.id, result: { sessionId: 'remote-1' } }));
    await expect(newPromise).resolves.toEqual({ sessionId: 'remote-1' });

    const promptPromise = bridge.sessionPrompt('remote-1', 'hello');
    const promptReq = JSON.parse(proc.writes[2]);
    expect(promptReq.method).toBe('session/prompt');
    expect(promptReq.params).toEqual({
      sessionId: 'remote-1',
      prompt: [{ type: 'text', text: 'hello' }]
    });
    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: promptReq.id,
        result: { stopReason: 'end_turn' }
      })
    );
    await expect(promptPromise).resolves.toBeUndefined();

    await bridge.sessionCancel('remote-1');
    const cancelReq = JSON.parse(proc.writes[3]);
    expect(cancelReq).toEqual({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: 'remote-1' }
    });
  });

  it('rejects pending request when ACP response has error', async () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);

    const pending = bridge.request('session/prompt', {
      sessionId: 'x',
      prompt: 'hello'
    });
    const outbound = JSON.parse(proc.writes[0] ?? '{}');
    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: outbound.id,
        error: {
          code: -32000,
          message: 'permission denied'
        }
      })
    );

    await expect(pending).rejects.toThrow(/permission denied/i);
  });

  it('translates ACP session/update notifications', () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);
    const seen: Array<{ method: string; params?: Record<string, unknown> }> = [];

    bridge.onEvent((event) => {
      seen.push({
        method: event.method,
        params: event.params
      });
    });

    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'remote-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: 'hello'
            }
          }
        }
      })
    );

    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'remote-1',
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: [
              {
                name: 'review',
                description: 'review code'
              }
            ]
          }
        }
      })
    );

    expect(seen[0]).toEqual({
      method: 'session/message',
      params: {
        sessionId: 'remote-1',
        content: 'hello',
        isStreaming: true
      }
    });
    expect(seen[1]).toEqual({
      method: 'available_commands_update',
      params: {
        sessionId: 'remote-1',
        commands: [{ name: 'review', description: 'review code' }]
      }
    });
  });

  it('handles permission requests and responds with selected option', async () => {
    const proc = new FakeProcess();
    const bridge = new AcpBridge(proc);
    const seen: Array<{ method: string; params?: Record<string, unknown> }> = [];

    bridge.onEvent((event) => {
      seen.push({ method: event.method, params: event.params });
    });

    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'perm-1',
        method: 'session/request_permission',
        params: {
          sessionId: 'remote-1',
          toolCall: {
            title: 'Write file',
            kind: 'edit',
            locations: [{ path: '/tmp/a.ts' }]
          },
          options: [
            { optionId: 'allow_1', kind: 'allow_once', name: 'Allow once' },
            { optionId: 'reject_1', kind: 'reject_once', name: 'Deny once' }
          ]
        }
      })
    );

    expect(seen[0]).toEqual({
      method: 'permission/request',
      params: {
        sessionId: 'remote-1',
        id: 'perm-1',
        description: 'Write file',
        action: 'edit',
        filePath: '/tmp/a.ts'
      }
    });

    await bridge.respondPermission('perm-1', true);
    const response = JSON.parse(proc.writes[0] ?? '{}');
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'perm-1',
      result: {
        outcome: {
          outcome: 'selected',
          optionId: 'allow_1'
        }
      }
    });

    proc.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'perm-2',
        method: 'session/request_permission',
        params: {
          sessionId: 'remote-1',
          toolCall: {
            title: 'Delete file',
            kind: 'delete'
          },
          options: [
            { optionId: 'allow_2', kind: 'allow_once', name: 'Allow once' },
            { optionId: 'reject_2', kind: 'reject_once', name: 'Deny once' }
          ]
        }
      })
    );

    await bridge.respondPermission('perm-2', false);
    const denyResponse = JSON.parse(proc.writes[1] ?? '{}');
    expect(denyResponse).toEqual({
      jsonrpc: '2.0',
      id: 'perm-2',
      result: {
        outcome: {
          outcome: 'selected',
          optionId: 'reject_2'
        }
      }
    });
  });
});
