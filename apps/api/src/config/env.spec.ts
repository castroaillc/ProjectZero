import { describe, expect, it } from "vitest";
import { parseEnv, trustedOrigins } from "./env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  BETTER_AUTH_SECRET: "s",
  BETTER_AUTH_URL: "http://localhost:3001",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.TRUSTED_ORIGINS).toEqual([]);
  });

  it("coerces ports and splits trusted origins", () => {
    const env = parseEnv({
      ...base,
      API_PORT: "4000",
      TRUSTED_ORIGINS: "https://a.dev, https://b.dev",
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.TRUSTED_ORIGINS).toEqual(["https://a.dev", "https://b.dev"]);
  });

  it("names every invalid variable", () => {
    expect(() => parseEnv({ BETTER_AUTH_URL: "nope" })).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET|BETTER_AUTH_SECRET[\s\S]*DATABASE_URL/,
    );
  });
});

describe("trustedOrigins", () => {
  it("includes the web and desktop dev origins plus extras", () => {
    const env = parseEnv({
      ...base,
      WEB_PORT: "3010",
      DESKTOP_RENDERER_PORT: "5183",
      TRUSTED_ORIGINS: "https://x.dev",
    });
    expect(trustedOrigins(env)).toEqual([
      "http://localhost:3010",
      "http://localhost:5183",
      "app://projectzero",
      "https://x.dev",
    ]);
  });
});
