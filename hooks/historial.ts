// Historial de ahorro por día y la gráfica del panel. Funciones puras.

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

export function totalDesde(historial: Historial, ms: number, dias: number): number {
  let total = 0
  for (let i = 0; i < dias; i++) total += historial[claveDia(ms - i * 86_400_000)] ?? 0
  return total
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** Filas de la gráfica: últimos N días, con barra proporcional al máximo. */
export function filasGrafica(historial: Historial, ms: number, dias: number, anchoBarra: number): { etiqueta: string; barra: string; valor: string; tokens: number; esHoy: boolean }[] {
  const filas: { clave: string; tokens: number; fecha: Date }[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const t = ms - i * 86_400_000
    const clave = claveDia(t)
    filas.push({ clave, tokens: historial[clave] ?? 0, fecha: new Date(t) })
  }
  const maximo = Math.max(1, ...filas.map(f => f.tokens))
  return filas.map((f, i) => {
    const lleno = f.tokens === 0 ? 0 : Math.max(1, Math.round((f.tokens / maximo) * anchoBarra))
    return {
      etiqueta: `${DIAS_SEMANA[f.fecha.getDay()]} ${String(f.fecha.getDate()).padStart(2, ' ')}`,
      barra: '█'.repeat(lleno) + '░'.repeat(anchoBarra - lleno),
      valor: f.tokens === 0 ? '·' : `~${formatearTokens(f.tokens)}`,
      tokens: f.tokens,
      esHoy: i === filas.length - 1,
    }
  })
}

/** Lo que Toki aprende de la sesión: una lección por tipo, sin repetir. */
export type Leccion = { clave: string; texto: string }

export function agregarLeccion(lista: Leccion[], leccion: Leccion): Leccion[] {
  if (lista.some(l => l.clave === leccion.clave)) return lista
  return [...lista, leccion].slice(-8)
}

/** Lección del cambio de modelo con el caché caliente. */
export function leccionCambioModelo(contextTokens: number, usd: number, deModelo: string, aModelo: string): Leccion {
  const costo = usd >= 0.01 ? ` (~$${usd.toFixed(2)})` : ''
  return {
    clave: 'cambio-modelo',
    texto: `Cambiaste de ${nombreModelo(deModelo)} a ${nombreModelo(aModelo)} con el caché caliente: el próximo mensaje reprocesó ~${formatearTokens(contextTokens)} tokens${costo}. Elige el modelo al inicio de la sesión; para una tarea chica, delega a un subagente con model: haiku.`,
  }
}

export function nombreModelo(id: string): string {
  const m = id.toLowerCase()
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  if (m.includes('fable')) return 'Fable'
  return id
}
