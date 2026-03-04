import crypto from 'node:crypto';
import { TOKEN_TTL_MS } from '@acpilot/shared';

interface TokenPayload {
  iat: number;
  exp: number;
  nonce: string;
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value: string): TokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TokenPayload;
    if (
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.nonce !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function parseToken(token: string): { payload: TokenPayload; signed: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    return null;
  }
  const payload = decodePayload(payloadPart);
  if (!payload) {
    return null;
  }
  return { payload, signed: `${payloadPart}.${signaturePart}` };
}

export function generateToken(secret: string): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const payloadPart = encodePayload({
    iat: issuedAt,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('hex')
  });
  const signature = sign(payloadPart, secret);
  return {
    token: `${payloadPart}.${signature}`,
    expiresAt
  };
}

export function verifyToken(
  token: string,
  secret: string
): { valid: boolean; expired: boolean } {
  const parsed = parseToken(token);
  if (!parsed) {
    return { valid: false, expired: false };
  }

  const [payloadPart, signaturePart] = parsed.signed.split('.');
  if (!payloadPart || !signaturePart) {
    return { valid: false, expired: false };
  }
  const expected = sign(payloadPart, secret);
  if (expected !== signaturePart) {
    return { valid: false, expired: false };
  }

  const now = Date.now();
  if (parsed.payload.exp <= now) {
    return { valid: false, expired: true };
  }
  return { valid: true, expired: false };
}

export function refreshToken(
  oldToken: string,
  secret: string
): { token: string; expiresAt: number } {
  const parsed = parseToken(oldToken);
  if (!parsed) {
    throw new Error('invalid token');
  }
  const [payloadPart, signaturePart] = oldToken.split('.');
  if (!payloadPart || !signaturePart || sign(payloadPart, secret) !== signaturePart) {
    throw new Error('invalid token');
  }
  return generateToken(secret);
}
