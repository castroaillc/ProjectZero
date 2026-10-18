import { app, safeStorage } from "electron";
import { existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The Better Auth bearer token, encrypted with the OS keychain (safeStorage) at rest.
const file = () => join(app.getPath("userData"), "session-token.bin");

export function readToken(): string | null {
  if (!existsSync(file()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(file()));
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  writeFileSync(file(), safeStorage.encryptString(token), { mode: 0o600 });
}

export function clearToken(): void {
  rmSync(file(), { force: true });
}
