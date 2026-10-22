// Lo que Toki ahorra, medido: cada pedido real contra el mismo pedido sin Toki,
// en dólares a precio de API. Funciones puras.

import { costoMedido, esEsfuerzo, precio } from './modelo'
import type { Esfuerzo, Familia } from './modelo'

/**
 * Salida de cada esfuerzo frente a medio, medida: la misma sesión de 7 mensajes
 * sin Toki en Opus 5.5, dos corridas por esfuerzo (oct 2026). Alto casi no
 * cambia nada, muy alto responde ~37 % más y máximo más del triple.
 */
export const SALIDA_RELATIVA: Record<Esfuerzo, number> = { low: 0.73, medium: 1, high: 1, xhigh: 1.37, max: 3.34 }

/** Cuántas veces la salida del esfuerzo sin Toki frente al que se usó (1 si no cambió o no se sabe). */
export function factorSalida(sinToki: unknown, usado: unknown): number {
  if (!esEsfuerzo(sinToki) || !esEsfuerzo(usado) || sinToki === usado) return 1
  return SALIDA_RELATIVA[sinToki] / SALIDA_RELATIVA[usado]
}

export type UsoMedido = { entrada: number; leido: number; escrito: number; salida: number }

/** El último pedido del hilo principal: la familia que respondió, la que habría respondido sin Toki, su tamaño y cuándo fue. */
export type PedidoPrevio = { familia: Familia; sin: Familia; tamano: number; cuando: number }

export function esPedidoPrevio(v: unknown): v is PedidoPrevio {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  const familia = (f: unknown) => f === 'haiku' || f === 'sonnet' || f === 'opus' || f === 'fable'
  return familia(p.familia) && familia(p.sin) && typeof p.tamano === 'number' && p.tamano >= 0 && typeof p.cuando === 'number'
}

/** Lo que comparten todas las conversaciones en el caché (herramientas e instrucciones), si aún no se midió. */
export const COMIENZO_TIPICO = 20_000

/**
 * Tokens que el caché de tu modelo le habría servido a este pedido sin Toki.
 * Sin cambios de modelo ni pings es lo mismo que leyó el real.
 */
export function leidoSinToki(a: {
  /** El pedido anterior del hilo principal. */
  previo?: PedidoPrevio
  /** La familia que respondió este pedido, y la que habría respondido sin Toki. */
  familia: Familia
  sin: Familia
  /** Lo que el pedido real leyó del caché, y lo que podía leer (leído + escrito). */
  leido: number
  cacheable: number
  ahora: number
  ttlMs: number
  /** Tras /clear o una compactación solo queda en común el comienzo. */
  trasLimpiar: boolean
  comienzo: number
  /** Toki mandó pings para mantener el caché desde el pedido anterior. */
  conPings: boolean
}): number {
  const p = a.previo
  if (p === undefined) return a.leido
  if (a.ahora - p.cuando > a.ttlMs) {
    // Sin los pings de Toki, el caché de la conversación habría vencido: queda el comienzo, como mucho.
    return a.conPings ? Math.min(a.leido, a.comienzo) : a.leido
  }
  // El anterior fue al mismo modelo que este: el caché real es el que habría habido.
  if (p.familia === a.familia) return a.leido
  // Sin Toki también habría cambiado (cambiaste tú de modelo): tampoco habría tenido caché.
  if (p.sin !== a.sin) return a.leido
  // Toki cambió de modelo: sin él, tu modelo tenía en caché el pedido anterior.
  const tenia = a.trasLimpiar ? Math.min(a.comienzo, p.tamano) : p.tamano
  return Math.max(a.leido, Math.min(a.cacheable, tenia))
}

/** Lo que habría costado el mismo pedido sin Toki: tu modelo, tu esfuerzo y lo que tu caché habría leído (`leido`). */
export function costoSinTokiPedido(a: { familia: Familia; uso: UsoMedido; ttl1h: boolean; factorSalida?: number; leido?: number }): number {
  const cacheable = a.uso.leido + a.uso.escrito
  const leido = Math.min(cacheable, Math.max(0, a.leido ?? a.uso.leido))
  const salida = Math.round(a.uso.salida * (a.factorSalida ?? 1))
  return costoMedido(a.familia, { entrada: a.uso.entrada, leido, escrito: cacheable - leido, salida }, a.ttl1h)
}

