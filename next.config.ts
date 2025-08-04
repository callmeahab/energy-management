import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile packages for both Webpack and Turbopack
  transpilePackages: ['react-map-gl'],

  // External packages that should only run on server (Next.js 15)
  serverExternalPackages: [
    'duckdb',
    '@mapbox/node-pre-gyp',
    'node-gyp',
    'prebuild-install'
  ],

  // Webpack configuration for production builds and DuckDB handling
  webpack: (config, { isServer }) => {
    // Client-side configuration
    if (!isServer) {
      // Prevent DuckDB and its dependencies from being bundled client-side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        path: false,
        crypto: false,
        os: false,
        child_process: false,
      };

      // Exclude all DuckDB-related modules from client bundle
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          'duckdb': false,
          '@mapbox/node-pre-gyp': false,
          'node-gyp': false,
          'prebuild-install': false,
        });
      }
    }

    // Ignore problematic files that DuckDB dependencies try to import
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.html$/,
      use: 'ignore-loader',
    });
    config.module.rules.push({
      test: /\.cs$/,
      use: 'ignore-loader', 
    });

    return config;
  },

  // Turbopack configuration (Note: serverExternalPackages handles DuckDB exclusion)
  turbopack: {
    rules: {
      '*.html': {
        loaders: ['ignore-loader'],
      },
      '*.cs': {
        loaders: ['ignore-loader'],
      },
    },
  },
};

export default nextConfig;
