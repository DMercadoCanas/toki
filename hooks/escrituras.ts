// Las reescrituras del caché en el hilo principal: lo que un pedido volvió a escribir aunque ya
// estaba en el caché, su causa probable y lo que costó de más frente a leerlo. Claude Code no les
// dice a los plugins por qué falló el caché (`/usage` sí lo dice), así que Toki lo deduce del
// pedido anterior: cuánto tiempo pasó, con qué modelo y esfuerzo salió y si se compactó en medio.
// Funciones puras: register.tsx mide y guarda.

import { cifraUsd, valorEscritura, valorLectura } from './ahorro'
import type { Idioma } from './idioma'
import { formatearTokens } from './mascota'
import type { Familia } from './modelo'

/**
 * Por qué se volvió a escribir lo que ya estaba en el caché:
 * - `pausa`: venció el plazo del caché (1 h con suscripción; 5 min con API, créditos de uso o nube).
 * - `modelo`: cada modelo tiene su propio caché.
 * - `esfuerzo`: en algunos modelos y proveedores, cambiar el esfuerzo vacía el caché.
 * - `compactacion`: al compactar se volvió a escribir parte del comienzo (cambiaron CLAUDE.md o la memoria, por ejemplo).
 * - `otro`: cambió algo ya enviado (herramientas MCP, modo rápido, imágenes quitadas…); `/usage` dice la causa probable.
 */
export const CAUSAS = ['pausa', 'modelo', 'esfuerzo', 'compactacion', 'otro'] as const
export type Causa = (typeof CAUSAS)[number]

/** Menos que esto se confunde con lo nuevo de cada pedido: no se anota. */
export const MIN_REESCRITURA = 5_000

/** El plazo corto del caché: el de la API, los créditos de uso y la nube (con suscripción es 1 h). */
export const TTL_CORTO_MS = 5 * 60_000

/** Las sesiones cuyo último pedido se recuerda, para medir al reanudarlas. */
export const SESIONES_GUARDADAS = 20

/** Lo que dejó en el caché un pedido del hilo principal. */
export type PedidoCache = {
  /** Leído + escrito: lo que quedó en el caché. */
  cacheado: number
  /** El modelo que respondió: cada uno tiene su caché. */
  modelo: string
  /** El esfuerzo con que salió, si el modelo lo tiene. */
  esfuerzo?: string
  /** Cuándo salió (ms): desde ahí corre el plazo del caché. */
  cuando: number
  /** Toki le cambió el modelo o el esfuerzo. */
  modeloToki?: boolean
  esfuerzoToki?: boolean
}

export type Reescritura = {
  causa: Causa
  tokens: number
  /** Los minutos sin pedidos, si fue la pausa. */
  minutos?: number
  /** El cambio de modelo o de esfuerzo fue de Toki (en este pedido o en el anterior). */
  porToki?: boolean
}

/**
 * ¿Este pedido volvió a escribir lo que el anterior dejó en el caché? Lo que no leyó de eso y
 * sí escribió es la reescritura; menos de MIN_REESCRITURA no cuenta. Tras /clear o compactar,
 * de lo anterior solo sigue sirviendo el comienzo. La causa, en orden: venció el plazo, cambió
 * el modelo, cambió el esfuerzo, una pausa de más de 5 min (con créditos de uso el plazo es
 * corto), compactar y, si nada de eso lo explica, otro cambio.
 */
export function clasificarEscritura(a: {
  previo?: PedidoCache
  actual: PedidoCache
  leido: number
  escrito: number
  /** Hubo /clear o compactación desde el pedido anterior. */
  limpio?: 'compactacion' | 'clear'
  /** Lo que mide el comienzo: instrucciones, herramientas y CLAUDE.md. */
  comienzo: number
  ttlMs: number
  /** Cuándo un ping de Toki leyó el caché por última vez (ms). */
  ultimoPing?: number
}): Reescritura | undefined {
  const p = a.previo
  if (p === undefined) return undefined
  const habia = a.limpio !== undefined ? Math.min(p.cacheado, a.comienzo) : p.cacheado
  const tokens = Math.min(a.escrito, habia - a.leido)
  if (tokens < MIN_REESCRITURA) return undefined
  const pausa = Math.max(0, a.actual.cuando - Math.max(p.cuando, a.ultimoPing ?? 0))
  const minutos = Math.round(pausa / 60_000)
  if (pausa > a.ttlMs) return { causa: 'pausa', tokens, minutos }
  if (a.actual.modelo !== p.modelo) return { causa: 'modelo', tokens, porToki: a.actual.modeloToki === true || p.modeloToki === true }
  if (a.actual.esfuerzo !== p.esfuerzo) return { causa: 'esfuerzo', tokens, porToki: a.actual.esfuerzoToki === true || p.esfuerzoToki === true }
  if (pausa > TTL_CORTO_MS) return { causa: 'pausa', tokens, minutos }
  return { causa: a.limpio === 'compactacion' ? 'compactacion' : 'otro', tokens }
}

/** Lo que costó de más escribir esos tokens en vez de leerlos del caché (`contexto`: el tamaño del pedido). */
export function costoReescritura(tokens: number, familia: Familia, ttl1h: boolean, contexto = 0): number {
  return Math.max(0, valorEscritura(tokens, familia, ttl1h, contexto) - valorLectura(tokens, familia, contexto))
}