/**
 * Lo que cuesta que Haiku lea un mensaje dudoso para decidir el modelo (la API
 * no lo devuelve): el texto, la instrucción fija y una palabra de respuesta.
 */
export function costoClasificador(tokens: number): number {
  return costoMedido('haiku', { entrada: Math.max(0, tokens) + 300, leido: 0, escrito: 0, salida: 5 }, false)
}

/** Lo que vale no escribir esos tokens en el caché (que luego no se relean se cuenta aparte). */
export function valorEscritura(tokens: number, familia: Familia, ttl1h: boolean, contexto = 0): number {
  const p = precio(familia, contexto)
  return (tokens * (ttl1h ? p.escritura1h : p.escritura5m)) / 1_000_000
}

/** Lo que vale no releer esos tokens del caché. */
export function valorLectura(tokens: number, familia: Familia, contexto = 0): number {
  return (tokens * precio(familia, contexto).lectura) / 1_000_000
}

/** El "−18 %": cuánto menos costó que sin Toki. Solo si hubo ahorro y algo medido contra qué compararlo. */
export function porcentajeAhorro(ahorro: number, gastado: number): number | undefined {
  if (!(ahorro > 0) || !(gastado > 0) || !Number.isFinite(gastado)) return undefined
  return Math.round((ahorro / (gastado + ahorro)) * 100)
}

/** Lo que Toki ahorró en la sesión, en dólares: recortes, relecturas y modelo (menos el extra que costó). */
export type AhorroUsd = { recorte?: number; relecturas?: number; ruteo?: number; ruteoExtra?: number }

export function ahorroNeto(s: AhorroUsd): number {
  return (s.recorte ?? 0) + (s.relecturas ?? 0) + (s.ruteo ?? 0) - (s.ruteoExtra ?? 0)
}

/** Las cifras en dólares de una sesión, como las guarda Toki. */
export type CifrasUsd = { recorteUsd?: number; relecturasUsd?: number; ruteoAhorroUsd?: number; ruteoExtraUsd?: number; gastoMedidoUsd?: number }

/**
 * La cifra única: lo que Toki ahorró (neto), cuánto costó de verdad, cuánto
 * habría costado sin Toki y el "−18 %" (solo si hubo ahorro).
 */
export function resumenAhorro(s: CifrasUsd): { neto: number; gastado: number; sinToki: number; pct?: number } {
  const neto = ahorroNeto({ recorte: s.recorteUsd, relecturas: s.relecturasUsd, ruteo: s.ruteoAhorroUsd, ruteoExtra: s.ruteoExtraUsd })
  const gastado = Math.max(0, s.gastoMedidoUsd ?? 0)
  const pct = porcentajeAhorro(neto, gastado)
  return { neto, gastado, sinToki: gastado + neto, ...(pct !== undefined && pct >= 1 ? { pct } : {}) }
}

/** Menos que medio centavo no cuenta como ahorro (ni como gasto de más) para mostrarlo. */
export const CENTAVO = 0.005

/** "~$3.07", "<$0.01", "~$128" o "$0.00" (también si es negativo: eso se dice aparte). */
export function cifraUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return n >= 100 ? `~$${Math.round(n)}` : `~$${n.toFixed(2)}`
}

/** Con signo: "−$0.05" si costó de más. */
export function cifraUsdFirmada(n: number): string {
  return Number.isFinite(n) && n <= -CENTAVO ? `−${cifraUsd(-n).replace(/^~/, '')}` : cifraUsd(n)
}

/** La cifra de un día en la gráfica: "~$0.42", "−$0.05" si ese día costó de más, "·" si nada. */
export function cifraUsdDia(n: number): string {
  return !Number.isFinite(n) || Math.abs(n) < CENTAVO ? '·' : cifraUsdFirmada(n)
}

/**
 * Lo que valían los recortes y las relecturas de antes de medir en dólares, a
 * precio de Sonnet con caché de 5 min: lo más barato, para no inflar nada.
 */
export function estimarAhorroPrevio(recortados: number, relecturas: number): number {
  const r = Number.isFinite(recortados) ? Math.max(0, recortados) : 0
  const l = Number.isFinite(relecturas) ? Math.max(0, relecturas) : 0
  return valorEscritura(r, 'sonnet', false) + valorLectura(l, 'sonnet')
}
