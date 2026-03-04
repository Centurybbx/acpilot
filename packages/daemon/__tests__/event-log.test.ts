import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/session/event-log.js';

describe('event log', () => {
  it('assigns per-session sequence ids and reads deltas', () => {
    const log = new EventLog();

    log.append('s1', {
      type: 'agent:status',
      sessionId: 's1',
      status: 'active'
    });
    log.append('s1', {
      type: 'agent:message',
      sessionId: 's1',
      seq: 0,
      content: { role: 'assistant', content: 'hello' }
    });
    log.append('s2', {
      type: 'agent:status',
      sessionId: 's2',
      status: 'active'
    });

    expect(log.getLatestSeq('s1')).toBe(2);
    expect(log.getLatestSeq('s2')).toBe(1);
    expect(log.getAfter('s1', 1)).toHaveLength(1);
    expect(log.getAfter('s1', 1)[0]?.seq).toBe(2);
    expect(log.getAfter('missing', 0)).toEqual([]);
  });
});
