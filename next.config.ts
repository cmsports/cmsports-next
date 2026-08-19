import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'datjbrohbkqduhzjtmwy.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  env: {
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    staleTimes: {
      // static: 0 es inválido (mínimo 30) y Next lo ignoraba cayendo al
      // default de 300s — cinco minutos de HTML viejo, lo contrario de la
      // intención. 30 es lo más fresco que la config permite.
      dynamic: 0,
      static: 30,
    },
  },
  // Sin esto, Turbopack adivina la raíz por los lockfiles y encuentra el de
  // C:\Users\Benja primero: warning en cada arranque y resolución más lenta.
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      // La vitrina quedó en /; el link viejo del PR de preview sigue funcionando.
      { source: '/vitrina', destination: '/', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        // sw.js: nunca cachear para que el SW nuevo active de inmediato
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        // Páginas de la app: no guardar en CDN de Vercel ni en browser.
        // Evita que un deploy nuevo quede opacado por el HTML del anterior.
        source: '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // org/project/authToken se toman de variables de entorno en el build.
  // Sin ellas, el build funciona igual (solo se omite la subida de source maps).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
