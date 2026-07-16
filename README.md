# CmSports

Plataforma de gestión para clubes de tenis de mesa: jugadores, clases, torneos, asistencia, mensualidades y finanzas. Multi-club, con 4 roles de usuario (superadmin, admin, profesor, jugador).

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Supabase** (PostgreSQL + Auth + Row Level Security)
- **Tailwind CSS 4**
- TypeScript estricto, validación con **Zod**
- Deploy en **Vercel**

## Requisitos

- Node.js 20+
- Un proyecto de Supabase (con las migraciones de `supabase/migrations/` aplicadas)

## Instalación

```bash
npm install
cp .env.local.example .env.local
```

Completa `.env.local` con tus credenciales (ver variables abajo) y luego:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Requerida | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave pública (anon) de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Clave de servicio — solo se usa en el servidor (invitaciones de usuarios, Server Actions administrativas). Nunca debe exponerse al cliente |
| `NEXT_PUBLIC_APP_URL` | Sí | URL pública de la aplicación; se usa para los enlaces seguros de invitación y recuperación |
| `OPENAI_API_KEY` | Opcional | Generación de flyers con IA (`/api/generar-flyer-ia`) |
| `RESEND_API_KEY` | Opcional | Envío de emails de monitoreo (`/api/monitor-email`) |
| `VERCEL_MONITOR_TOKEN` | Opcional | Autenticación del endpoint de monitoreo |

## Estructura del proyecto

```
src/
├── app/                # Páginas (App Router) y Server Actions (src/app/actions/)
├── components/ui/      # Componentes reutilizables
├── lib/
│   ├── supabase/       # Clientes SSR (server.ts, client.ts, proxy.ts)
│   ├── domain/         # Lógica de negocio pura (finanzas.ts, torneos.ts)
│   └── validations/    # Esquemas Zod
├── types/database.ts   # Tipos generados de Supabase
└── proxy.ts            # Protección de rutas por rol
supabase/migrations/    # SQL: RLS, esquema y funciones
```

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run start    # servidor de producción
npm run lint     # eslint
```

## Deploy

El deploy a Vercel es automático en cada push a `main`.
