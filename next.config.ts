import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const r2HostnameFromBaseUrl = (() => {
  const baseUrl = process.env.R2_PUBLIC_BASE || '';

  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Isolate visual tests from an already-running developer workspace.
  distDir: process.env.ADMIN_DESIGN_PREVIEW === '1' ? '.next-admin-design' : '.next',
  ...(process.env.ADMIN_DESIGN_PREVIEW === '1' ? { devIndicators: false as const } : {}),
  outputFileTracingIncludes: {
    '/api/admin/reservas/*/voucher': ['./public/images/logo.png'],
    '/api/cron/email': ['./public/images/logo.png'],
    '/api/cron/emails': ['./public/images/logo.png'],
    '/api/admin/emails': ['./public/images/logo.png'],
    '/api/admin/reservas': ['./public/images/logo.png'],
    '/api/admin/ventas': ['./public/images/logo.png'],
    '/api/admin/finanzas': ['./ejemplos/*.xlsx'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: '**.r2.dev',
      },
      ...(r2HostnameFromBaseUrl
        ? [
            {
              protocol: 'https' as const,
              hostname: r2HostnameFromBaseUrl,
            },
          ]
        : []),
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 año
  },
  // Configuración para uploads grandes
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Optimizar compilación para navegadores modernos
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', '@phosphor-icons/react'],
  },
  // Configuración de transpilación para reducir JavaScript antiguo
  transpilePackages: [],
  // Optimización de compilación - reducir transpilación para navegadores modernos
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // Configuración de webpack para optimizar polyfills
  webpack: (config, { isServer }) => {
    // Reducir polyfills innecesarios
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
