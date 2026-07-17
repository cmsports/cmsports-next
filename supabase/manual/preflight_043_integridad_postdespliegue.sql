-- Diagnóstico de solo lectura antes de validar constraints de 041 y 042.
-- Resultado esperado: las tres filas deben mostrar total = 0.

SELECT 'audit_log_sin_club' AS revision, COUNT(*)::bigint AS total
FROM public.audit_log
WHERE club_id IS NULL

UNION ALL

SELECT 'audit_log_club_inexistente', COUNT(*)::bigint
FROM public.audit_log a
WHERE a.club_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.clubes c WHERE c.id = a.club_id
  )

UNION ALL

SELECT 'solicitud_torneo_inexistente', COUNT(*)::bigint
FROM public.solicitudes_jugador s
WHERE s.torneo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.torneos t WHERE t.id = s.torneo_id
  );
