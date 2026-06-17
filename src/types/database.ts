export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      clubes: {
        Row: {
          id: string
          nombre: string
          ciudad: string | null
          deporte: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          nombre: string
          ciudad?: string | null
          deporte?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          ciudad?: string | null
          deporte?: string | null
          creado_en?: string | null
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          email: string | null
          rol: string | null
          jugador_id: string | null
          creado_en: string | null
        }
        Insert: {
          id: string
          club_id?: string | null
          nombre: string
          email?: string | null
          rol?: string | null
          jugador_id?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          email?: string | null
          rol?: string | null
          jugador_id?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'perfiles_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'perfiles_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      usuarios: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          email: string | null
          rut: string | null
          rol: string | null
          activo: boolean | null
          creado_en: string | null
        }
        Insert: {
          id: string
          club_id?: string | null
          nombre: string
          email?: string | null
          rut?: string | null
          rol?: string | null
          activo?: boolean | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          email?: string | null
          rut?: string | null
          rol?: string | null
          activo?: boolean | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'usuarios_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      jugadores: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          rut: string | null
          email: string | null
          telefono: string | null
          categoria: string | null
          elo: number | null
          sesiones_usadas: number | null
          sesiones_limite: number | null
          estado: string | null
          foto_url: string | null
          creado_en: string | null
          es_externo: boolean | null
          mensualidad: number | null
          tipo_plan: string | null
          entrenamientos_por_semana: number | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          nombre: string
          rut?: string | null
          email?: string | null
          telefono?: string | null
          categoria?: string | null
          elo?: number | null
          sesiones_usadas?: number | null
          sesiones_limite?: number | null
          estado?: string | null
          foto_url?: string | null
          creado_en?: string | null
          es_externo?: boolean | null
          mensualidad?: number | null
          tipo_plan?: string | null
          entrenamientos_por_semana?: number | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          rut?: string | null
          email?: string | null
          telefono?: string | null
          categoria?: string | null
          elo?: number | null
          sesiones_usadas?: number | null
          sesiones_limite?: number | null
          estado?: string | null
          foto_url?: string | null
          creado_en?: string | null
          es_externo?: boolean | null
          mensualidad?: number | null
          tipo_plan?: string | null
          entrenamientos_por_semana?: number | null
        }
        Relationships: [
          { foreignKeyName: 'jugadores_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      profesores: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          especialidad: string | null
          email: string | null
          activo: boolean | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          nombre: string
          especialidad?: string | null
          email?: string | null
          activo?: boolean | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          especialidad?: string | null
          email?: string | null
          activo?: boolean | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'profesores_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      clases: {
        Row: {
          id: string
          club_id: string | null
          profesor_id: string | null
          dia_semana: string | null
          hora_inicio: string | null
          hora_fin: string | null
          grupo: string | null
          contenido: string | null
          creado_en: string | null
          publicada: boolean | null
          fecha: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          profesor_id?: string | null
          dia_semana?: string | null
          hora_inicio?: string | null
          hora_fin?: string | null
          grupo?: string | null
          contenido?: string | null
          creado_en?: string | null
          publicada?: boolean | null
          fecha?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          profesor_id?: string | null
          dia_semana?: string | null
          hora_inicio?: string | null
          hora_fin?: string | null
          grupo?: string | null
          contenido?: string | null
          creado_en?: string | null
          publicada?: boolean | null
          fecha?: string | null
        }
        Relationships: [
          { foreignKeyName: 'clases_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'clases_profesor_id_fkey'; columns: ['profesor_id']; referencedRelation: 'profesores'; referencedColumns: ['id'] },
        ]
      }
      clase_jugadores: {
        Row: {
          id: string
          clase_id: string | null
          jugador_id: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          clase_id?: string | null
          jugador_id?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          clase_id?: string | null
          jugador_id?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'clase_jugadores_clase_id_fkey'; columns: ['clase_id']; referencedRelation: 'clases'; referencedColumns: ['id'] },
          { foreignKeyName: 'clase_jugadores_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      reservas: {
        Row: {
          id: string
          clase_id: string | null
          jugador_id: string | null
          estado: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          clase_id?: string | null
          jugador_id?: string | null
          estado?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          clase_id?: string | null
          jugador_id?: string | null
          estado?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'reservas_clase_id_fkey'; columns: ['clase_id']; referencedRelation: 'clases'; referencedColumns: ['id'] },
          { foreignKeyName: 'reservas_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      asistencia: {
        Row: {
          id: string
          jugador_id: string | null
          club_id: string | null
          fecha: string | null
          hora: string | null
          metodo: string | null
          registrado_por: string | null
        }
        Insert: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          fecha?: string | null
          hora?: string | null
          metodo?: string | null
          registrado_por?: string | null
        }
        Update: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          fecha?: string | null
          hora?: string | null
          metodo?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          { foreignKeyName: 'asistencia_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'asistencia_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'asistencia_registrado_por_fkey'; columns: ['registrado_por']; referencedRelation: 'usuarios'; referencedColumns: ['id'] },
        ]
      }
      mensualidades: {
        Row: {
          id: string
          club_id: string | null
          jugador_id: string | null
          mes: number
          anio: number
          monto: number | null
          estado: string | null
          fecha_pago: string | null
          metodo: string | null
          notas: string | null
          creado_en: string | null
          comprobante_url: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          mes: number
          anio: number
          monto?: number | null
          estado?: string | null
          fecha_pago?: string | null
          metodo?: string | null
          notas?: string | null
          creado_en?: string | null
          comprobante_url?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          mes?: number
          anio?: number
          monto?: number | null
          estado?: string | null
          fecha_pago?: string | null
          metodo?: string | null
          notas?: string | null
          creado_en?: string | null
          comprobante_url?: string | null
        }
        Relationships: [
          { foreignKeyName: 'mensualidades_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'mensualidades_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      cuotas: {
        Row: {
          id: string
          jugador_id: string | null
          club_id: string | null
          mes: number | null
          anio: number | null
          monto: number | null
          estado: string | null
          fecha_pago: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          mes?: number | null
          anio?: number | null
          monto?: number | null
          estado?: string | null
          fecha_pago?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          mes?: number | null
          anio?: number | null
          monto?: number | null
          estado?: string | null
          fecha_pago?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'cuotas_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'cuotas_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      movimientos: {
        Row: {
          id: string
          club_id: string | null
          tipo: string
          categoria: string | null
          descripcion: string
          monto: number
          fecha: string | null
          jugador_id: string | null
          registrado_por: string | null
          creado_en: string | null
          profesor_id: string | null
          mes_correspondiente: number | null
          anio_correspondiente: number | null
          registrado_por_nombre: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          tipo: string
          categoria?: string | null
          descripcion: string
          monto: number
          fecha?: string | null
          jugador_id?: string | null
          registrado_por?: string | null
          creado_en?: string | null
          profesor_id?: string | null
          mes_correspondiente?: number | null
          anio_correspondiente?: number | null
          registrado_por_nombre?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          tipo?: string
          categoria?: string | null
          descripcion?: string
          monto?: number
          fecha?: string | null
          jugador_id?: string | null
          registrado_por?: string | null
          creado_en?: string | null
          profesor_id?: string | null
          mes_correspondiente?: number | null
          anio_correspondiente?: number | null
          registrado_por_nombre?: string | null
        }
        Relationships: [
          { foreignKeyName: 'movimientos_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'movimientos_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'movimientos_registrado_por_fkey'; columns: ['registrado_por']; referencedRelation: 'usuarios'; referencedColumns: ['id'] },
          { foreignKeyName: 'movimientos_profesor_id_fkey'; columns: ['profesor_id']; referencedRelation: 'profesores'; referencedColumns: ['id'] },
        ]
      }
      torneos: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          formato: string | null
          estado: string | null
          fecha_inicio: string | null
          fecha_fin: string | null
          creado_en: string | null
          fase: string | null
          precio_entrada: number | null
          inscripcion_abierta: boolean | null
          cuota_inscripcion: number | null
          contabilidad_enviada: boolean | null
          premio_primero: number | null
          premio_segundo: number | null
          premio_tercero: number | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          nombre: string
          formato?: string | null
          estado?: string | null
          fecha_inicio?: string | null
          fecha_fin?: string | null
          creado_en?: string | null
          fase?: string | null
          precio_entrada?: number | null
          inscripcion_abierta?: boolean | null
          cuota_inscripcion?: number | null
          contabilidad_enviada?: boolean | null
          premio_primero?: number | null
          premio_segundo?: number | null
          premio_tercero?: number | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          formato?: string | null
          estado?: string | null
          fecha_inicio?: string | null
          fecha_fin?: string | null
          creado_en?: string | null
          fase?: string | null
          precio_entrada?: number | null
          inscripcion_abierta?: boolean | null
          cuota_inscripcion?: number | null
          contabilidad_enviada?: boolean | null
          premio_primero?: number | null
          premio_segundo?: number | null
          premio_tercero?: number | null
        }
        Relationships: [
          { foreignKeyName: 'torneos_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      torneo_grupos: {
        Row: {
          id: string
          torneo_id: string | null
          nombre: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          torneo_id?: string | null
          nombre?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          torneo_id?: string | null
          nombre?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'torneo_grupos_torneo_id_fkey'; columns: ['torneo_id']; referencedRelation: 'torneos'; referencedColumns: ['id'] },
        ]
      }
      torneo_jugadores: {
        Row: {
          id: string
          torneo_id: string | null
          jugador_id: string | null
          posicion: number | null
          puntos: number | null
        }
        Insert: {
          id?: string
          torneo_id?: string | null
          jugador_id?: string | null
          posicion?: number | null
          puntos?: number | null
        }
        Update: {
          id?: string
          torneo_id?: string | null
          jugador_id?: string | null
          posicion?: number | null
          puntos?: number | null
        }
        Relationships: [
          { foreignKeyName: 'torneo_jugadores_torneo_id_fkey'; columns: ['torneo_id']; referencedRelation: 'torneos'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_jugadores_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      torneo_partidos: {
        Row: {
          id: string
          torneo_id: string | null
          grupo_id: string | null
          fase: string | null
          jugador_a: string | null
          jugador_b: string | null
          ganador: string | null
          orden: number | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          torneo_id?: string | null
          grupo_id?: string | null
          fase?: string | null
          jugador_a?: string | null
          jugador_b?: string | null
          ganador?: string | null
          orden?: number | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          torneo_id?: string | null
          grupo_id?: string | null
          fase?: string | null
          jugador_a?: string | null
          jugador_b?: string | null
          ganador?: string | null
          orden?: number | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'torneo_partidos_torneo_id_fkey'; columns: ['torneo_id']; referencedRelation: 'torneos'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_partidos_grupo_id_fkey'; columns: ['grupo_id']; referencedRelation: 'torneo_grupos'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_partidos_jugador_a_fkey'; columns: ['jugador_a']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_partidos_jugador_b_fkey'; columns: ['jugador_b']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_partidos_ganador_fkey'; columns: ['ganador']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      torneo_pagos: {
        Row: {
          id: string
          torneo_id: string | null
          jugador_id: string | null
          estado: string | null
          metodo_pago: string | null
          fecha_pago: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          torneo_id?: string | null
          jugador_id?: string | null
          estado?: string | null
          metodo_pago?: string | null
          fecha_pago?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          torneo_id?: string | null
          jugador_id?: string | null
          estado?: string | null
          metodo_pago?: string | null
          fecha_pago?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'torneo_pagos_torneo_id_fkey'; columns: ['torneo_id']; referencedRelation: 'torneos'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneo_pagos_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      grupo_jugadores: {
        Row: {
          id: string
          grupo_id: string | null
          jugador_id: string | null
          partidos_jugados: number | null
          partidos_ganados: number | null
          clasificado: boolean | null
        }
        Insert: {
          id?: string
          grupo_id?: string | null
          jugador_id?: string | null
          partidos_jugados?: number | null
          partidos_ganados?: number | null
          clasificado?: boolean | null
        }
        Update: {
          id?: string
          grupo_id?: string | null
          jugador_id?: string | null
          partidos_jugados?: number | null
          partidos_ganados?: number | null
          clasificado?: boolean | null
        }
        Relationships: [
          { foreignKeyName: 'grupo_jugadores_grupo_id_fkey'; columns: ['grupo_id']; referencedRelation: 'torneo_grupos'; referencedColumns: ['id'] },
          { foreignKeyName: 'grupo_jugadores_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      partidos: {
        Row: {
          id: string
          club_id: string | null
          jugador_a: string | null
          jugador_b: string | null
          ganador: string | null
          sets_a: number | null
          sets_b: number | null
          detalle_sets: Json | null
          elo_cambio_a: number | null
          elo_cambio_b: number | null
          torneo_id: string | null
          arbitro_id: string | null
          fecha: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          jugador_a?: string | null
          jugador_b?: string | null
          ganador?: string | null
          sets_a?: number | null
          sets_b?: number | null
          detalle_sets?: Json | null
          elo_cambio_a?: number | null
          elo_cambio_b?: number | null
          torneo_id?: string | null
          arbitro_id?: string | null
          fecha?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          jugador_a?: string | null
          jugador_b?: string | null
          ganador?: string | null
          sets_a?: number | null
          sets_b?: number | null
          detalle_sets?: Json | null
          elo_cambio_a?: number | null
          elo_cambio_b?: number | null
          torneo_id?: string | null
          arbitro_id?: string | null
          fecha?: string | null
        }
        Relationships: [
          { foreignKeyName: 'partidos_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'partidos_jugador_a_fkey'; columns: ['jugador_a']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'partidos_jugador_b_fkey'; columns: ['jugador_b']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'partidos_ganador_fkey'; columns: ['ganador']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'partidos_arbitro_id_fkey'; columns: ['arbitro_id']; referencedRelation: 'usuarios'; referencedColumns: ['id'] },
        ]
      }
      historial_elo: {
        Row: {
          id: string
          jugador_id: string | null
          club_id: string | null
          torneo_id: string | null
          elo_antes: number | null
          elo_despues: number | null
          posicion: string | null
          fecha: string | null
        }
        Insert: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          torneo_id?: string | null
          elo_antes?: number | null
          elo_despues?: number | null
          posicion?: string | null
          fecha?: string | null
        }
        Update: {
          id?: string
          jugador_id?: string | null
          club_id?: string | null
          torneo_id?: string | null
          elo_antes?: number | null
          elo_despues?: number | null
          posicion?: string | null
          fecha?: string | null
        }
        Relationships: [
          { foreignKeyName: 'historial_elo_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'historial_elo_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'historial_elo_torneo_id_fkey'; columns: ['torneo_id']; referencedRelation: 'torneos'; referencedColumns: ['id'] },
        ]
      }
      evaluaciones_trimestrales: {
        Row: {
          id: string
          club_id: string | null
          jugador_id: string | null
          profesor_id: string | null
          periodo_trimestre: string
          fuerza: number | null
          resistencia: number | null
          velocidad: number | null
          tecnica: number | null
          tactica: number | null
          feedback_profesor: string | null
          meta_proximo_periodo: string | null
          firmado_alumno: boolean | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          profesor_id?: string | null
          periodo_trimestre: string
          fuerza?: number | null
          resistencia?: number | null
          velocidad?: number | null
          tecnica?: number | null
          tactica?: number | null
          feedback_profesor?: string | null
          meta_proximo_periodo?: string | null
          firmado_alumno?: boolean | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          profesor_id?: string | null
          periodo_trimestre?: string
          fuerza?: number | null
          resistencia?: number | null
          velocidad?: number | null
          tecnica?: number | null
          tactica?: number | null
          feedback_profesor?: string | null
          meta_proximo_periodo?: string | null
          firmado_alumno?: boolean | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'evaluaciones_trimestrales_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'evaluaciones_trimestrales_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
          { foreignKeyName: 'evaluaciones_trimestrales_profesor_id_fkey'; columns: ['profesor_id']; referencedRelation: 'profesores'; referencedColumns: ['id'] },
        ]
      }
      torneos_externos: {
        Row: {
          id: string
          club_id: string | null
          jugador_id: string | null
          nombre_club: string
          categoria: string
          posicion: string
          fecha: string
          puntos_elo: number | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          nombre_club: string
          categoria: string
          posicion: string
          fecha: string
          puntos_elo?: number | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          jugador_id?: string | null
          nombre_club?: string
          categoria?: string
          posicion?: string
          fecha?: string
          puntos_elo?: number | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'torneos_externos_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'torneos_externos_jugador_id_fkey'; columns: ['jugador_id']; referencedRelation: 'jugadores'; referencedColumns: ['id'] },
        ]
      }
      solicitudes_jugador: {
        Row: {
          id: string
          club_id: string | null
          nombre: string
          rut: string | null
          email: string | null
          telefono: string | null
          estado: string | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          nombre: string
          rut?: string | null
          email?: string | null
          telefono?: string | null
          estado?: string | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          nombre?: string
          rut?: string | null
          email?: string | null
          telefono?: string | null
          estado?: string | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'solicitudes_jugador_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      invitaciones: {
        Row: {
          id: string
          club_id: string | null
          codigo: string | null
          activa: boolean | null
          creado_en: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          codigo?: string | null
          activa?: boolean | null
          creado_en?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          codigo?: string | null
          activa?: boolean | null
          creado_en?: string | null
        }
        Relationships: [
          { foreignKeyName: 'invitaciones_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ]
      }
      eventos: {
        Row: {
          id: string
          club_id: string | null
          titulo: string
          descripcion: string | null
          tipo: string | null
          fecha_inicio: string | null
          fecha_fin: string | null
          creado_por: string | null
          creado_en: string | null
          hora_inicio: string | null
          hora_fin: string | null
        }
        Insert: {
          id?: string
          club_id?: string | null
          titulo: string
          descripcion?: string | null
          tipo?: string | null
          fecha_inicio?: string | null
          fecha_fin?: string | null
          creado_por?: string | null
          creado_en?: string | null
          hora_inicio?: string | null
          hora_fin?: string | null
        }
        Update: {
          id?: string
          club_id?: string | null
          titulo?: string
          descripcion?: string | null
          tipo?: string | null
          fecha_inicio?: string | null
          fecha_fin?: string | null
          creado_por?: string | null
          creado_en?: string | null
          hora_inicio?: string | null
          hora_fin?: string | null
        }
        Relationships: [
          { foreignKeyName: 'eventos_club_id_fkey'; columns: ['club_id']; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_creado_por_fkey'; columns: ['creado_por']; referencedRelation: 'usuarios'; referencedColumns: ['id'] },
        ]
      }
      club_photos: {
        Row: {
          id: number
          club_slug: string
          photo_url: string
          created_at: string | null
        }
        Insert: {
          id?: number
          club_slug: string
          photo_url: string
          created_at?: string | null
        }
        Update: {
          id?: number
          club_slug?: string
          photo_url?: string
          created_at?: string | null
        }
        Relationships: []
      }
      banco_fotos: {
        Row: {
          id: number
          url: string
          ultima_vez_usada: string
          Categoria: string
        }
        Insert: {
          id?: number
          url: string
          ultima_vez_usada: string
          Categoria: string
        }
        Update: {
          id?: number
          url?: string
          ultima_vez_usada?: string
          Categoria?: string
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

// ─── Convenience type aliases ───────────────────────────────────────────────

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertDto<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
