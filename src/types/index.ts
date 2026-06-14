import type { Tables } from './database'

// ─── Domain aliases ─────────────────────────────────────────────────────────

export type Club = Tables<'clubes'>
export type Perfil = Tables<'perfiles'>
export type Usuario = Tables<'usuarios'>
export type Jugador = Tables<'jugadores'>
export type Profesor = Tables<'profesores'>
export type Clase = Tables<'clases'>
export type ClaseJugador = Tables<'clase_jugadores'>
export type Reserva = Tables<'reservas'>
export type Asistencia = Tables<'asistencia'>
export type Mensualidad = Tables<'mensualidades'>
export type Cuota = Tables<'cuotas'>
export type Movimiento = Tables<'movimientos'>
export type Torneo = Tables<'torneos'>
export type TorneoGrupo = Tables<'torneo_grupos'>
export type TorneoJugador = Tables<'torneo_jugadores'>
export type TorneoPartido = Tables<'torneo_partidos'>
export type TorneoPago = Tables<'torneo_pagos'>
export type GrupoJugador = Tables<'grupo_jugadores'>
export type Partido = Tables<'partidos'>
export type HistorialElo = Tables<'historial_elo'>
export type EvaluacionTrimestral = Tables<'evaluaciones_trimestrales'>
export type TorneoExterno = Tables<'torneos_externos'>
export type SolicitudJugador = Tables<'solicitudes_jugador'>
export type Invitacion = Tables<'invitaciones'>
export type Evento = Tables<'eventos'>
export type ClubPhoto = Tables<'club_photos'>
export type BancoFoto = Tables<'banco_fotos'>

// ─── Rol union type ─────────────────────────────────────────────────────────

export type Rol = 'admin' | 'profesor' | 'jugador'

// ─── Re-exports ─────────────────────────────────────────────────────────────

export type { Database, Tables, InsertDto, UpdateDto } from './database'
