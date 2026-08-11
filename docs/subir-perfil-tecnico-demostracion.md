# Subir perfil técnico a Demostración (git + Vercel)

**Archivo para continuar en otra sesión:**
```
C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-next\docs\subir-perfil-tecnico-demostracion.md
```

**Convención:** cuando digas «súbelo» = commit en git + push + deploy en Vercel.
Las migraciones SQL se pegan a mano en Supabase (no van solas con el deploy).

## Estado (2026-08-11)

### [x] Parte 1 — Cablear módulo en frontend
- `tecnico` en `src/lib/domain/modulos.ts`
- Ruta protegida en `src/lib/auth/modulos-rutas.ts`
- Auth en `src/proxy.ts` (`/tecnico`)
- Ítem de menú en `src/app/layout-app.tsx` (admin / profesor / jugador)
- Migración corta: `178_tecnico_demo_solo_modulo.sql`

### [ ] Parte 2 — Commit + push del código local
**Pendiente de «súbelo».** Incluir:
- Cableado (modulos / rutas / layout / proxy)
- `src/app/tecnico/**`, `src/components/tecnico/**`, `src/lib/tecnico*/**`, `src/app/api/tecnico/**`
- Migraciones `162`–`178`
- No subir: scripts tmp, PDFs de propuesta, `.cursor/`

### [ ] Parte 3 — Deploy Vercel
Tras push a `main`, confirmar deploy de producción.

### [ ] Parte 4 — Supabase (manual, después del deploy)
1. Si las tablas no existen: `162` (+ `163`–`174` si hace falta piloto Spinhouse)
2. Marcador: `175`, `176`, `177`
3. Habilitar Demostración: `178_tecnico_demo_solo_modulo.sql`

### Clubes
| Club | id | técnico |
|------|----|---------|
| Spinhouse (piloto) | `2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41` | sí (migración 163) |
| Demostración TDM | `0884dbef-798d-4ce3-9e7a-deace0b4aa95` | objetivo de este deploy |
| Buin | `ec1ef215-...` | no (163 lo quita si estaba) |

## Cómo continuar
> Seguir desde `docs/subir-perfil-tecnico-demostracion.md`. Cablear frontend → commit/push → Vercel → pegar migraciones faltantes en Demostración.
