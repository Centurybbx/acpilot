import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AuthState,
  TrustedDevice
} from '@acpilot/shared';

interface StoredDevice extends TrustedDevice {
  secretHash: string;
}

interface AuthStoreData {
  authSecret: string;
  devices: StoredDevice[];
}

export interface ChallengeResult {
  challengeId: string;
  code: string;
  expiresAt: number;
}

interface PendingPairingChallenge {
  challengeId: string;
  code: string;
  expiresAt: number;
  deviceName?: string;
}

export interface DeviceVerificationResult {
  valid: boolean;
  revoked: boolean;
  device?: TrustedDevice;
}

export interface DeviceAuthManagerOptions {
  storePath: string;
  pairingCodeTtlMs: number;
}

export class DeviceAuthManager {
  private storeCache: AuthStoreData | null = null;
  private readonly challenges = new Map<string, PendingPairingChallenge>();

  constructor(private readonly options: DeviceAuthManagerOptions) {}

  async getAuthState(credentials?: {
    deviceId?: string;
    deviceSecret?: string;
  }): Promise<AuthState> {
    const trustedDeviceCount = await this.getTrustedDeviceCount();
    if (!credentials?.deviceId || !credentials.deviceSecret) {
      return {
        paired: false,
        bootstrapRequired: trustedDeviceCount === 0,
        trustedDeviceCount
      };
    }

    const verified = await this.verifyDeviceSession(
      credentials.deviceId,
      credentials.deviceSecret
    );
    if (!verified.valid || !verified.device) {
      return {
        paired: false,
        bootstrapRequired: trustedDeviceCount === 0,
        trustedDeviceCount
      };
    }

    return {
      paired: true,
      bootstrapRequired: false,
      trustedDeviceCount,
      device: verified.device
    };
  }

  async getTrustedDevices(): Promise<TrustedDevice[]> {
    const store = await this.loadStore();
    return store.devices.map((device) => this.toTrustedDevice(device));
  }

  async getTrustedDeviceCount(): Promise<number> {
    const store = await this.loadStore();
    return store.devices.filter((device) => !device.revokedAt).length;
  }

  async createPairingChallenge(deviceName?: string): Promise<ChallengeResult> {
    this.cleanupExpiredChallenges();
    this.challenges.clear();
    const challenge: PendingPairingChallenge = {
      challengeId: crypto.randomUUID(),
      code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
      expiresAt: Date.now() + this.options.pairingCodeTtlMs,
      deviceName: deviceName?.trim() || undefined
    };
    this.challenges.set(challenge.challengeId, challenge);
    return {
      challengeId: challenge.challengeId,
      code: challenge.code,
      expiresAt: challenge.expiresAt
    };
  }

  /** Retrieve the code for a pending challenge. Intended for testing. */
  getChallengeCode(challengeId: string): string | undefined {
    return this.challenges.get(challengeId)?.code;
  }

  async completePairing(
    challengeId: string,
    code: string,
    deviceName?: string
  ): Promise<{ device: TrustedDevice; deviceSecret: string }> {
    this.cleanupExpiredChallenges();
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      throw new Error('pairing challenge not found');
    }
    if (challenge.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      throw new Error('pairing challenge expired');
    }
    if (challenge.code !== code.trim()) {
      throw new Error('pairing code mismatch');
    }

    const store = await this.loadStore();
    const now = Date.now();
    const nextDeviceName =
      deviceName?.trim() || challenge.deviceName || `Device ${store.devices.length + 1}`;
    const deviceSecret = crypto.randomBytes(32).toString('base64url');
    const device: StoredDevice = {
      id: crypto.randomUUID(),
      name: nextDeviceName,
      createdAt: now,
      lastSeenAt: now,
      secretHash: this.hashDeviceSecret(store.authSecret, deviceSecret)
    };

    store.devices.push(device);
    await this.persistStore(store);
    this.challenges.delete(challengeId);

    return {
      device: this.toTrustedDevice(device),
      deviceSecret
    };
  }

  async verifyDeviceSession(
    deviceId: string,
    deviceSecret: string
  ): Promise<DeviceVerificationResult> {
    const store = await this.loadStore();
    const device = store.devices.find((item) => item.id === deviceId);
    if (!device) {
      return { valid: false, revoked: false };
    }
    if (device.revokedAt) {
      return {
        valid: false,
        revoked: true,
        device: this.toTrustedDevice(device)
      };
    }

    const expected = Buffer.from(device.secretHash, 'hex');
    const received = Buffer.from(
      this.hashDeviceSecret(store.authSecret, deviceSecret),
      'hex'
    );
    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return { valid: false, revoked: false };
    }

    device.lastSeenAt = Date.now();
    await this.persistStore(store);
    return {
      valid: true,
      revoked: false,
      device: this.toTrustedDevice(device)
    };
  }

  async revokeDevice(deviceId: string): Promise<TrustedDevice> {
    const store = await this.loadStore();
    const device = store.devices.find((item) => item.id === deviceId);
    if (!device) {
      throw new Error(`trusted device not found: ${deviceId}`);
    }
    if (!device.revokedAt) {
      device.revokedAt = Date.now();
      await this.persistStore(store);
    }
    return this.toTrustedDevice(device);
  }

  private async loadStore(): Promise<AuthStoreData> {
    if (this.storeCache) {
      return this.storeCache;
    }

    try {
      const contents = await readFile(this.options.storePath, 'utf8');
      const parsed = JSON.parse(contents) as Partial<AuthStoreData>;
      if (
        typeof parsed.authSecret === 'string' &&
        Array.isArray(parsed.devices)
      ) {
        this.storeCache = {
          authSecret: parsed.authSecret,
          devices: parsed.devices.filter((item): item is StoredDevice => {
            return (
              typeof item?.id === 'string' &&
              typeof item?.name === 'string' &&
              typeof item?.createdAt === 'number' &&
              typeof item?.lastSeenAt === 'number' &&
              typeof item?.secretHash === 'string'
            );
          })
        };
        return this.storeCache;
      }
    } catch {
      // Fall through and create a fresh auth store.
    }

    this.storeCache = {
      authSecret: crypto.randomBytes(32).toString('hex'),
      devices: []
    };
    await this.persistStore(this.storeCache);
    return this.storeCache;
  }

  private async persistStore(store: AuthStoreData): Promise<void> {
    this.storeCache = store;
    await mkdir(path.dirname(this.options.storePath), { recursive: true });
    await writeFile(
      this.options.storePath,
      JSON.stringify(store, null, 2),
      'utf8'
    );
  }

  private hashDeviceSecret(authSecret: string, deviceSecret: string): string {
    return crypto
      .createHash('sha256')
      .update(`${authSecret}:${deviceSecret}`)
      .digest('hex');
  }

  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [challengeId, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(challengeId);
      }
    }
  }

  private toTrustedDevice(device: StoredDevice): TrustedDevice {
    const { secretHash: _secretHash, ...trustedDevice } = device;
    return trustedDevice;
  }
}
