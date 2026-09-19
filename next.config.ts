import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the tracing root: a lockfile higher up the tree would otherwise be
  // inferred as the workspace root on Windows dev machines.
  outputFileTracingRoot: path.join(__dirname),
  // Keep heavy server-only deps out of the client bundle.
  serverExternalPackages: ['openai', 'xlsx'],
  eslint: {
    dirs: ['app', 'components', 'lib', 'modules', 'tests'],
  },
}

export default nextConfig
