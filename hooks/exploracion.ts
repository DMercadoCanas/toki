// Exploración en la conversación principal: búsquedas y lecturas seguidas, sin editar nada.
// Todo lo que entra se reenvía en cada pedido que sigue. Pasado cierto tamaño, conviene que un
// subagente Explore siga buscando: usa un modelo más barato y devuelve solo lo que encontró.
// Lógica pura: sin dependencias del motor.

import { esBusqueda } from './mapa'

export type Exploracion = { llamadas: number; busquedas: number; caracteres: number }

export const EXPLORACION_VACIA: Exploracion = { llamadas: 0, busquedas: 0, caracteres: 0 }

/** Desde aquí conviene delegar: varias llamadas, más de una búsqueda y ~5k tokens ya en la conversación. */
export const UMBRAL_EXPLORACION = { llamadas: 5, busquedas: 2, caracteres: 20_000 } as const

export type PasoExploracion = 'busqueda' | 'lectura' | 'edicion' | 'delegacion'

const EDICIONES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DELEGACIONES = new Set(['Agent', 'Task'])
/** Leer por la terminal: cat, head, tail, bat, nl o sed -n (sed -i edita). */
const LECTURA_SHELL = /^\s*(cat|head|tail|bat|nl)\b|^\s*sed\s+-n\b/
const BUSQUEDA_PS = /^\s*(select-string|sls)\b|^\s*(get-childitem|gci|dir|ls)\b[^|;]*\s-r(ecurse)?\b/i
const LECTURA_PS = /^\s*(get-content|gc|type)\b/i

/** Qué es la llamada para la exploración; undefined si no cuenta (correr tests, instalar, etc.). */
export function pasoExploracion(herramienta: string, comando?: string): PasoExploracion | undefined {
  if (EDICIONES.has(herramienta)) return 'edicion'
  if (DELEGACIONES.has(herramienta)) return 'delegacion'
  if (herramienta === 'Read') return 'lectura'
  if (herramienta === 'PowerShell') {
    if (comando === undefined) return undefined
    return BUSQUEDA_PS.test(comando) ? 'busqueda' : LECTURA_PS.test(comando) ? 'lectura' : undefined
  }
  if (esBusqueda(herramienta, comando)) return 'busqueda'
  return herramienta === 'Bash' && comando !== undefined && LECTURA_SHELL.test(comando) ? 'lectura' : undefined
}

/** Suma una llamada. Editar o delegar cierra la racha: ya no se está explorando a mano. */
export function sumarPaso(e: Exploracion, paso: PasoExploracion | undefined, caracteres: number): Exploracion {
  if (paso === 'edicion' || paso === 'delegacion') return EXPLORACION_VACIA
  if (paso === undefined) return e
  return { llamadas: e.llamadas + 1, busquedas: e.busquedas + (paso === 'busqueda' ? 1 : 0), caracteres: e.caracteres + caracteres }
}

export function tocaDelegar(e: Exploracion): boolean {
  const u = UMBRAL_EXPLORACION
  return e.llamadas >= u.llamadas && e.busquedas >= u.busquedas && e.caracteres >= u.caracteres
}
