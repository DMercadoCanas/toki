/** Lo que costó la sesión, pedido por pedido, con las cifras de la API. */
export type Gasto = {
  /** Pedidos del hilo principal. */
  pedidos: number
  /** Entrada nueva, sin caché. */
  entrada: number
  /** Leído del caché: la conversación que se reenvía en cada pedido. */
  cacheLeido: number
  /** Escrito al caché: lo nuevo de cada pedido (todo, si el caché se enfrió o cambió el modelo). */
  cacheEscrito: number
  /** Respuestas, llamadas a herramientas y razonamiento. */
  salida: number
  /** Subagentes y tareas internas de Claude Code (compactar, memoria): pedidos y tokens. */
  subPedidos: number
  subTokens: number
}

export type Sesion = {
  /** Tokens aproximados que no entraron al contexto gracias a la compactación. */
  tokensAhorrados: number
  /** Salidas de comandos compactadas en esta sesión. */
  compactaciones: number
  /** Bucles detectados (mismo comando fallando seguido). */
  bucles: number
  /** Última vez que terminó un turno, en milisegundos; 0 si aún no hay turnos. */
  ultimaActividad: number
  /** Llamadas a herramientas en esta sesión. */
  llamadas: number
  /**
   * Tokens que Claude no volvió a leer en los pedidos siguientes porque Toki los
   * sacó del contexto o compactó antes. Neto: puede bajar un momento al compactar.
   */
  relecturasEvitadas: number
  /**
   * Dólares (a precio de API) que Toki ahorró con el modelo y el esfuerzo de cada mensaje,
   * medidos: lo que costaron de verdad sus pedidos contra los mismos tokens en tu modelo
   * y tu esfuerzo, con el caché que habrían tenido. Solo los mensajes que salieron más baratos.
   */
  ruteoAhorroUsd?: number
  /** Dólares de más, medidos igual: mensajes que costaron más que sin Toki (más esfuerzo, o reescribir el caché al cambiar). */
  ruteoExtraUsd?: number
  /** Lo que valen los tokens que Toki recortó: no se escribieron en el caché. */
  recorteUsd?: number
  /** Lo que valen las relecturas evitadas (puede bajar un momento al compactar). */
  relecturasUsd?: number
  /**
   * Lo que vale haber empezado en limpio cuando Toki lo propuso: la conversación de
   * antes, que los pedidos de la nueva ya no releyeron (ni reescribieron, si el caché había vencido).
   */
  limpioUsd?: number
  /** Esos tokens de la conversación de antes. */
  limpioTokens?: number
  /**
   * Lo que vale la salida que Claude no escribió porque Toki le pidió respuestas
   * breves (estimado con lo medido: ~12 % menos salida), y esos tokens.
   */
  breveUsd?: number
  breveTokens?: number
  /** Lo que de verdad costaron los pedidos de la conversación (principal y subagentes), a precio de API. */
  gastoMedidoUsd?: number
  /**
   * Pedidos grandes al empezar algo nuevo: `con` entrevista previa y `sin` ella, y las
   * correcciones que siguieron a cada grupo; `consejos` son los tips para pedir mejor que se mostraron.
   */
  entrevista?: { con: number; conCorr: number; sin: number; sinCorr: number; consejos: number }
}

declare module 'claude-code' {
  interface PluginState {
    'toki': {
      sesion: Sesion
      gasto: Gasto
      oculto: boolean
      compacto: boolean
      detalles: boolean
      fallos: Record<string, number>
      avisoMapaDado: boolean
    }
  }
}
