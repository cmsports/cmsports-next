@AGENTS.md

# CmSports — Instrucciones para Claude Code

## Qué es este proyecto

CmSports es una plataforma de gestión para un club de tenis de mesa (Club Unión San Bernardo). Permite administrar jugadores, torneos, clases, asistencia, mensualidades y finanzas. Tiene 3 roles de usuario: admin, profesor, jugador.

## Stack técnico

- **Framework**: Next.js 16 (App Router) — IMPORTANTE: `middleware.ts` está deprecado, se usa `proxy.ts` con `export async function proxy()`
- **Frontend**: React 19, Tailwind CSS 4, Lucide React (iconos)
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Tipos**: TypeScript estricto, tipos generados en `src/types/database.ts` (27 tablas)
- **Validación**: Zod (`src/lib/validations/`)
- **Auth**: `@supabase/ssr` con createBrowserClient y createServerClient
- **Deploy**: Vercel
- **Supabase project ref**: `datjbrohbkqduhzjtmwy`

## Estructura clave

```
src/
├── app/                    # Páginas (App Router)
│   ├── actions/            # Server Actions
│   ├── layout-app.tsx      # Layout principal con sidebar
│   ├── login/              # Login con validación Zod
│   ├── registro/           # Registro con Server Action
│   ├── dashboard/          # Dashboard admin
│   ├── jugadores/          # CRUD jugadores + ranking
│   ├── clases/             # Programación de clases
│   ├── torneos/            # Torneos + playoffs
│   ├── finanzas/           # Movimientos financieros
│   └── ...
├── components/
│   ├── ui/                 # Componentes reutilizables (Button, Card, Modal, etc.)
│   └── layout/             # Sidebar, MobileNav
├── lib/
│   ├── supabase/           # Clientes SSR (server.ts, client.ts, proxy.ts)
│   ├── domain/             # Lógica de negocio pura (elo.ts, finanzas.ts, torneos.ts)
│   ├── validations/        # Esquemas Zod
│   ├── config.ts           # Constantes del sistema (ELO, mensualidad, fases, categorías)
│   └── supabase.ts         # Cliente browser legacy (compatibilidad)
├── types/
│   ├── database.ts         # Tipos generados de Supabase (27 tablas)
│   └── index.ts            # Tipos de dominio (Jugador, Torneo, Perfil, etc.)
└── proxy.ts                # Protección de rutas por rol (Next.js 16)
```

## Cómo trabajar en este proyecto

### Hoja de ruta

El plan de mejora está en `PLAN-15-PASOS.md`. Léelo al inicio de cada sesión.

### Progreso actual

- [x] Paso 1 — Tipos generados de Supabase
- [x] Paso 2 — Cliente Supabase SSR + proxy de autenticación
- [x] Paso 3 — Row Level Security (RLS)
- [x] Paso 4 — Sistema de componentes UI base
- [x] Paso 5 — Refactor del layout y navegación
- [x] Paso 6 — Refactor de login + onboarding
- [x] Paso 7 — Capa de dominio (lógica de negocio pura)
- [~] Paso 8 — Refactor del Dashboard admin (parcial: Server Actions, WhatsApp, tendencias; sin Server Component. Refactor visual con StatCard+sparklines REVERTIDO en sesión 2026-06-14 por preferencia de diseño)
- [~] Paso 9 — Refactor de Mensualidades y Finanzas (parcial: pago unificado + SQL generar mensualidades. Refactor visual y tab Presupuesto REVERTIDOS en sesión 2026-06-14)
- [ ] Paso 10 — Refactor de Torneos
- [ ] Paso 11 — Refactor de Jugadores, Clases y Asistencia
- [ ] Paso 12 — Automatizaciones (cron, alertas, WhatsApp)
- [ ] Paso 13 — Perfil del jugador + página pública de torneo
- [ ] Paso 14 — PWA + multi-club
- [ ] Paso 15 — Auditoría final, performance y deploy

### Flujo por sesión

1. La usuaria dice: **"Ejecuta el paso N"**
2. Lee `PLAN-15-PASOS.md` para ver los detalles del paso
3. Ejecuta TODO lo que pide ese paso
4. Al terminar, corre `npx tsc --noEmit` y `npx next build` para validar
5. Marca el paso como `[x]` en este archivo (sección "Progreso actual")
6. NO hagas más de un paso por sesión salvo que la usuaria lo pida

### Reglas de código

- Usar Tailwind CSS 4 con CSS variables del tema (`--purple`, `--bg-card`, `--border`, `--text`, etc.) definidas en `src/app/globals.css`
- Usar componentes de `src/components/ui/` en vez de estilos inline
- Usar iconos de `lucide-react` en vez de emojis
- Usar `@supabase/ssr` (no `createClient` directo de `@supabase/supabase-js`)
- Validar formularios con Zod antes de enviar
- Operaciones sensibles (inserts, updates, deletes) deben ir en Server Actions, no en el cliente
- `tabular-nums` para valores numéricos
- Español en la UI, inglés en el código

### Sobre la usuaria

- Se llama Marcela, es la desarrolladora del proyecto
- Prefiere explicaciones simples y directas
- Trabaja con VS Code → GitHub → Vercel
- Quiere iteraciones paso a paso, un paso por sesión
- No hacer cambios extra fuera del paso actual
