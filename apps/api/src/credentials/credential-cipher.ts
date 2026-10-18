import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Who a sealed value belongs to: a member's personal credential, or an organization's shared one. */
export interface SealedFor {
  organizationId: string;
  /** Null for a shared credential. */
  userId: string | null;
  name: string;
}

/**
 * Seals credential values with AES-256-GCM. Each value is bound to its owner and name (as
 * additional authenticated data), so a ciphertext copied onto another row fails to open.
 */
export class CredentialCipher {
  private readonly key: Buffer;

  constructor(options: { key?: string; fallbackSecret: string }) {
    this.key = options.key
      ? Buffer.from(options.key, "base64")
      : Buffer.from(
          hkdfSync("sha256", options.fallbackSecret, "", "projectzero:credentials:v1", 32),
        );
  }

  seal(plaintext: string, owner: SealedFor): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(aad(owner));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
  }

  open(sealed: string, owner: SealedFor): string {
    const [version, payload] = sealed.split(":");
    if (version !== VERSION || !payload) throw new Error("Unknown credential format");
    const raw = Buffer.from(payload, "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(aad(owner));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }
}

// Personal credentials keep the `${userId}\0${name}` binding they had before organizations, so
// existing ciphertexts still open; shared ones are bound to the organization instead.
function aad({ organizationId, userId, name }: SealedFor) {
  const owner = userId ?? `org:${organizationId}`;
  return Buffer.from(`${owner}\0${name}`, "utf8");
}

/** Last four characters for display; nothing for short values, where that would leak too much. */
export function hintFor(value: string): string {
  return value.length >= 16 ? value.slice(-4) : "";
}
