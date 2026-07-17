-- Ejecutar antes de 044_torneos_reglas_bracket.sql.
-- Todas las filas deben devolver total = 0.

select 'ganador_ajeno_al_partido' as revision, count(*)::bigint as total
from public.torneo_partidos
where ganador is not null
  and ganador is distinct from jugador_a
  and ganador is distinct from jugador_b

union all

select 'llaves_playoff_duplicadas', count(*)::bigint
from (
  select torneo_id, fase, orden
  from public.torneo_partidos
  where fase <> 'grupos'
  group by torneo_id, fase, orden
  having count(*) > 1
) duplicadas

union all

select 'cuotas_negativas', count(*)::bigint
from public.torneos
where coalesce(cuota_inscripcion, 0) < 0
   or coalesce(precio_entrada, 0) < 0

union all

select 'fase_playoff_invalida', count(*)::bigint
from public.torneo_partidos
where fase is null
   or fase not in ('grupos','avance','32vos','16vos','8vos','cuartos','semis','final')

union all

select 'orden_playoff_invalido', count(*)::bigint
from public.torneo_partidos
where fase <> 'grupos'
  and (orden is null or orden < 0 or (fase = 'final' and orden <> 0))

union all

select 'jugador_repetido_en_llave', count(*)::bigint
from public.torneo_partidos
where jugador_a is not null and jugador_a = jugador_b;
