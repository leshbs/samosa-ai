import path from 'node:path'
import bundleAnalyzer from '@next/bundle-analyzer'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the tracing root: a lockfile higher up the tree would otherwise be
  // inferred as the workspace root on Windows dev machines.
  outputFileTracingRoot: path.join(__dirname),
  // Keep heavy server-only deps out of the client bundle.
  serverExternalPackages: ['openai', 'xlsx'],
  /**
   * Rewrites barrel imports to deep ones at build time. These four are all
   * re-export barrels: `import { LineChart } from 'recharts'` otherwise pulls
   * the module graph for every chart type recharts ships, and date-fns pulls
   * every locale. lucide-react is on Next's default list already; it is repeated
   * here so the set is visible in one place rather than half-inherited.
   */
  experimental: {
    optimizePackageImports: ['recharts', 'motion', 'date-fns', 'lucide-react'],
  },
  eslint: {
    dirs: ['app', 'components', 'lib', 'modules', 'tests'],
  },
  /**
   * The PDF library runs in the browser only (ADR-0014), behind an `import()`
   * in a click handler. The server build still follows that import, and file
   * tracing then ships the library with every function that renders the
   * button: measured, the report page's function was 9.5 MB with it and is
   * 5.4 MB without. So the server build is told to skip the one file that
   * imports the library — components/reports/pdf/report-pdf.tsx. The server
   * never calls it, so nothing is lost. (Aliasing the package itself does not
   * work: Next treats it as a server external before any alias is consulted.)
   */
  webpack(config, { isServer, webpack }) {
    if (isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /pdf\/report-pdf$/ }),
      )
    }
    return config
  },
  /**
   * The constant half of the security headers. The Content-Security-Policy is
   * not here — it carries a per-request nonce, so `middleware.ts` sets it.
   * These are static, and putting them here means they also cover the paths
   * the middleware matcher skips (`_next/static`, images).
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Belt to the CSP's `frame-ancestors` braces, for older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stops a CSV export being re-interpreted as HTML and run.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Ignored over plain HTTP, so it is harmless in local development.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

/** `pnpm analyze` opens the treemap; a normal build is untouched. */
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

export default withBundleAnalyzer(nextConfig)
