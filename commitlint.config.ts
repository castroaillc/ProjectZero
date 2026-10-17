import type { UserConfig } from "@commitlint/types";

// Scopes must be a workspace package name (e.g. `feat(api): …`) or one of the repo-level extras below.
const config: UserConfig = {
  extends: ["@commitlint/config-conventional", "@commitlint/config-pnpm-scopes"],
  rules: {
    "scope-enum": async (ctx) => {
      const { rules } = (await import("@commitlint/config-pnpm-scopes")).default;
      const [level, applicable, scopes] = await rules["scope-enum"](ctx);
      return [level, applicable, [...scopes, "repo", "deps", "ci", "docs", "release"]];
    },
  },
};

export default config;
