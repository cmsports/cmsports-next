import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // `/object/**` y no `/object/public/**`: desde la 238 la bibliografía vive
      // en un bucket privado y se sirve con URL firmadas, que van por
      // `/object/sign/...`. Con el patrón viejo `next/image` las rechazaba y los
      // thumbnails salían rotos, mientras el visor —un `<img>` pelado, sin
      // optimizador— las mostraba bien. Sigue siendo un solo host, el nuestro.
      { protocol: 'https', hostname: 'datjbrohbkqduhzjtmwy.supabase.co', pathname: '/storage/v1/object/**' },
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
      // dynamic estuvo en 0 —Router Cache apagado—, y eso significaba que
      // cambiar de módulo y volver volvía a pedir el payload RSC al servidor,
      // pagando otra vez el proxy entero. El prefetch de los <Link> del
      // sidebar tampoco servía de nada: lo que traía se descartaba al instante.
      //
      // Con 30 eso deja de pasar, y acá no arriesga mostrar datos viejos
      // porque el payload RSC de esta app no lleva datos: las pantallas son
      // client components y piden todo al navegador al montarse (la única
      // página servidor es /clases, que solo redirige). Al volver a una ruta el
      // componente se monta de nuevo y sus efectos vuelven a consultar; lo
      // único que se reutiliza es el armazón.
      //
      // El `no-store` de los headers se queda como está: ese cubre el deploy
      // nuevo tapado por HTML viejo, que es otra cosa, y sigue respaldado
      // además por el chequeo de NEXT_PUBLIC_BUILD_TIME en layout-app.tsx.
      dynamic: 30,
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
