import { defineConfig } from "tsup";

// Clean only for one-off builds. In watch mode tsup writes JS before declarations, so cleaning
// would leave dist/ without .d.ts for a moment and the API's type checker would report TS7016.
export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: !options.watch,
  sourcemap: true,
}));
