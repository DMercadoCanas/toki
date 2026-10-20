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
}

declare module 'claude-code' {
  interface PluginState {
    'toki': {
      sesion: Sesion
      oculto: boolean
      compacto: boolean
      detalles: boolean
      fallos: Record<string, number>
      avisoMapaDado: boolean
    }
  }
}
