import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decryptTelegramSessionString,
  encryptTelegramSessionString,
  TelegramSessionDecryptError,
  TelegramSessionMasterKeyError,
} from './telegram-session-crypto';

describe('telegram-session-crypto', () => {
  const snapshotAtLoad = process.env.TELEGRAM_SESSION_MASTER_KEY;

  beforeAll(() => {
    process.env.TELEGRAM_SESSION_MASTER_KEY = randomBytes(32).toString('base64');
  });

  afterAll(() => {
    if (snapshotAtLoad === undefined) delete process.env.TELEGRAM_SESSION_MASTER_KEY;
    else process.env.TELEGRAM_SESSION_MASTER_KEY = snapshotAtLoad;
  });

  it('round-trips UTF-8 session string', () => {
    const plain = '1AgAStatTrackerSession-test-utf8';
    const enc = encryptTelegramSessionString(plain);
    expect(enc).not.toContain(plain);
    expect(decryptTelegramSessionString(enc)).toBe(plain);
  });

  it('rejects ciphertext sealed with another key', () => {
    const saved = process.env.TELEGRAM_SESSION_MASTER_KEY;
    const enc = encryptTelegramSessionString('secret');
    process.env.TELEGRAM_SESSION_MASTER_KEY = randomBytes(32).toString('base64');
    expect(() => decryptTelegramSessionString(enc)).toThrow(TelegramSessionDecryptError);
    process.env.TELEGRAM_SESSION_MASTER_KEY = saved;
  });

  it('encrypt fails when TELEGRAM_SESSION_MASTER_KEY is unset', () => {
    const saved = process.env.TELEGRAM_SESSION_MASTER_KEY;
    delete process.env.TELEGRAM_SESSION_MASTER_KEY;
    expect(() => encryptTelegramSessionString('x')).toThrow(TelegramSessionMasterKeyError);
    process.env.TELEGRAM_SESSION_MASTER_KEY = saved;
  });
});
