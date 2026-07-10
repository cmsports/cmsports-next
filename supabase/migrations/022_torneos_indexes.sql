-- Índices para acelerar la carga del detalle de torneo
-- Sin estos, cada query hace full table scan

-- torneo_grupos: filtro principal por torneo
CREATE INDEX IF NOT EXISTS torneo_grupos_torneo_id_idx ON torneo_grupos (torneo_id);

-- torneo_partidos: filtro por torneo (la query más pesada)
CREATE INDEX IF NOT EXISTS torneo_partidos_torneo_id_idx ON torneo_partidos (torneo_id);

-- torneo_partidos: filtro adicional por grupo (usado en calcularStats por grupo)
CREATE INDEX IF NOT EXISTS torneo_partidos_grupo_id_idx ON torneo_partidos (grupo_id);

-- torneo_partidos: filtro por fase (usado en avanzarSiguienteFase y bracket)
CREATE INDEX IF NOT EXISTS torneo_partidos_torneo_fase_idx ON torneo_partidos (torneo_id, fase);

-- grupo_jugadores: join con torneo_grupos para filtrar por torneo
CREATE INDEX IF NOT EXISTS grupo_jugadores_grupo_id_idx ON grupo_jugadores (grupo_id);

-- torneo_pagos: filtro por torneo
CREATE INDEX IF NOT EXISTS torneo_pagos_torneo_id_idx ON torneo_pagos (torneo_id);

-- jugadores: búsqueda por club (usada en varias pantallas)
CREATE INDEX IF NOT EXISTS jugadores_club_id_idx ON jugadores (club_id);
