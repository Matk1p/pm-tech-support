/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode for Lark SDK compatibility
  reactStrictMode: false,
  
  // API routes configuration
  async rewrites() {
    return [
      {
        source: '/webhook',
        destination: '/api/lark/events',
      },
      {
        source: '/health',
        destination: '/api/health',
      }
    ];
  },

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Experimental features
  experimental: {
    // Enable server actions for better performance
    serverActions: true,
  },

  // Webpack configuration for Node.js modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Handle Node.js modules in server environment
      config.externals = [...config.externals, 'canvas', 'jsdom'];
    }
    return config;
  },

  // Image optimization (if needed)
  images: {
    domains: ['lark.com', 'feishu.cn'],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig; 