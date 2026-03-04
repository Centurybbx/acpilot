import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { EventLog } from '../src/session/event-log.js';
import { WsHandler } from '../src/ws/handler.js';
class FakeSocket extends EventEmitter {
    messages = [];
    closed = false;
    send(data) {
        this.messages.push(data);
    }
    close() {
        this.closed = true;
    }
}
describe('ws handler', () => {
    it('replays missed events on session resume', async () => {
        const eventLog = new EventLog();
        eventLog.append('s1', {
            type: 'agent:status',
            sessionId: 's1',
            status: 'active'
        });
        const manager = {
            handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
            getEventLog: () => eventLog
        };
        const handler = new WsHandler({
            sessionManager: manager,
            verifyToken: () => ({ valid: true, expired: false })
        });
        const ws = new FakeSocket();
        handler.handleConnection(ws, { url: '/ws?token=abc' });
        ws.emit('message', JSON.stringify({ type: 'session:resume', sessionId: 's1', lastSeq: 0 }));
        expect(ws.messages).toHaveLength(1);
        expect(JSON.parse(ws.messages[0]).type).toBe('agent:status');
    });
    it('forwards permission responses to session manager', async () => {
        const manager = {
            handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
            getEventLog: () => new EventLog()
        };
        const handler = new WsHandler({
            sessionManager: manager,
            verifyToken: () => ({ valid: true, expired: false })
        });
        const ws = new FakeSocket();
        handler.handleConnection(ws, { url: '/ws?token=abc' });
        ws.emit('message', JSON.stringify({
            type: 'permission:response',
            sessionId: 's1',
            requestId: 'p1',
            approved: true
        }));
        await Promise.resolve();
        expect(manager.handlePermissionResponse).toHaveBeenCalledWith('s1', 'p1', true);
    });
});
