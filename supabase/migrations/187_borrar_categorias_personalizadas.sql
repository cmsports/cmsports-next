-- Poder borrar una categoría inventada por el club.
--
-- ── Por qué cambia el criterio de la 143 ──────────────────────────────────
-- La 143 no dejó política de DELETE a propósito: el razonamiento era que
-- borrar una categoría con torneos dejaría esos torneos apuntando a un nombre
-- que ya no existe. Pero eso no es lo que pasa: `torneos.categoria` es texto,
-- no una FK. El torneo se guarda con la palabra escrita adentro, así que
-- borrar la fila del catálogo solo la saca del selector — el torneo sigue
-- teniendo su categoría y su ranking sigue armándose igual.
--
-- Sin DELETE, un error de tipeo ("MSATER Z") quedaba en el selector para
-- siempre. Eso es peor que el riesgo que se estaba evitando.
--
-- Sigue sin haber UPDATE: renombrar la fila del catálogo NO renombra los
-- torneos ya creados, así que dejaría dos nombres para lo mismo. Para corregir
-- un tipeo se borra y se crea de nuevo.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('187_borrar_categorias_personalizadas');

-- Solo admin y solo del propio club, igual que la de crear.
DROP POLICY IF EXISTS "categorias_personalizadas_borrar" ON public.categorias_personalizadas;
CREATE POLICY "categorias_personalizadas_borrar" ON public.categorias_personalizadas
  FOR DELETE USING (club_id = get_my_club_id() AND get_my_rol() = 'admin');

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────
-- Tienen que salir tres políticas: SELECT, INSERT y DELETE. UPDATE no.
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'categorias_personalizadas'
ORDER BY cmd;
