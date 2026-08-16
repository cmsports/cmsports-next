# Avance: Manual Juez → Torneo oficial

**Repo:** `cmsports-next`  
**Última actualización:** 2026-08-16  
**Gap:** `docs/gap-manual-juez-vs-torneo-oficial.md`

Documento para retomar en otro chat: pegar esta ruta y pedir continuar desde la parte pendiente.

## Checklist (orden de build)

| Parte | Estado | Notas |
|-------|--------|-------|
| 1–12. Cierre, programa, Excel, ITTF, sorteo, #, árbitro | ✅ hecho | Corte 2026-08-11 |
| 13. Club juez Coydán | ✅ hecho | Migración 194 — `Juez MET2 Costa`; módulos `torneo_oficial` + `tecnico`. Cuenta admin a mano en Superadmin |
| 14. Orden grupo de 3 | ✅ hecho | `1-3, 1-2, 2-3` (`oficial-ittf.ts`) |
| 15. Importar lista CSV/xlsx | ✅ hecho | Mesa de inscripción: pegar o subir; `inscribirLoteOficial` |
| 16. Programar por grupo + día | ✅ hecho | `fecha_juego`, `bloque_grupo_minutos` 70, bloques especiales, olas de grupo |
| 17. Tablero mural + PDF grilla | ✅ hecho | Campeonato día × mesa; PDF mural |
| 18. Ensayo 2 eventos | ✅ seed | `docs/pegar-ensayo-juez-met2.sql` |
| 19. Pre-llave / 1/64 | ✅ hecho | `tamano_cuadro` + fase `avance`; ganadores llenan el cuadro |
| 20. Vivo público | ✅ hecho | `/torneo-oficial/vivo/[codigo]` (sin módulo) |
| Ops: pegar migraciones | ⏳ manual | 179 (si falta) + **180** + **181** + **194** + **195** |

## Migraciones a pegar (SQL Editor)

```
supabase/migrations/179_oficial_marcador_tecnico_fk.sql   (si falta)
supabase/migrations/180_oficial_cierre_sanciones_programa.sql
supabase/migrations/181_oficial_sorteo_numero_arbitro.sql
supabase/migrations/194_club_juez_met2.sql
supabase/migrations/195_oficial_zonal_programa_y_publico.sql
```

Seed de ensayo (no es migración): `docs/pegar-ensayo-juez-met2.sql` — club `7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430`.

## Cómo trabaja Coydán el día del zonal

1. Club **Juez MET2 Costa** (no Buin). Crear campeonato, 12 mesas, sáb–dom, hora 8:30, min/grupo 70.
2. Crear 8 eventos y asignar **fecha de juego**.
3. Importar lista por evento → cabezas (sugeridas por ranking) → formar grupos.
4. Bloques especiales (receso) → **Auto-programar campeonato** → PDF mural.
5. Jugar grupos en tablet o sets; standings ITTF solos.
6. Si el cuadro es chico, se arma **avance** al cerrar grupos; si no, llaves.
7. W.O./retiro en la misma UI. Código público → `/torneo-oficial/vivo/CODIGO`.

## Verificación

- `npx vitest run src/lib/domain/oficial-ittf.test.ts src/lib/domain/programar-oficial.test.ts src/lib/domain/oficial-sorteo.test.ts src/lib/domain/oficial-import-lista.test.ts src/lib/auth/modulos-rutas.test.ts`
- `npx tsc --noEmit`

## Deferred

- Lucky loser / cut aparte (§2.4.4)
- Catálogo de árbitros (FK)
- Equipos / PTM / doble elim
- Clonar xlsx visual de 22 hojas (no: Excel queda dump opcional)

```
Seguir desde docs/avance-manual-juez-oficial.md
Pendiente manual: pegar 180 + 181 + 194 + 195; crear admin del club juez
Ensayo: pegar-ensayo-juez-met2.sql
Later: equipos / PTM / doble elim / lucky loser
```
