/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  output: "standalone",
  compress: true,
  experimental: { optimizePackageImports: [] }
};
export default nextConfig;
