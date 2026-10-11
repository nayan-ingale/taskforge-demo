import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite loads its WASM and data files from its own package directory at runtime,
  // so it must not be bundled into the server build.
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: { root: import.meta.dirname },
};

export default config;
