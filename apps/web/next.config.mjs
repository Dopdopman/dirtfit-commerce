function parseRemoteOriginPattern(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.replace(/:$/, '');
    if (protocol !== 'http' && protocol !== 'https') {
      return null;
    }
    return {
      protocol,
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
    };
  } catch {
    return null;
  }
}

const dynamicRemotePatterns = [
  parseRemoteOriginPattern(process.env.NEXT_PUBLIC_CDN_URL),
  parseRemoteOriginPattern(process.env.NEXT_PUBLIC_API_URL),
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_OUTPUT_STANDALONE === 'true' || process.platform !== 'win32'
    ? { output: 'standalone' }
    : {}),
  transpilePackages: ['@dirtfit/ergonomics-engine', '@dirtfit/knowledge', '@dirtfit/shared'],
  outputFileTracingIncludes: {
    '/policies/**': ['../../packages/knowledge/content/**/*.md'],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'cdn.dirtfit.vn' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      ...dynamicRemotePatterns,
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
