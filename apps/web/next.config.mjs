/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@dirtfit/ergonomics-engine', '@dirtfit/shared'],
};

export default nextConfig;
