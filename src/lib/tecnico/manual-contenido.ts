/** Contenido del manual técnico (piloto). Una sola fuente para UI. */

export type EntradaGlosario = {
  id: string
  nombre: string
  significado: string
  /** Texto corto para tooltip “cómo se calcula”. */
  comoSeCalcula: string
  comoSeLlena: string
}

export const GLOSARIO_INDICADORES: EntradaGlosario[] = [
  {
    id: 'sesiones',
    nombre: 'Sesiones',
    significado: 'Cantidad de análisis/entrenamientos técnicos registrados para el jugador (en el filtro activo).',
    comoSeCalcula: 'Cuenta de sesiones no archivadas que pasan el filtro de tipo.',
    comoSeLlena: 'Se crea al subir un video o abrir una sesión nueva en + Nueva sesión.',
  },
  {
    id: 'eventos',
    nombre: 'Eventos',
    significado: 'Cada marca que el profe hace en el video (golpe + zona + resultado).',
    comoSeCalcula: 'Total de filas de eventos del jugador en el filtro.',
    comoSeLlena: 'En la sesión: eliges golpe, resultado/fase y tocas una zona de la mesa.',
  },
  {
    id: 'efectividad',
    nombre: 'Efectividad',
    significado: 'Porcentaje de puntos ganados entre los que terminaron ganado o perdido.',
    comoSeCalcula: 'ganados ÷ (ganados + perdidos) × 100. “En juego” no entra.',
    comoSeLlena: 'Solo cuentan eventos con resultado “Ganado” o “Perdido”. “En juego” no entra.',
  },
  {
    id: 'error',
    nombre: '% Error',
    significado: 'Qué tan seguido aparece el golpe ERR en el etiquetado.',
    comoSeCalcula: 'eventos con golpe ERR ÷ total de eventos × 100.',
    comoSeLlena: 'Marcas golpe ERR. Bajar este % suele ser mejorar.',
  },
  {
    id: 'servicio',
    nombre: 'Servicio',
    significado: 'De los servicios marcados (SER), cuántos terminaron en punto ganado.',
    comoSeCalcula: 'SER con resultado ganado ÷ todos los SER × 100.',
    comoSeLlena: 'Golpe SER + resultado Ganado / resto de SER.',
  },
  {
    id: 'efectividad-golpe',
    nombre: 'Efectividad por golpe',
    significado: 'Misma efectividad, separada por SER, DER, REV y BLQ.',
    comoSeCalcula: 'Por cada golpe: ganados ÷ (ganados + perdidos) de ese golpe.',
    comoSeLlena: 'Se calcula solo con eventos de ese golpe que tienen resultado ganado/perdido.',
  },
  {
    id: 'zonas',
    nombre: 'Mapa / zonas de mesa',
    significado: 'A qué casillas (1–9) va más la pelota según lo marcado.',
    comoSeCalcula: 'Conteo por zona. Bandas: 1–3 corta, 4–6 media, 7–9 profunda (en %).',
    comoSeLlena: 'Al tocar la grilla 1–9 al registrar. Bandas: corta 1–3, media 4–6, profunda 7–9.',
  },
  {
    id: 'en-juego',
    nombre: 'En juego',
    significado: 'Cuánto del etiquetado es peloteo sin punto cerrado.',
    comoSeCalcula: 'eventos con resultado “en_juego” ÷ total × 100.',
    comoSeLlena: 'Resultado “En juego”.',
  },
  {
    id: 'decisivos',
    nombre: 'Puntos decisivos',
    significado: 'Cuánto del etiquetado termina en punto (ganado o perdido).',
    comoSeCalcula: '(ganados + perdidos) ÷ total de eventos × 100.',
    comoSeLlena: 'Resultados “Ganado” + “Perdido” sobre el total de eventos.',
  },
  {
    id: 'racha',
    nombre: 'Racha ERR',
    significado: 'La mayor cantidad de errores seguidos en el orden del video.',
    comoSeCalcula: 'Máxima secuencia consecutiva de golpe ERR.',
    comoSeLlena: 'Secuencias consecutivas de golpe ERR.',
  },
  {
    id: 'consistencia',
    nombre: 'Consistencia',
    significado: 'Resumen inverso del error: menos error = más consistencia.',
    comoSeCalcula: '100 − (% Error), acotado entre 0 y 100.',
    comoSeLlena: 'Automático a partir de % Error.',
  },
  {
    id: 'muestra',
    nombre: 'Muestra',
    significado: 'Si hay suficientes eventos para confiar en los % (baja / media / alta).',
    comoSeCalcula: 'Baja <15 · Media 15–39 · Alta ≥40 eventos etiquetados.',
    comoSeLlena: 'Baja <15 eventos · Media 15–39 · Alta ≥40. No mide calidad de juego, solo volumen etiquetado.',
  },
  {
    id: 'rating',
    nombre: 'Rating',
    significado: 'Promedio 0–100 de control, ataque, servicio, regularidad y eficacia. Heurístico, no oficial.',
    comoSeCalcula: 'Promedio de 5 ratings derivados de efectividad, errores y servicio.',
    comoSeLlena: 'Se deriva de efectividad, errores y servicio. Sirve para comparar de un vistazo.',
  },
  {
    id: 'fase',
    nombre: 'Por fase',
    significado: 'Cuántos eventos ocurrieron en servicio, peloteo o punto decisivo.',
    comoSeCalcula: 'Conteo agrupado por el campo fase de cada evento.',
    comoSeLlena: 'Campo Fase al marcar (se sugiere solo: SER→servicio, punto cerrado→decisivo, resto→peloteo).',
  },
  {
    id: 'tipo-error',
    nombre: 'Tipos de error',
    significado: 'Desglose de ERR: red, largo, fuera u otro.',
    comoSeCalcula: 'Conteo de ERR tipificados ÷ (solo los que tienen tipo marcado).',
    comoSeLlena: 'Cuando eliges golpe ERR, aparece el tipo. Si no lo marcas, no hay desglose.',
  },
  {
    id: 'objetivos',
    nombre: 'Nota objetivos',
    significado: 'Promedio de las notas 0–100 que el profe puso en ítems de evaluación.',
    comoSeCalcula: 'Promedio de valores numéricos guardados en objetivos evaluados.',
    comoSeLlena: 'En la evaluación de la sesión: estado + nota opcional + comentario. Publicar deja visible al jugador.',
  },
  {
    id: 'filtro-tipo',
    nombre: 'Filtro tipo de sesión',
    significado: 'Separa entrenamiento, partido, video libre o evaluación para no mezclar contextos.',
    comoSeCalcula: 'Filtra sesiones y recalcula todas las métricas solo con esas.',
    comoSeLlena: 'Selector en historial y en cara a cara. Las métricas se recalculan con ese filtro.',
  },
]

