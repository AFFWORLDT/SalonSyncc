import { b64url, fromB64url } from "../core/crypto";

/**
 * Encryption at rest for per-org secrets (the WhatsApp access token). AES-GCM 256 with a random 12-byte IV.
 * Format: `v1.<b64url iv>.<b64url ciphertext+tag>`. The key is the Worker secret SECRETS_KEY (standard base64, 32 bytes).
 * Anything unexpected (unknown version, malformed text, wrong key, tampered ciphertext) throws.
 */

async function aesKey(keyB64: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("SECRETS_KEY must be base64");
  }
  if (raw.length !== 32) throw new Error("SECRETS_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const key = await aesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(enc: string, keyB64: string): Promise<string> {
  const parts = enc.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unknown secret version");
  const key = await aesKey(keyB64);
  const iv = fromB64url(parts[1]!);
  if (iv.length !== 12) throw new Error("Malformed secret");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromB64url(parts[2]!));
  return new TextDecoder().decode(pt);
}
