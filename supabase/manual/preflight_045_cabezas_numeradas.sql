-- Ejecutar antes de 045_cabezas_numeradas_grupos_manuales.sql.
-- Todas las filas deben devolver total = 0.

select 'legacy_cabezas_duplicadas' as revision, count(*)::bigint as total
from public.torneos
where cabeza_serie_1 is not null
  and cabeza_serie_1 = cabeza_serie_2

union all

select 'legacy_cabeza_2_sin_1', count(*)::bigint
from public.torneos
where cabeza_serie_1 is null
  and cabeza_serie_2 is not null

union all

select 'legacy_cabeza_torneo_sin_club', count(*)::bigint
from public.torneos
where club_id is null
  and (cabeza_serie_1 is not null or cabeza_serie_2 is not null)

union all

select 'legacy_cabeza_otro_club', count(*)::bigint
from public.torneos t
cross join lateral (
  values (t.cabeza_serie_1), (t.cabeza_serie_2)
) as cabeza(jugador_id)
join public.jugadores j on j.id = cabeza.jugador_id
where cabeza.jugador_id is not null
  and j.club_id is distinct from t.club_id

union all

select 'legacy_cabeza_no_inscrita', count(*)::bigint
from public.torneos t
cross join lateral (
  values (t.cabeza_serie_1), (t.cabeza_serie_2)
) as cabeza(jugador_id)
where cabeza.jugador_id is not null
  and not exists (
    select 1
    from public.grupo_jugadores gj
    join public.torneo_grupos tg on tg.id = gj.grupo_id
    where tg.torneo_id = t.id
      and gj.jugador_id = cabeza.jugador_id
  )

union all

select 'legacy_cabezas_mismo_grupo', count(*)::bigint
from public.torneos t
join public.grupo_jugadores a on a.jugador_id = t.cabeza_serie_1
join public.grupo_jugadores b on b.jugador_id = t.cabeza_serie_2
  and b.grupo_id = a.grupo_id
join public.torneo_grupos tg on tg.id = a.grupo_id
where tg.torneo_id = t.id
  and tg.nombre is distinct from 'MESA'
  and t.cabeza_serie_1 is not null
  and t.cabeza_serie_2 is not null;
