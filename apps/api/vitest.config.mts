import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC (not esbuild) so Nest's decorator metadata is emitted, matching the production build.
const plugins = [swc.vite({ module: { type: "es6" } })];

export default defineConfig({
  test: {
    projects: [
      { plugins, test: { name: "unit", include: ["src/**/*.spec.ts"], environment: "node" } },
      {
        plugins,
        test: {
          name: "e2e",
          include: ["test/**/*.e2e-spec.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
