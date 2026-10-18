import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export interface InstallState {
  organizationId: string;
  userId: string;
}

const TTL_MS = 15 * 60 * 1000;

/**
 * The `state` passed through GitHub's install flow: who started it and for which organization,
 * HMAC-signed and short-lived, so a callback can't be forged or replayed into another account.
 */
export class InstallStateSigner {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync("sha256", secret, "", "projectzero:github-install-state", 32));
  }

  sign(state: InstallState, now = Date.now()): string {
    const payload = Buffer.from(
      JSON.stringify({
        o: state.organizationId,
        u: state.userId,
        e: now + TTL_MS,
        n: randomBytes(8).toString("hex"),
      }),
    ).toString("base64url");
    return `${payload}.${this.mac(payload)}`;
  }

  /** The signed state, or null if it's malformed, tampered with or expired. */
  verify(token: string, now = Date.now()): InstallState | null {
    const [payload, mac] = token.split(".");
    if (!payload || !mac) return null;
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const { o, u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof o !== "string" || typeof u !== "string" || typeof e !== "number" || e < now)
        return null;
      return { organizationId: o, userId: u };
    } catch {
      return null;
    }
  }

  private mac(payload: string): string {
    return createHmac("sha256", this.key).update(payload).digest("base64url");
  }
}
