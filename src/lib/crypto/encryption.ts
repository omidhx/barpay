import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Returns a 32-byte buffer key from environment or fallback for tests.
 */
export function getEncryptionKey(overrideKey?: string): Buffer {
  const envKey = overrideKey || process.env.GATEWAY_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, "hex");
    }
    // If provided as raw 32-character string
    if (Buffer.byteLength(envKey, "utf8") === 32) {
      return Buffer.from(envKey, "utf8");
    }
    // Derive 32 bytes with SHA-256
    return crypto.createHash("sha256").update(envKey).digest();
  }

  // Development/Test fallback key
  const fallback = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  return Buffer.from(fallback, "hex");
}

export interface EncryptedPayload {
  encrypted: true;
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
}

/**
 * Encrypts an object using AES-256-GCM.
 */
export function encryptCredentials(
  data: Record<string, unknown>,
  keyHex?: string
): EncryptedPayload {
  const key = getEncryptionKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const plaintext = JSON.stringify(data);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encrypted: true,
    iv: iv.toString("hex"),
    authTag,
    ciphertext,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to an object.
 */
export function decryptCredentials<T = Record<string, unknown>>(
  payload: unknown,
  keyHex?: string
): T {
  if (!payload || typeof payload !== "object") {
    throw new Error("INVALID_ENCRYPTED_PAYLOAD: Payload must be an object.");
  }

  const p = payload as Partial<EncryptedPayload>;
  if (!p.encrypted || !p.iv || !p.authTag || !p.ciphertext) {
    // If not encrypted, return as is (for backwards compatibility in mock/dev)
    return payload as T;
  }

  const key = getEncryptionKey(keyHex);
  const iv = Buffer.from(p.iv, "hex");
  const authTag = Buffer.from(p.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(p.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted) as T;
}
