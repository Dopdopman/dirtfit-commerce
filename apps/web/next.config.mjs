/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_OUTPUT_STANDALONE === 'true' || process.platform !== 'win32'
    ? { output: 'standalone' }
    : {}),
  transpilePackages: ['@dirtfit/ergonomics-engine', '@dirtfit/shared'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
