/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Next 16 otomatis bikin AGENTS.md; matiin biar repo tetap bersih.
  agentRules: false,
};

export default nextConfig;
