import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be a 64-char hex string (256-bit)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Returns a Buffer: [12-byte IV][ciphertext][16-byte auth tag]
 */
export function encryptToken(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Decrypt a token encrypted with encryptToken.
 * Expects Buffer format: [12-byte IV][ciphertext][16-byte auth tag]
 */
export function decryptToken(data: Buffer): string {
  const key = getKey();

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}
