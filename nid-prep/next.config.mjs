/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};
export default nextConfig;
