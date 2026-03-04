import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { AcpBridge } from '../src/agent/acp-bridge.js';
class FakeProcess extends EventEmitter {
    writes = [];
    writeRaw(line) {
        this.writes.push(line);
    }
    emitStdout(line) {
        this.emit('stdout:line', line);
    }
    emitStderr(line) {
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
        proc.emitStdout(JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: { capabilities: { supportsResume: true } }
        }));
        const response = await promise;
        expect(response.result).toEqual({ capabilities: { supportsResume: true } });
    });
    it('forwards notification events and stores stderr logs', () => {
        const proc = new FakeProcess();
        const bridge = new AcpBridge(proc);
        const seen = [];
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
        proc.emitStdout(JSON.stringify({
            jsonrpc: '2.0',
            id: initReq.id,
            result: { capabilities: { configOptions: [{ name: 'model', type: 'enum', values: ['gpt'] }] } }
        }));
        const capabilities = await initPromise;
        expect(capabilities.configOptions?.[0]?.name).toBe('model');
        const newPromise = bridge.sessionNew('/tmp/project', { model: 'gpt' });
        const newReq = JSON.parse(proc.writes[1]);
        expect(newReq.method).toBe('session/new');
        proc.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: newReq.id, result: { sessionId: 'remote-1' } }));
        await expect(newPromise).resolves.toEqual({ sessionId: 'remote-1' });
    });
});
