import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateToken, refreshToken, verifyToken } from '../src/auth/token.js';

describe('token', () => {
  const secret = 'top-secret';

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates a token with 60 minute ttl and verifies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T00:00:00.000Z'));

    const result = generateToken(secret);
    expect(result.expiresAt).toBe(Date.now() + 60 * 60 * 1000);

    const verified = verifyToken(result.token, secret);
    expect(verified).toEqual({ valid: true, expired: false });
  });

  it('reports expired tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T00:00:00.000Z'));

    const result = generateToken(secret);
    vi.setSystemTime(new Date('2026-03-04T01:01:00.000Z'));

    const verified = verifyToken(result.token, secret);
    expect(verified).toEqual({ valid: false, expired: true });
  });

  it('refreshes a valid token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T00:00:00.000Z'));

    const initial = generateToken(secret);
    vi.setSystemTime(new Date('2026-03-04T00:40:00.000Z'));

    const refreshed = refreshToken(initial.token, secret);

    expect(refreshed.token).not.toBe(initial.token);
    expect(refreshed.expiresAt).toBe(Date.now() + 60 * 60 * 1000);
    expect(verifyToken(refreshed.token, secret)).toEqual({ valid: true, expired: false });
  });

  it('rejects refresh for invalid signature', () => {
    expect(() => refreshToken('bad.token.value', secret)).toThrow(/invalid token/i);
  });
});
