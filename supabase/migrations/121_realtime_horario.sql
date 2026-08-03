-- El horario tiene que viajar en vivo, igual que la asistencia.
--
-- El profe está pasando lista, se da cuenta de que a alguien le falta el grupo,
-- lo inscribe desde la ficha y vuelve: tiene que verlo en la lista, sin recargar
-- y sin esperar. Eso solo funciona si estas tablas emiten sus cambios; hasta
-- ahora solo `asistencia` estaba publicada, así que la pantalla escuchaba unos
-- eventos que la base nunca mandaba.
--
-- `clases_extraordinarias` estaba en la misma: el panel se suscribía desde que
-- existe la tabla y jamás recibió nada.
--
-- Va con EXCEPTION duplicate_object porque puede haberse agregado a mano desde
-- el panel de Supabase: en ese caso esto no hace nada.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bloque_jugadores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bloques_horario;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bloque_excepciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clases_extraordinarias;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime manda la fila vieja en los UPDATE/DELETE solo si la tabla tiene
-- REPLICA IDENTITY. Sin esto, sacar a alguien de un grupo llega como un evento
-- sin datos y la pantalla no sabe a quién le tocaba refrescar.
ALTER TABLE public.bloque_jugadores    REPLICA IDENTITY FULL;
ALTER TABLE public.bloques_horario     REPLICA IDENTITY FULL;
ALTER TABLE public.bloque_excepciones  REPLICA IDENTITY FULL;
