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
 * Empezar en limpio cuando Toki lo propuso y dijiste que sí. Sin Toki seguías en
 * la conversación de antes, y cada pedido la habría releído entera; con Toki la
 * nueva arranca en `inicio`. Cada pedido se ahorra `antes − inicio` mientras la de
 * antes no habría llegado al `tope`, donde Claude Code la habría compactado.
 */
export type Limpio = {
  /** Lo que pesaba la conversación de antes. */
  antes: number
  tope: number
  /** El caché había vencido: sin Toki, el primer pedido reescribía la conversación de antes entera. */
  frio: boolean
  /** Lo que pesó el primer pedido de la conversación nueva. */
  inicio?: number
}

/** Claude Code compacta antes de llenar la ventana: se cuenta solo hasta el 80 %, para no inflar. */
export function topeLimpio(ventana: number): number {
  return Math.round(ventana * 0.8)
}

/**
 * Un pedido de la conversación nueva: `relecturas`, lo que sin Toki se habría
 * releído del caché; `reescritura`, lo que se habría reescrito (solo el primero,
 * con el caché vencido); `sinToki`, lo que habría pesado el pedido. El primero con
 * el caché vivo no cuenta: la conversación nueva aún se escribe en el caché.
 */
export function contarLimpio(l: Limpio | undefined, contexto: number): { l: Limpio | undefined; relecturas: number; reescritura: number; sinToki: number } {
  if (l === undefined || contexto <= 0) return { l, relecturas: 0, reescritura: 0, sinToki: contexto }
  const inicio = l.inicio ?? contexto
  const evitadas = l.antes - inicio
  const sinToki = l.antes + Math.max(0, contexto - inicio)
  // La nueva ya pesa lo que la de antes, o la de antes ya se habría compactado: no queda diferencia.
  if (evitadas <= 0 || sinToki >= l.tope) return { l: undefined, relecturas: 0, reescritura: 0, sinToki: contexto }
  const siguiente = { ...l, inicio }
  if (l.inicio !== undefined) return { l: siguiente, relecturas: evitadas, reescritura: 0, sinToki }
  return { l: siguiente, relecturas: 0, reescritura: l.frio ? evitadas : 0, sinToki }
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
