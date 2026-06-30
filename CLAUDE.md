@AGENTS.md

# CmSports — Instrucciones para Claude Code

> Contexto permanente del proyecto. Mantener de alta señal (< 200 líneas).
> **Antes de confiar en esto, verifica contra el código real**: si algo no calza con el repo, gana el repo y avísame para corregir este archivo.

## Qué es el proyecto

CmSports es un SaaS deportivo multi-club para administrar competencias y ligas (piloto: tenis de mesa). Primer club activo: **Club Paine**; segundo próximo: **Club Unión San Bernardo**. Módulos: jugadores, torneos, liga, clases, asistencia, mensualidades, finanzas. Roles: superadmin, admin, profesor, jugador.

## Stack técnico

- **Framework**: Next.js 16 (App Router) — `middleware.ts` deprecado, se usa `proxy.ts` con `export async function proxy()`
- **Frontend**: React 19, Tailwind CSS 4 (CSS variables en `src/app/globals.css`), Lucide React
- **Componentes UI**: propios en `src/components/ui/` (Button, Card, Modal, etc.)
- **Backend**: Supabase (PostgreSQL + Auth + RLS) — project ref: `datjbrohbkqduhzjtmwy`
- **Tipos**: TypeScript estricto, generados en `src/types/database.ts` (27 tablas)
- **Validación**: Zod (`src/lib/validations/`)
- **Auth**: `@supabase/ssr` con `createBrowserClient` / `createServerClient`
- **Deploy**: Vercel

## Estructura clave

```
src/
├── app/                    # Páginas (App Router)
│   ├── actions/            # Server Actions (mutaciones sensibles)
│   ├── layout-app.tsx      # Layout principal con sidebar
│   ├── dashboard/          # Dashboard admin
│   ├── jugadores/          # CRUD jugadores + ranking
│   ├── torneos/            # Torneos + playoffs
│   ├── liga/               # Módulo Liga (en construcción)
│   ├── finanzas/           # Movimientos financieros
│   └── ...
├── components/ui/          # Componentes reutilizables
├── lib/
│   ├── supabase/           # Clientes SSR (server.ts, client.ts, proxy.ts)
│   ├── domain/             # Lógica de negocio pura (elo.ts, finanzas.ts, torneos.ts)
│   ├── validations/        # Esquemas Zod
│   └── config.ts           # Constantes del sistema
├── types/
│   ├── database.ts         # Tipos generados de Supabase
│   └── index.ts            # Tipos de dominio
├── proxy.ts                # Protección de rutas por rol
supabase/migrations/        # Migraciones SQL
```

## Convenciones (reglas, no sugerencias)

- **Mutaciones**: siempre en Server Actions (`src/app/actions/`), nunca directo desde el cliente.
- **Cliente Supabase**: usar `src/lib/supabase/client.ts` (browser) o `src/lib/supabase/server.ts` (server). No instanciar clientes ad hoc.
- **Auth**: obtener perfil vía Supabase Auth + RLS; rutas protegidas por `proxy.ts`.
- **Estilos**: CSS variables del tema (`--purple`, `--bg-card`, `--border`, `--text`, etc.). Reutilizar componentes de `src/components/ui/` antes de crear nuevos.
- **Iconos**: Lucide React, no emojis.
- **Formularios**: validar con Zod antes de enviar.
- **Números**: clase `tabular-nums`.
- **Idioma**: UI en español, código en inglés.
- **Nombres de tablas/columnas**: snake_case; revisar `supabase/migrations/` antes de nombrar.

## Reglas inquebrantables de trabajo

1. **Explorar antes de codear.** Para cambios no triviales, mapear el código afectado y proponer plan antes de implementar.
2. **Cero suposiciones.** Si un nombre de tabla/ruta/función no está confirmado en el código, preguntar, no inventar.
3. **No destructivo.** Nada de borrar datos o esquema sin confirmación explícita. Preferir soft delete.
4. **Integridad en la base de datos**, no solo en UI: reglas críticas con constraints/triggers en Postgres.
5. **Reutilizar, no duplicar.** Toda feature nueva debe sentirse parte de la app existente.
6. **Trabajar por fases verificables** y detenerse para revisión entre fases.
7. **No tocar otros módulos** (especialmente Finanzas) fuera de la integración acordada.

## Módulo Liga (en construcción)

- Especificación completa: ver `prompt-modulo-liga-v2.md`.
- Principio rector: **eficiencia operacional > equilibrio**.
- Garantía no negociable: **imposible perder datos** (soft delete, auditoría, constraints, bloqueo optimista).
- Integración con Finanzas: pago de jugador → ingreso en Finanzas (nombre + monto + referencia); color por estado de pago.

## Hoja de ruta — progreso actual

Plan completo en `PLAN-15-PASOS.md` (fuente de verdad). El Paso 13 no existe (se saltó de 12 a 14).

- [x] Paso 1 — Tipos generados de Supabase
- [x] Paso 2 — Cliente Supabase SSR + proxy de autenticación
- [x] Paso 3 — Row Level Security (RLS)
- [x] Paso 4 — Sistema de componentes UI base
- [x] Paso 5 — Refactor del layout y navegación
- [x] Paso 6 — Refactor de login + onboarding
- [x] Paso 7 — Capa de dominio (lógica de negocio pura)
- [~] Paso 8 — Refactor Dashboard admin (parcial; refactor visual revertido 2026-06-14)
- [~] Paso 9 — Refactor Mensualidades y Finanzas (parcial; refactor visual revertido 2026-06-14)
- [x] Paso 10 — Refactor de Torneos
- [x] Paso 11 — Alerta de retención en dashboard admin
- [ ] Paso 12 — Automatizaciones (cron, alertas, emails)
- [x] Paso 14 — PWA + optimización móvil
- [x] Paso 15 — Auditoría final, performance y deploy (tag v2.0.0)

## Flujo por sesión

1. Marcela dice: **"Ejecuta el paso N"**
2. Leer `PLAN-15-PASOS.md` para ver los detalles
3. Ejecutar TODO lo del paso
4. Correr `npx tsc --noEmit` y `npx next build` para validar
5. Marcar el paso como `[x]` en la sección anterior
6. No hacer más de un paso por sesión salvo que Marcela lo pida

**Continuidad entre sesiones:** cuando una tarea tiene varias partes, terminar la respuesta con:
```
➡️ Próxima sesión — pega esta ruta:
C:\ruta\completa\al\ARCHIVO-DE-PLAN.md
```

## Sobre la usuaria

- **Marcela** es la desarrolladora del proyecto.
- Prefiere explicaciones simples y directas, sin cambios extra fuera del alcance pedido.
- Flujo de trabajo: VS Code → GitHub → Vercel.
- Cuando diga **"súbelo"** o **"subelo"**: hacer commit y push directo, sin pedir confirmación.

## Idioma

Responde siempre en español, sin excepción.

## Comandos útiles

```bash
npm run dev          # Servidor de desarrollo
npx tsc --noEmit     # Verificar tipos
npx next build       # Build de producción
```