/** Busca glosario por nombre de KPI (coincide con labels de la UI). */
export function glosarioPorLabel(label: string): EntradaGlosario | undefined {
  const key = label.trim().toLowerCase()
  const alias: Record<string, string> = {
    sesiones: 'sesiones',
    eventos: 'eventos',
    efectividad: 'efectividad',
    'efectividad de puntos': 'efectividad',
    '% error': 'error',
    error: 'error',
    'en juego': 'en-juego',
    'puntos decisivos': 'decisivos',
    decisivos: 'decisivos',
    consistencia: 'consistencia',
    'racha err': 'racha',
    servicio: 'servicio',
    'servicio efectivo': 'servicio',
    'servicio usado': 'servicio',
    rating: 'rating',
    muestra: 'muestra',
    'nota objetivos': 'objetivos',
    'objetivos logrados': 'objetivos',
    '% objetivos': 'objetivos',
    'golpe principal': 'efectividad-golpe',
    'efectividad por golpe': 'efectividad-golpe',
    'zona principal': 'zonas',
    'zonas de la mesa': 'zonas',
    'mapa / zonas de mesa': 'zonas',
    'error tipificado': 'tipo-error',
    'tipos de error': 'tipo-error',
    'fase principal': 'fase',
    'por fase': 'fase',
  }
  const id = alias[key]
  if (!id) return GLOSARIO_INDICADORES.find(g => g.nombre.toLowerCase() === key)
  return GLOSARIO_INDICADORES.find(g => g.id === id)
}

export const PASOS_USO_RAPIDO = [
  {
    titulo: '1. Entrar al módulo',
    texto: 'Menú → Perfil técnico. También desde la ficha del jugador → botón Perfil técnico.',
  },
  {
    titulo: '2. Revisar el panorama',
    texto: 'Mira KPIs, alertas de plan atrasado y las tarjetas de jugadores. La actividad reciente va abajo con filtro de fechas.',
  },
  {
    titulo: '3. Ver historial de un jugador',
    texto: 'Ver progreso técnico: gráficos, mes vs mes, indicadores y objetivos. Usa el filtro de tipo de sesión si quieres solo partidos o solo entrenamientos.',
  },
  {
    titulo: '4. Comparar (cara a cara)',
    texto: 'Elige dos jugadores y período/tipo. Sirve para ver quién está mejor en servicio, error, ratings, etc.',
  },
  {
    titulo: '5. Objetivos y planes',
    texto: 'Objetivos = catálogo del club. Planes = ejercicios ordenados asignados a jugadores. El cumplimiento se llena al hacer sesiones tipo Entrenamiento con plan+ejercicio.',
  },
  {
    titulo: '6. Nueva sesión con video',
    texto: 'Graba en cancha → + Nueva sesión → elige jugador y tipo → sube el video. Luego marca golpes en la línea de tiempo.',
  },
  {
    titulo: '7. Evaluar y publicar',
    texto: 'Completa resumen, estados de objetivos y nota opcional. Publicar deja la sesión visible para el jugador.',
  },
  {
    titulo: '8. Asesor IA (opcional)',
    texto: 'En el historial, pide focos o comparación de meses. Sugiere, no decide. Requiere clave OpenAI y respeta cuota.',
  },
]

export const NOTAS_IMPORTANTES = [
  'La fuente de verdad es lo que marca el humano. La IA y los ratings son apoyo.',
  'Subir video funciona desde cualquier PC. Optimizar (FFmpeg) hoy solo en un PC local con el proyecto; en Vercel puedes marcar igual sobre el original.',
  'Sin publicar la evaluación, el jugador no ve esa sesión.',
]
