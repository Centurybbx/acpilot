import type { WsMessage } from '@acpilot/shared';

export interface IndexedEvent {
  seq: number;
  timestamp: number;
  message: WsMessage;
}

export class EventLog {
  private readonly events = new Map<string, IndexedEvent[]>();

  append(sessionId: string, message: WsMessage): number {
    const existing = this.events.get(sessionId) ?? [];
    const seq = existing.length + 1;
    const normalized = { ...message, seq } as WsMessage;
    existing.push({
      seq,
      timestamp: Date.now(),
      message: normalized
    });
    this.events.set(sessionId, existing);
    return seq;
  }

  getAfter(sessionId: string, afterSeq: number): IndexedEvent[] {
    const existing = this.events.get(sessionId) ?? [];
    return existing.filter((item) => item.seq > afterSeq);
  }

  getLatestSeq(sessionId: string): number {
    const existing = this.events.get(sessionId);
    if (!existing || existing.length === 0) {
      return 0;
    }
    return existing[existing.length - 1]!.seq;
  }
}
