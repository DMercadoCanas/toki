/**
 * Lo que de verdad costó la sesión, pedido por pedido, y lo que Toki evitó
 * que Claude volviera a leer.
 *
 * Cada pedido a la API manda la conversación entera. Casi todo sale del caché,
 * pero se lee otra vez: lo que entra al contexto se paga de nuevo en cada
 * pedido siguiente, hasta que se compacta. Por eso sacar algo del contexto
 * temprano, o compactar antes, ahorra más que su tamaño.
 */

import type { Gasto } from '../types'

/** Lo que la API reporta de un pedido (ModelUsage). */
export type UsoPedido = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type { Gasto }

export const GASTO_VACIO: Gasto = { pedidos: 0, entrada: 0, cacheLeido: 0, cacheEscrito: 0, salida: 0, subPedidos: 0, subTokens: 0 }

/** El tamaño del pedido: todo lo que la API leyó para contestarlo. */
export function tamanoDelPedido(u: UsoPedido): number {
  return u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
}

export function sumarPedido(g: Gasto, u: UsoPedido, subagente: boolean): Gasto {
  if (subagente) return { ...g, subPedidos: g.subPedidos + 1, subTokens: g.subTokens + tamanoDelPedido(u) + u.output_tokens }
  return {
    ...g,
    pedidos: g.pedidos + 1,
    entrada: g.entrada + u.input_tokens,
    cacheLeido: g.cacheLeido + u.cache_read_input_tokens,
    cacheEscrito: g.cacheEscrito + u.cache_creation_input_tokens,
    salida: g.salida + u.output_tokens,
  }
}

export function totalPrincipal(g: Gasto): number {
  return g.entrada + g.cacheLeido + g.cacheEscrito + g.salida
}

export function totalGasto(g: Gasto): number {
  return totalPrincipal(g) + g.subTokens
}

/** Qué parte del total (en %) fue releer la conversación desde el caché. */
export function porcentajeRelectura(g: Gasto): number {
  const total = totalPrincipal(g)
  return total > 0 ? Math.round((g.cacheLeido / total) * 100) : 0
}

/**
 * Lo que Toki sacó del contexto y Claude habría releído en cada pedido.
 * `pendientes` son los que acaban de salir: el próximo pedido es el primero que
 * los habría llevado (eso ya se cuenta como ahorro directo). Desde el siguiente,
 * cada pedido es una relectura evitada.
 */
export type Relecturas = { vivos: number; pendientes: number }

export const RELECTURAS_VACIAS: Relecturas = { vivos: 0, pendientes: 0 }

export function retirar(r: Relecturas, tokens: number): Relecturas {
  return tokens > 0 ? { ...r, pendientes: r.pendientes + tokens } : r
}

/** Un pedido del hilo principal: devuelve cuántas relecturas se evitaron en él. */
export function contarPedido(r: Relecturas): { r: Relecturas; evitadas: number } {
  return { r: { vivos: r.vivos + r.pendientes, pendientes: 0 }, evitadas: r.vivos }
}

/** Tras compactar, nada de lo anterior se habría releído ya. */
export function alCompactar(): Relecturas {
  return RELECTURAS_VACIAS
}

/**
 * Compactar antes que Claude Code. Sin Toki la conversación habría seguido
 * creciendo desde `antes` hasta la ventana nativa; con Toki empieza otra vez
 * desde `despues`. Mientras la conversación "sin Toki" no habría llegado a la
 * ventana nativa, cada pedido se ahorra la diferencia. La compactación misma
 * cuesta una lectura completa (`antes`): se descuenta una vez.
 */
export type Temprana = { antes: number; nativa: number; despues?: number }

export function iniciarTemprana(antes: number, nativa: number): { t: Temprana; evitadas: number } {
  return { t: { antes, nativa }, evitadas: -antes }
}

export function contarTemprana(t: Temprana | undefined, contexto: number): { t: Temprana | undefined; evitadas: number } {
  if (t === undefined || contexto <= 0) return { t, evitadas: 0 }
  const despues = t.despues ?? contexto
  const sinToki = t.antes + Math.max(0, contexto - despues)
  // Claude Code también habría compactado: desde aquí ya no hay diferencia que contar.
  if (sinToki >= t.nativa) return { t: undefined, evitadas: 0 }
  return { t: { ...t, despues }, evitadas: Math.max(0, sinToki - contexto) }
}

/**
 * ¿Toki baja la ventana de compactación? Solo si nadie la eligió a propósito
 * (ni tú en la configuración ni con la variable de entorno), y si la de Claude
 * Code es más grande que la elegida.
 */
export type DecisionVentana =
  | { poner: number; motivo: 'bajada' }
  | { poner?: undefined; motivo: 'apagado' | 'tuya' | 'ya-baja' | 'sin-datos' }

export function decidirVentana(a: {
  elegida: number
  nativa: number | undefined
  fuente: string | undefined
  envActual: string | undefined
  puestaPorToki: string | undefined
}): DecisionVentana {
  if (a.elegida <= 0) return { motivo: 'apagado' }
  if (a.envActual !== undefined && a.envActual !== '' && a.envActual !== a.puestaPorToki) return { motivo: 'tuya' }
  if (a.fuente === 'settings') return { motivo: 'tuya' }
  if (a.nativa === undefined) return { motivo: 'sin-datos' }
  if (a.fuente !== 'env' && a.nativa <= a.elegida) return { motivo: 'ya-baja' }
  return { poner: a.elegida, motivo: 'bajada' }
}

/** "300k" → 300000; "no"/"0" → 0. Desconocido: el valor por defecto. */
export function leerVentana(valor: unknown, porDefecto = 300_000): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor <= 0 ? 0 : Math.min(1_000_000, Math.max(100_000, Math.round(valor)))
  if (typeof valor !== 'string') return porDefecto
  const v = valor.trim().toLowerCase()
  if (v === 'no' || v === 'off' || v === '0' || v === 'apagado') return 0
  const m = /^(\d+(?:\.\d+)?)\s*(k|m)?$/.exec(v)
  if (!m) return porDefecto
  const n = Number(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1)
  return Math.min(1_000_000, Math.max(100_000, Math.round(n)))
}

// ---------- Salidas repetidas ----------

/** Huella barata de un texto (FNV-1a de 32 bits + largo): para saber si dos salidas son idénticas. */
export function huella(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${h.toString(16)}:${texto.length}`
}

export type Repetida = { huella: string; cuando: number; epoca: number }

/** Las salidas más chicas no valen una línea de referencia. */
export const MIN_REPETIDA = 800
/** Pasado esto, Claude Code pudo haber limpiado la salida vieja del contexto. */
export const MAX_MS_REPETIDA = 30 * 60_000

/** ¿La salida es idéntica a la anterior del mismo comando, y esa sigue en el contexto? */
export function esRepetida(previa: Repetida | undefined, actual: Repetida, caracteres: number): boolean {
  if (previa === undefined || caracteres < MIN_REPETIDA) return false
  return previa.huella === actual.huella && previa.epoca === actual.epoca && actual.cuando - previa.cuando <= MAX_MS_REPETIDA
}
