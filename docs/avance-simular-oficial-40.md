# Avance: Archivar oficiales + simulación 40 (Demostración)

**Repo:** `cmsports-next`  
**Última actualización:** 2026-08-11  
**Club demo:** Demostración TDM `0884dbef-798d-4ce3-9e7a-deace0b4aa95`  
**NO tocar Buin** `ec1ef215-0ab5-43c6-abf4-fc5578b17bcc`

Documento para retomar en otro chat: pegar esta ruta.

## Qué se implementó

### Archivar / borrar (mismo patrón que internos/externos)
- Soft-archive: `oficial_campeonatos.estado = 'archivado'` (+ eventos hijos).
- Actions: `archivarCampeonatoOficial`, `desarchivarCampeonatoOficial`, `eliminarCampeonatoOficialDefinitivo`.
- Listado `/torneo-oficial`: toggle **Ver archivados**, Eliminar / Desarchivar / Borrar definitivo (admin).
- Detalle campeonato: botón **Archivar**.
- Schema ya tenía `'archivado'` en CHECK (migración 156) → **no hace falta migración 182** para archivar.

### Simulación N=40 (datos reales en Supabase)
- Campeonato visible: **Simulación Manual JG — 40 inscritos**
- Ruta: `/torneo-oficial` → abrir ese campeonato  
  ID actual (si no se regeneró): `9b2f096f-3d3e-4d16-91e0-b83c717cfe1d`  
  Evento: `/torneo-oficial/evento/d7bcbb6b-6223-482e-9966-ff871a7311f2`
- 40 inscritos, 14 grupos, 42 partidos de grupo, programa con 8 mesas (vía script).

### Fix de programación
- `programarPartidosGreedyConInforme` reporta `omitidos`; UI avisa si no cupieron partidos.

## Migraciones a pegar ANTES de usar features nuevas

Orden en SQL Editor de Supabase:

1. `supabase/migrations/179_oficial_marcador_tecnico_fk.sql` (si falta)
2. `supabase/migrations/180_oficial_cierre_sanciones_programa.sql`  
   (si quedó a medias: `docs/pegar-recuperar-180-oficial.sql`)
3. `supabase/migrations/181_oficial_sorteo_numero_arbitro.sql`

**Archivar/borrar:** ninguna migración nueva.  
**Seed 40 (opcional, si no usás el script):** `docs/pegar-simular-oficial-40-demo.sql`

## Cómo verlo en Demostración

1. Pegar 179–181 si aún no están.
2. Login en club **Demostración TDM**.
3. Ir a **Torneo oficial** → campeonato **Simulación Manual JG — 40 inscritos**.
4. Probar Archivar / Ver archivados / Desarchivar / Eliminar en un campeonato de prueba (no borrar la sim si la estás usando).

## Cómo re-correr el seed

**Preferido (grupos + partidos + programa):**

```bash
node scripts/simular-oficial-40.mjs --limpiar
node scripts/simular-oficial-40.mjs
```

Requiere `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

**Alternativa SQL (solo campeonato + evento + 40 inscritos):** pegar  
`docs/pegar-simular-oficial-40-demo.sql` → luego en UI **Formar grupos**.

## Mañas encontradas

| Hallazgo | Estado |
|----------|--------|
| `oficial_inscritos.genero` solo admite `V`/`D` (no `varones`) — el seed fallaba | ✅ fijo en script/SQL |
| Programación greedy omitía partidos en silencio si no cabían | ✅ reporta `omitidos` + aviso UI |
| Dominio N=40 (14 grupos, llave 32, 4 BYE, 8 mesas) | ✅ tests `oficial-simulacion-40.test.ts` OK |
| Bracket 32 / tablero densos en mobile | pendiente UX (ya hay scroll + cards) |
| Excel/PDF con 14 GRP | OK a escala 40; no límite duro |

## Archivos clave

- `src/app/actions/torneo-oficial.ts` — archivar/borrar + omitidos
- `src/app/torneo-oficial/page.tsx` — listado archivados
- `src/app/torneo-oficial/[id]/page.tsx` — Archivar
- `scripts/simular-oficial-40.mjs`
- `docs/pegar-simular-oficial-40-demo.sql`
- `src/lib/domain/oficial-simulacion-40.test.ts`

## Verificación

```bash
npx vitest run src/lib/domain/oficial-simulacion-40.test.ts src/lib/domain/programar-oficial.test.ts
npx tsc --noEmit
```
