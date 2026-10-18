import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

export default defineConfig({
  main: { define: { __API_URL__: JSON.stringify(apiUrl) } },
  // Sandboxed preloads must be CommonJS.
  preload: {
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    // Must match an origin the API trusts (see apps/api/src/config/env.ts).
    server: { port: Number(process.env.DESKTOP_RENDERER_PORT ?? 5173), strictPort: true },
    define: { __API_URL__: JSON.stringify(apiUrl) },
    plugins: [react(), tailwindcss()],
  },
});
