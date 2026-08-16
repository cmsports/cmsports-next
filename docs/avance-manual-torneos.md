# Avance: manual de torneos en la app

**Estado:** hecho y listo para subir.  
**Fecha:** 16 de agosto de 2026

## Qué se pidió

Manual de uso de torneos internos y externos, con todas las reglas (llaves, BYEs, prioridades, finanzas, premios, ranking, en vivo), visible apenas se entra al módulo y también mientras se arma el torneo.

## Qué quedó

- Contenido: `src/lib/torneos/manual-contenido.ts`
- UI: `src/components/torneos/ManualTorneos.tsx`
- Listados: `/torneos` (externo) y `/torneos-internos` — panel abierto al entrar
- Dentro del torneo: `/torneos/[id]` — abierto en inscripción; barra “Manual” en las demás fases, filtrada a la fase actual
- Texto para otros chats: `MANUAL-TORNEOS-REGLAS-Y-USO.md`

## Cómo seguir

Pegá:

`docs/avance-manual-torneos.md`

Si hay que corregir una regla: editar `manual-contenido.ts` (la UI lee de ahí) y copiar el cambio al `.md` de la raíz.
