-- El club con el que juega alguien es de la inscripción, no de la persona.
--
-- La migración 126 guardó `club_procedencia` en `jugadores`, o sea uno solo y
-- global por persona. Eso trae dos problemas:
--
--   1. Un jugador puede jugar un torneo por un club y el siguiente por otro.
--      Con el dato en la ficha, inscribirlo por el club nuevo reescribía el
--      torneo viejo: pasaba a mostrar el club de hoy en un cuadro ya jugado.
--
--   2. Las fichas de externos sobreviven entre torneos (campeón y subcampeón
--      no se limpian, y los que siguen en otro torneo tampoco). Esa ficha
--      arrastraba el club antiguo aunque el admin escribiera otro.
--
-- Ahora el club viaja con la fila de `grupo_jugadores`: cada torneo recuerda
-- con qué camiseta jugó cada uno, y cambiarlo en uno no toca los demás.
--
-- La columna de `jugadores` se deja donde está pero ya no se lee. Borrarla es
-- destructivo y no urge; queda marcada como obsoleta para una limpieza futura.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.

BEGIN;

SELECT _migracion_nueva('129_club_por_inscripcion');

ALTER TABLE grupo_jugadores ADD COLUMN IF NOT EXISTS club_procedencia text;

COMMENT ON COLUMN grupo_jugadores.club_procedencia IS
  'Club con el que el jugador disputa ESTE torneo. Fuente de verdad para el armado de grupos.';

COMMENT ON COLUMN jugadores.club_procedencia IS
  'OBSOLETA desde la migración 129: el club vive en grupo_jugadores.club_procedencia. No leer.';

-- Lo ya cargado en las fichas se traslada a las inscripciones vigentes, para
-- no perder lo que el club alcanzó a escribir con el modelo anterior.
UPDATE grupo_jugadores gj
SET club_procedencia = j.club_procedencia
FROM jugadores j
WHERE j.id = gj.jugador_id
  AND j.es_externo = true
  AND j.club_procedencia IS NOT NULL
  AND gj.club_procedencia IS NULL;

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Cuántas inscripciones quedaron con club, y de qué clubes.
SELECT club_procedencia, count(*) AS inscripciones
FROM grupo_jugadores
WHERE club_procedencia IS NOT NULL
GROUP BY club_procedencia
ORDER BY inscripciones DESC;
