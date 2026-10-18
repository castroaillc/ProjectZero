import { resolve } from "node:path";
import type { NextConfig } from "next";

const apiOrigin = `http://localhost:${process.env.API_PORT ?? 3001}`;

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@projectzero/ui-web", "@projectzero/api-client"],
  turbopack: { root: resolve(import.meta.dirname, "../..") },
  // Proxy auth and API calls so the browser only talks to this origin: cookies stay first-party
  // and no CORS is needed. In production, route these paths to the API at the edge instead.
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
      { source: "/v1/:path*", destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};

export default config;
