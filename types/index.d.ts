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
