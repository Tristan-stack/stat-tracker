import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class TelegramSessionMasterKeyError extends Error {
  readonly code = 'telegram_session_master_key_error' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TelegramSessionMasterKeyError';
  }
}

export class TelegramSessionDecryptError extends Error {
  readonly code = 'telegram_session_decrypt_error' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TelegramSessionDecryptError';
  }
}

const ALG = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_BYTES = 32;

function getMasterKeyRaw(): Buffer {
  const raw = process.env.TELEGRAM_SESSION_MASTER_KEY?.trim() ?? '';
  if (!raw) {
    throw new TelegramSessionMasterKeyError('TELEGRAM_SESSION_MASTER_KEY manquant.');
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new TelegramSessionMasterKeyError('TELEGRAM_SESSION_MASTER_KEY : base64 invalide.');
  }
  if (buf.length !== KEY_BYTES) {
    throw new TelegramSessionMasterKeyError(
      `TELEGRAM_SESSION_MASTER_KEY doit décodé en ${KEY_BYTES} octets (secret base64 de 32 octets).`
    );
  }
  return buf;
}

/**
 * Chiffre une session GramJS (StringSession.save()) pour stockage Postgres.
 * Format : base64( IV_12 | ciphertext+tag )
 */
export function encryptTelegramSessionString(plainUtf8: string): string {
  const key = getMasterKeyRaw();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(plainUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

export function decryptTelegramSessionString(encoded: string): string {
  const key = getMasterKeyRaw();
  let blob: Buffer;
  try {
    blob = Buffer.from(encoded, 'base64');
  } catch {
    throw new TelegramSessionDecryptError('Payload chiffré illisible (base64).');
  }
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new TelegramSessionDecryptError('Payload trop court.');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);
  try {
    const decipher = createDecipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new TelegramSessionDecryptError('Déchiffrement impossible (clef incorrecte ou données corrompues).');
  }
}