/** La línea del diagnóstico: cuánto, por qué y cuánto de más. */
export function lineaReescritura(r: Reescritura, previo: PedidoCache, actual: PedidoCache, usd: number): string {
  const deToki = r.porToki === true ? ' (Toki)' : ''
  const porque =
    r.causa === 'pausa'
      ? `por una pausa de ${r.minutos ?? 0} min`
      : r.causa === 'modelo'
        ? `por cambio de modelo ${previo.modelo} → ${actual.modelo}${deToki}`
        : r.causa === 'esfuerzo'
          ? `por cambio de esfuerzo ${previo.esfuerzo ?? '—'} → ${actual.esfuerzo ?? '—'}${deToki}`
          : r.causa === 'compactacion'
            ? 'al compactar'
            : 'por otro cambio (ni pausa, ni modelo, ni esfuerzo)'
  return `caché reescrito: ${formatearTokens(r.tokens)} ${porque}, ${cifraUsd(usd)} de más`
}

/** Lo anotado de una causa: cuántas veces, cuántos tokens y cuánto de más (USD a precio de API). */
export type Asiento = { veces: number; tokens: number; usd: number }
export type LibroCache = Partial<Record<Causa, Asiento>>

export function anotar(libro: LibroCache, causa: Causa, tokens: number, usd: number): LibroCache {
  const a = libro[causa] ?? { veces: 0, tokens: 0, usd: 0 }
  return { ...libro, [causa]: { veces: a.veces + 1, tokens: a.tokens + Math.max(0, tokens), usd: a.usd + Math.max(0, usd) } }
}

export function totalLibro(libro: LibroCache): Asiento {
  const total = { veces: 0, tokens: 0, usd: 0 }
  for (const c of CAUSAS) {
    const a = libro[c]
    if (a === undefined) continue
    total.veces += a.veces
    total.tokens += a.tokens
    total.usd += a.usd
  }
  return total
}

/** Las causas anotadas, de la que más costó a la que menos. */
export function causasPorCosto(libro: LibroCache): Causa[] {
  const usd = (c: Causa) => libro[c]?.usd ?? 0
  return CAUSAS.filter(c => (libro[c]?.veces ?? 0) > 0).sort((a, b) => usd(b) - usd(a))
}

function positivo(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0
}

/** Lo guardado, saneado: solo causas conocidas, con al menos una vez. */
export function leerLibro(v: unknown): LibroCache {
  const libro: LibroCache = {}
  if (v === null || typeof v !== 'object') return libro
  for (const c of CAUSAS) {
    const a = (v as Record<string, unknown>)[c]
    if (a === null || typeof a !== 'object') continue
    const r = a as Record<string, unknown>
    const veces = Math.round(positivo(r['veces']))
    if (veces > 0) libro[c] = { veces, tokens: positivo(r['tokens']), usd: positivo(r['usd']) }
  }
  return libro
}

/** Un pedido guardado, saneado; lo que no se entiende no cuenta. */
export function leerPedidoCache(v: unknown): PedidoCache | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  const { cacheado, modelo, esfuerzo, cuando } = p
  if (typeof cacheado !== 'number' || !Number.isFinite(cacheado) || cacheado < 0) return undefined
  if (typeof modelo !== 'string' || modelo === '' || typeof cuando !== 'number' || !Number.isFinite(cuando)) return undefined
  const salida: PedidoCache = { cacheado, modelo, cuando }
  if (typeof esfuerzo === 'string') salida.esfuerzo = esfuerzo
  if (p['modeloToki'] === true) salida.modeloToki = true
  if (p['esfuerzoToki'] === true) salida.esfuerzoToki = true
  return salida
}

/** El último pedido de cada sesión, para medir al reanudarla. */
export function leerCachePorSesion(v: unknown): Record<string, PedidoCache> {
  const salida: Record<string, PedidoCache> = {}
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return salida
  for (const [id, p] of Object.entries(v as Record<string, unknown>)) {
    const pedido = leerPedidoCache(p)
    if (pedido !== undefined) salida[id] = pedido
  }
  return salida
}

/** Anota el último pedido de la sesión `id` y deja solo las SESIONES_GUARDADAS más recientes. */
export function conSesion(guardadas: Record<string, PedidoCache>, id: string, p: PedidoCache): Record<string, PedidoCache> {
  const todas = Object.entries({ ...guardadas, [id]: p }).sort(([, a], [, b]) => b.cuando - a.cuando)
  return Object.fromEntries(todas.slice(0, SESIONES_GUARDADAS))
}

/** Cómo se llama cada causa en `/toki` y en la tarjeta de la semana. */
export const NOMBRES_CAUSA: Record<Idioma, Record<Causa, string>> = {
  es: { pausa: 'pausas', modelo: 'cambios de modelo', esfuerzo: 'cambios de esfuerzo', compactacion: 'compactar', otro: 'otros cambios' },
  en: { pausa: 'pauses', modelo: 'model switches', esfuerzo: 'effort switches', compactacion: 'compaction', otro: 'other changes' },
}

/** Cada causa con lo que costó de más, de la que más costó a la que menos. */
export function porCausa(libro: LibroCache, idioma: Idioma): { nombre: string; usd: string }[] {
  return causasPorCosto(libro).map(c => ({ nombre: NOMBRES_CAUSA[idioma][c], usd: cifraUsd(libro[c]?.usd ?? 0) }))
}
