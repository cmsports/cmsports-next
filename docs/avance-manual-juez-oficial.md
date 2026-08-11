# Avance: Manual Juez → Torneo oficial

**Repo:** `cmsports-next`  
**Última actualización:** 2026-08-11  
**Gap:** `docs/gap-manual-juez-vs-torneo-oficial.md`

Documento para retomar en otro chat: pegar esta ruta y pedir continuar desde la parte pendiente.

## Checklist (orden de build)

| Parte | Estado | Notas |
|-------|--------|-------|
| 1. Cierre Jugado / W.O. / Retiro | ✅ hecho | Dominio `resolverCierrePartido`; UI modal en `PartidoOficialRow` |
| 2. Motivo + alcance | ✅ hecho | Columns + WO en cascada evento/campeonato |
| 3. Editor programa | ✅ hecho | Lista editar mesa/hora + conflictos; forzar opcional |
| 4. Export Excel Koidan | ✅ hecho | `oficial-export-excel.ts` → Prog, GRP, Sorteo |
| 5. Orden grupos ITTF | ✅ hecho | `ordenPartidosGrupoIttf` al formar grupos |
| 6. Bitácora sanciones | ✅ hecho | Tab Sanciones; sync tarjetas al cerrar marcador |
| 7. Tests dominio | ✅ hecho | 23 tests (oficial-ittf + programar-oficial + oficial-sorteo) |
| 8. Siembra / resumen cuadro | ✅ hecho | `resumenSiembraCuadro` + posiciones semilla ITTF; UI en Llaves |
| 9. Sorteo 2ª fase configurable | ✅ hecho | `modo_sorteo_llave`: fijo / sorteo_segundos / serpiente |
| 10. Panel conflictos multi-evento | ✅ hecho | Campeonato: `detectarConflictosProgramaMulti` por `jugador_id` |
| 11. Numeración ITTF | ✅ hecho | `numero_ittf` en programa/Excel/PDF; Renumerar |
| 12. Árbitro básico | ✅ hecho | `arbitro_nombre` texto en editor de programa |
| Ops: pegar migraciones | ⏳ manual | 179 (si falta) + **180** + **181** |

## Migraciones nuevas a pegar

```
supabase/migrations/180_oficial_cierre_sanciones_programa.sql
supabase/migrations/181_oficial_sorteo_numero_arbitro.sql
```

(Si el bridge marcador aún no corre en Demostración: también `179_oficial_marcador_tecnico_fk.sql`.)

## Archivos tocados (corte nice-to-have)

### Dominio / export
- `src/lib/domain/oficial-sorteo.ts` (+ test) — siembra, modos 2ª fase, numeración
- `src/lib/domain/programar-oficial.ts` (+ test) — conflictos multi-evento por clave jugador
- `src/lib/oficial-export-excel.ts` — columna `#` + árbitro; cuadro en hoja Sorteo
- `src/lib/oficial-export-pdf.ts` — `#` y árbitro en programa

### Backend
- `src/app/actions/torneo-oficial.ts` — modo sorteo, renumerar, árbitro, conflictos enriquecidos
- `supabase/migrations/181_oficial_sorteo_numero_arbitro.sql`

### UI
- `src/app/torneo-oficial/evento/[id]/page.tsx` — panel sorteo 2ª fase; # ITTF; árbitro
- `src/app/torneo-oficial/[id]/page.tsx` — panel conflictos multi-evento

### Docs
- `docs/gap-manual-juez-vs-torneo-oficial.md`
- `docs/avance-manual-juez-oficial.md` (este)

## Cómo probar en Demostración

Club: `0884dbef-798d-4ce3-9e7a-deace0b4aa95`

1. Pegar **180** y **181** (y **179** si falta) en SQL Editor.
2. Evento → tab **Llaves**: elegir modo sorteo (fijo / sorteo 2.os / serpiente) → Aplicar; ver resumen de cuadro (tamaño, BYEs).
3. **Renumerar ITTF** → partidos muestran `#N` en programa / Excel / PDF.
4. Tab **Programa**: editar partido → mesa, hora y **Árbitro**.
5. Vista **campeonato**: con ≥2 eventos programados a la misma hora con el mismo jugador → panel conflictos amarillo.
6. Excel: hojas Prog (columna `#`, Árbitro) y Sorteo (bloque cuadro).

## Verificación

- `npx vitest run src/lib/domain/oficial-ittf.test.ts src/lib/domain/programar-oficial.test.ts src/lib/domain/oficial-sorteo.test.ts` → 23 passed  
- `npx tsc --noEmit` → exit 0  

## Deferred (no en este corte)

- Lucky loser / clasificatorias aparte (§2.4.4) — la fase de grupos cumple el rol de previa; cut + promoción a cuadro principal exige reescritura.
- Catálogo de árbitros (FK a perfiles) — hoy solo texto libre por partido.
- Retiro explícito desde tablet técnico (sigue desde UI oficial Sets).
- Equipos / PTM / doble elim.

## Pendiente (siguiente chat)

Ver corte actual: **`docs/avance-simular-oficial-40.md`** (archivar/borrar + seed 40 en Demostración + deploy).

- [ ] Lucky loser / cut (deferred)
- [ ] Catálogo árbitros FK (deferred)

```
Seguir desde docs/avance-manual-juez-oficial.md
Pendiente manual: pegar 180 + 181
Opcional UX: retiro desde marcador técnico
Later: equipos / PTM / doble elim / lucky loser
```
