/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Lets two builds/dev servers run side by side without sharing .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
