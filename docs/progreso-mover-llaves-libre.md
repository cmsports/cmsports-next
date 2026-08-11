# Progreso: mover jugadores entre cualquier llave

## Objetivo
Permitir arrastrar un cupo de cualquier llave de la ronda inicial a cualquier otra, sin la restricción de “misma mitad del cuadro”.

## Estado
- [x] Quitar chequeo de mitad en `intercambiarJugadores` (`src/app/actions/torneos.ts`)
- [x] Migración `155_intercambio_cupos_sin_mitad.sql` (RPC sin mitad)
- [x] Texto de ayuda en la página del torneo
- [ ] **Pegar la migración 155 en el SQL Editor de Supabase** (sin esto, la base sigue bloqueando el cruce de mitades)
- [x] Commit + push a git (deploy Vercel)

## Pendiente para el siguiente chat
Si el arrastre sigue fallando con “mitades del bracket”, falta ejecutar:

`supabase/migrations/155_intercambio_cupos_sin_mitad.sql`

en Supabase Dashboard → SQL Editor.
