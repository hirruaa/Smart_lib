/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
  async redirects() {
    return [{ source: '/study', destination: '/dashboard', permanent: false }]
  },
  webpack(config) {
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      canvas: false,
      path: false,
      os: false,
    }
    return config
  },
}

module.exports = nextConfig
