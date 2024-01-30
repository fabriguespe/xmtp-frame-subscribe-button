/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // tell webpack to load WASM files as an asset resource
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });
    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
