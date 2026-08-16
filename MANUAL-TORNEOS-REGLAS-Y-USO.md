# Manual de torneos: reglas internas y uso

Versión vigente: 16 de agosto de 2026  
Alcance: torneos club — interno (`/torneos-internos`) y externo (`/torneos`).  
En la app: el mismo texto aparece apenas entras al módulo y dentro de cada torneo.

> El **torneo oficial ITTF** (`/torneo-oficial`) es otro módulo.

## Interno vs externo

**Interno** alimenta el Ranking. Lleva categoría y género. Solo se inscribe desde la lista (socios y visitas ya registradas). Las visitas suman ranking igual.

**Externo** no alimenta Ranking. Se puede escribir un nombre nuevo (ficha temporal). El club de procedencia evita, si cabe, dos del mismo club en un grupo. Al finalizar, las fichas de visitantes se borran.

El motor de grupos, llaves, BYEs, mesa, pagos, premios y en vivo es el mismo.

## Permisos y flujo

Solo un **administrador del mismo club** crea y gestiona. Flujo: Inscripción → Grupos → Playoffs → Finalizado → (opcional) Archivado. El cuadro puede convivir con grupos abiertos (“Grupos + playoffs”).

## Crear

Nombre, fecha (día de Chile) y cuota ≥ $0. Interno: categoría + Varones/Damas/Mixto. Queda en curso, inscripción abierta, código público tipo `PAINE-01`.

## Inscripción

Todos entran a MESA. Mínimo 4 para cerrar. Máximo 32 grupos / 64 clasificados. Cuota $0 = sin pagos. Efectivo/transferencia = pagado hoy; pendiente = después. Si falla el pago, se revierte la inscripción.

## Cabezas de serie

Lista #1, #2, #3… correlativa, sin duplicados, máximo una por grupo. Mandan en el sembrado y en quién recibe BYE. Cambios sin guardar pausan el armado automático.

## Grupos

`máximo(2, ceil(jugadores ÷ 3))`. Serpentina; en externo además se separan clubes (regla blanda). Todos contra todos. Victoria = 2 pts, derrota = 0.

## Clasificación

Clasifican 1° y 2°. Desempate: 1) puntos 2) H2H si son exactamente dos 3) manual si hay triple empate en el corte. No se usan sets ni puntos de cada set.

## Llaves — prioridad de reglas

De más fuerte a más débil:

1. Nunca 1° contra 2° del **mismo** grupo en la primera ronda.
2. 1° y 2° del mismo grupo en **mitades opuestas**.
3. Separar #1 y #2 en mitades opuestas.
4. BYE primero a cabezas de menor número, y a 1° de grupo antes que a 2°.
5. Espejo del resto de cabezas.
6. Preferir 1° vs 2° de otro grupo; si sobran 2°, pueden jugar 2° vs 2°.
7. Repartir grupos ya cerrados entre mitades para poder jugar una rama ya.

El esqueleto aparece apenas hay grupos y se rellena al cerrar cada uno. En cuanto se juega una llave real, el árbol queda congelado. Después no se vuelve a sembrar: ganador 1-2 → siguiente 1, etc.

Tamaño: siguiente potencia de 2 (4→semis, 5-8→cuartos, 9-16→octavos, 17-32→16avos, 33-64→32avos). Huecos = BYE.

## BYE

Avance automático. No se marca a mano. Cantidad = tamaño del cuadro − clasificados. Un BYE se puede arrastrar (no cuenta como jugado). Si esa persona ya jugó la ronda siguiente, no.

## Arrastre

Computador, ronda inicial no jugada. Cualquier llave de esa ronda (ya no hay traba de “misma mitad”). No dejar llave vacía ni mismo grupo vs sí mismo. Las cabezas sí se pueden mover.

## Resultados

Ganador = uno de los dos. Corregir desde la ronda más avanzada hacia atrás. **Volver a grupos** borra playoffs y conserva grupos.

## Tardíos

Solo antes de una llave jugada. 1 → grupo con menos de 4; 2 → grupo En preparación; 3+ juntos. Máximo un grupo en preparación; mientras existe, no se arma el bracket.

## En vivo

`/vivo/CODIGO` y QR, sin cuenta. Elegir nombre o espectador. “No aparezco” deja solicitud (no inscribe). Refresh cada 5 s. El cuadro público aparece cuando el torneo entra a playoffs.

## Ranking (solo interno)

Se carga al **finalizar**. Puesto, no victorias: 1°=100, 2°=90, 3-4=80, 5-8=60, 9-16=20, 17-32=10, grupos=9. Por categoría+género. Empate de puntos = mismo puesto. Reiniciar corta por fecha. Archivar no saca los puntos.

## Finanzas y premios

Subir a Finanzas es un paso aparte (solo lo pagado nuevo). Premios 1°/2°/3° opcionales = gastos. Gastos de gestión también. Informe PDF al finalizar. Excel desde grupos. Finalizar no exige que todos hayan pagado.

## Cierre

Final completa → campeón y subcampeón. Interno: escribe ranking. Externo: borra visitantes. Archivar no toca Finanzas. Borrar definitivo sí.

## Cómo seguir en otro chat

Pegá esta ruta:

`MANUAL-TORNEOS-REGLAS-Y-USO.md`

Fuente en la app: `src/lib/torneos/manual-contenido.ts`  
Componente: `src/components/torneos/ManualTorneos.tsx`  
Se muestra en `/torneos`, `/torneos-internos` y `/torneos/[id]`.
