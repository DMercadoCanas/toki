// Historial de ahorro por día y la gráfica del panel. Funciones puras.

import { CENTAVO } from './ahorro'
import { t } from './idioma'
import type { Idioma } from './idioma'
import { formatearTokens } from './mascota'

export type Historial = Record<string, number> // 'AAAA-MM-DD' → tokens ahorrados ese día

export const DIAS_GUARDADOS = 60

export function claveDia(ms: number): string {
  const d = new Date(ms)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Suma al día de hoy y recorta a los últimos 60 días para que el store no crezca. */
export function sumarAlDia(historial: Historial, ms: number, tokens: number): Historial {
  const clave = claveDia(ms)
  const siguiente: Historial = { ...historial, [clave]: (historial[clave] ?? 0) + tokens }
  const claves = Object.keys(siguiente).sort()
  for (const vieja of claves.slice(0, Math.max(0, claves.length - DIAS_GUARDADOS))) delete siguiente[vieja]
  return siguiente
}

/** Junta dos historiales sumando día a día (p. ej. el de la versión anterior del plugin). */
export function fusionarHistorial(a: Historial, b: Historial): Historial {
  let salida: Historial = { ...a }
  for (const [dia, tokens] of Object.entries(b)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) continue
    salida = { ...salida, [dia]: (salida[dia] ?? 0) + tokens }
  }
  const claves = Object.keys(salida).sort()
  for (const vieja of claves.slice(0, Math.max(0, claves.length - DIAS_GUARDADOS))) delete salida[vieja]
  return salida
}

export function totalDesde(historial: Historial, ms: number, dias: number): number {
  let total = 0
  for (let i = 0; i < dias; i++) total += historial[claveDia(ms - i * 86_400_000)] ?? 0
  return total
}

/**
 * Filas de la gráfica: últimos N días, con barra proporcional al máximo.
 * `formato` escribe la cifra de cada día ('·' = nada ese día); `tokens` es la
 * cifra del día (tokens o dólares, según el historial).
 */
export function filasGrafica(
  historial: Historial,
  ms: number,
  dias: number,
  anchoBarra: number,
  idioma: Idioma = 'es',
  formato: (n: number) => string = n => (n > 0 ? `~${formatearTokens(n)}` : '·'),
): { etiqueta: string; barra: string; valor: string; tokens: number; esHoy: boolean }[] {
  const DIAS_SEMANA = t(idioma).diasSemana
  const filas: { clave: string; tokens: number; fecha: Date }[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const momento = ms - i * 86_400_000
    const clave = claveDia(momento)
    const n = historial[clave] ?? 0
    filas.push({ clave, tokens: Number.isFinite(n) ? n : 0, fecha: new Date(momento) })
  }
  // Un día en negativo (costó de más) no tiene barra: se ve en su cifra.
  const maximo = Math.max(0, ...filas.map(f => f.tokens))
  return filas.map((f, i) => {
    const valor = formato(f.tokens)
    const lleno = valor === '·' || f.tokens <= 0 || maximo <= 0 ? 0 : Math.max(1, Math.round((f.tokens / maximo) * anchoBarra))
    return {
      etiqueta: `${DIAS_SEMANA[f.fecha.getDay()]} ${String(f.fecha.getDate()).padStart(2, ' ')}`,
      barra: '█'.repeat(lleno) + '░'.repeat(anchoBarra - lleno),
      valor,
      tokens: f.tokens,
      esHoy: i === filas.length - 1,
    }
  })
}

/** Los días con algún ahorro, en tokens o en dólares (para la racha): 1 = hubo. */
export function hayAhorro(tokens: Historial, usd: Historial): Historial {
  const dias: Historial = {}
  for (const [dia, n] of Object.entries(tokens)) if (typeof n === 'number' && n > 0) dias[dia] = 1
  for (const [dia, n] of Object.entries(usd)) if (typeof n === 'number' && n >= CENTAVO) dias[dia] = 1
  return dias
}

/** Lo que Toki aprende de la sesión: una lección por tipo, sin repetir. */
export type Leccion = { clave: string; texto: string }

export function agregarLeccion(lista: Leccion[], leccion: Leccion): Leccion[] {
  if (lista.some(l => l.clave === leccion.clave)) return lista
  return [...lista, leccion].slice(-8)
}

/** Lección del cambio de modelo con el caché caliente. */
export function leccionCambioModelo(contextTokens: number, usd: number, deModelo: string, aModelo: string, idioma: Idioma = 'es'): Leccion {
  const costo = usd >= 0.01 ? ` (~$${usd.toFixed(2)})` : ''
  return { clave: 'cambio-modelo', texto: t(idioma).leccionModelo(nombreModelo(deModelo), nombreModelo(aModelo), formatearTokens(contextTokens), costo) }
}

/** Días seguidos (hasta hoy, o hasta ayer si hoy aún no hay ahorro) con algún ahorro. */
export function racha(historial: Historial, ms: number): number {
  let n = 0
  let i = (historial[claveDia(ms)] ?? 0) > 0 ? 0 : 1
  while ((historial[claveDia(ms - i * 86_400_000)] ?? 0) > 0) {
    n += 1
    i += 1
  }
  return n
}

export const LOGROS = ['primero', 'diez', 'cien', 'millon', 'racha3', 'racha7', 'memoria', 'rescate'] as const
export type Logro = (typeof LOGROS)[number]

export type Cifras = {
  /** Tokens recortados desde siempre. */
  total: number
  /** Lo ahorrado desde siempre en dólares (neto): el primer ahorro también cuenta así. */
  usd?: number
  racha: number
  /** Toki le recordó la tarea a Claude después de una compactación. */
  memoria?: boolean
  /** Toki rescató errores que un `| tail` escondía. */
  rescate?: boolean
}

/** Qué logros se desbloquean con las cifras actuales (solo los que faltaban). */
export function logrosNuevos(ya: readonly string[], c: Cifras): Logro[] {
  const cumple: Record<Logro, boolean> = {
    primero: c.total > 0 || (c.usd ?? 0) >= 0.01,
    diez: c.total >= 10_000,
    cien: c.total >= 100_000,
    millon: c.total >= 1_000_000,
    racha3: c.racha >= 3,
    racha7: c.racha >= 7,
    memoria: c.memoria === true,
    rescate: c.rescate === true,
  }
  return LOGROS.filter(l => cumple[l] && !ya.includes(l))
}

/** Líneas que guarda `.claude/toki/diagnostico.txt` entre sesiones: varios días de decisiones, para revisar y calibrar a Toki. */
export const LINEAS_DIAGNOSTICO = 1000

/** Agrega una línea al registro (siempre en una sola línea) y deja solo las últimas `max`. */
export function agregarAlRegistro(previo: string, linea: string, max = LINEAS_DIAGNOSTICO): string {
  const lineas = previo.split('\n').filter(l => l.trim() !== '')
  lineas.push(linea.replace(/\s*[\r\n]+\s*/g, ' ').trim())
  return `${lineas.slice(-max).join('\n')}\n`
}

export function nombreModelo(id: string): string {
  const m = id.toLowerCase()
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  if (m.includes('fable')) return 'Fable'
  return id
}
