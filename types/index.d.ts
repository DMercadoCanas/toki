export type Sesion = {
  /** Tokens aproximados que no entraron al contexto gracias a la compactación. */
  tokensAhorrados: number
  /** Salidas de comandos compactadas en esta sesión. */
  compactaciones: number
  /** Bucles detectados (mismo comando fallando seguido). */
  bucles: number
  /** Última vez que terminó un turno, en milisegundos; 0 si aún no hay turnos. */
  ultimaActividad: number
}

declare module 'claude-code' {
  interface PluginState {
    'ahorro-tokens': {
      sesion: Sesion
      oculto: boolean
      fallos: Record<string, number>
      avisoMapaDado: boolean
    }
  }
}
