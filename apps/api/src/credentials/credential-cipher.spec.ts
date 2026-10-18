import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialCipher, hintFor } from "./credential-cipher";

const owner = { userId: "u1", name: "GITHUB_TOKEN" };

describe("CredentialCipher", () => {
  it("round-trips and never stores the plaintext", () => {
    const cipher = new CredentialCipher({ fallbackSecret: "s" });
    const sealed = cipher.seal("ghp_secret", owner);
    expect(sealed).toMatch(/^v1:/);
    expect(sealed).not.toContain("ghp_secret");
    expect(cipher.open(sealed, owner)).toBe("ghp_secret");
  });

  it("uses a fresh IV each time", () => {
    const cipher = new CredentialCipher({ fallbackSecret: "s" });
    expect(cipher.seal("x", owner)).not.toBe(cipher.seal("x", owner));
  });

  it("refuses ciphertext moved to another user or name", () => {
    const cipher = new CredentialCipher({ fallbackSecret: "s" });
    const sealed = cipher.seal("x", owner);
    expect(() => cipher.open(sealed, { ...owner, userId: "u2" })).toThrow();
    expect(() => cipher.open(sealed, { ...owner, name: "OTHER" })).toThrow();
  });

  it("refuses a different key", () => {
    const sealed = new CredentialCipher({ fallbackSecret: "a" }).seal("x", owner);
    expect(() => new CredentialCipher({ fallbackSecret: "b" }).open(sealed, owner)).toThrow();
    const key = randomBytes(32).toString("base64");
    const withKey = new CredentialCipher({ key, fallbackSecret: "a" });
    expect(() => withKey.open(sealed, owner)).toThrow();
    expect(withKey.open(withKey.seal("y", owner), owner)).toBe("y");
  });
});

describe("hintFor", () => {
  it("shows the last four characters of long values only", () => {
    expect(hintFor("sk-ant-0123456789abcd")).toBe("abcd");
    expect(hintFor("short")).toBe("");
  });
});
