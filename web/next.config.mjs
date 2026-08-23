import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives in a subdirectory of a monorepo that also has its own
  // package-lock.json (the CLI at the repo root) — pin the trace root so
  // Next.js doesn't guess and warn about it.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
