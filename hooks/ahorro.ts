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

/** Mensajes enteros de un grupo, sus pedidos al modelo y la salida que escribieron. */
export type GrupoMedido = { mensajes: number; pedidos: number; salida: number }

/**
 * Lo medido de un tipo de mensaje que Toki baja de esfuerzo solo, en el mismo modelo
 * (`claude-opus-5-5|trivial|xhigh>low`): los que bajó y los testigos, que habría
 * bajado y dejó con tu esfuerzo para comparar. `candidatos`: cuántos pudo bajar.
 */
export type CeldaEsfuerzo = { candidatos: number; bajados: GrupoMedido; testigos: GrupoMedido }
export type CalibracionEsfuerzo = Record<string, CeldaEsfuerzo>

/** 1 de cada tantos mensajes que Toki bajaría de esfuerzo va con el tuyo, de testigo... */
export const CADA_TESTIGO = 10
/** ...hasta juntar estos por tipo de mensaje: ahí lo medido ya pesa 3/4 y no hace falta apartar más. */
export const TESTIGOS_META = 30
/** Lo medido con n testigos pesa n / (n + PESO_PREVIO) frente al punto de partida. */
const PESO_PREVIO = 10
/** Cuántos tipos de mensaje recuerda (los modelos cambian de versión): los más nuevos. */
const MAX_CELDAS = 24

export function claveEsfuerzo(modelo: string, nivel: string, desde: Esfuerzo, hacia: Esfuerzo): string {
  return `${modelo}|${nivel}|${desde}>${hacia}`
}

function celdaVacia(): CeldaEsfuerzo {
  return { candidatos: 0, bajados: { mensajes: 0, pedidos: 0, salida: 0 }, testigos: { mensajes: 0, pedidos: 0, salida: 0 } }
}

/** Al próximo mensaje que Toki pueda bajar en esta celda le toca ir de testigo. */
export function tocaTestigo(celda: CeldaEsfuerzo | undefined): boolean {
  const c = celda ?? celdaVacia()
  return c.testigos.mensajes < TESTIGOS_META && c.candidatos % CADA_TESTIGO === CADA_TESTIGO - 1
}

/** Cuántas veces más salida escribe un testigo que un mensaje bajado, por mensaje. Sin datos de los dos, nada. */
export function salidaMedida(celda: CeldaEsfuerzo | undefined): number | undefined {
  if (celda === undefined || celda.testigos.mensajes === 0 || celda.bajados.mensajes === 0 || !(celda.bajados.salida > 0)) return undefined
  return celda.testigos.salida / celda.testigos.mensajes / (celda.bajados.salida / celda.bajados.mensajes)
}

/**
 * La salida de tu esfuerzo frente a la del que usó Toki, para contar lo ahorrado.
 * Si Toki subió el esfuerzo, la tabla entera: lo que costó de más se cuenta completo.
 * Si lo bajó, sin testigos la mitad de lo que dice la tabla (sale de una sola prueba de
 * 7 mensajes); con testigos, lo medido pesa más cuantos más hay. Nunca más que la
 * tabla ni menos de 1.
 */
export function factorCalibrado(sinToki: unknown, usado: unknown, celda?: CeldaEsfuerzo): number {
  const tabla = factorSalida(sinToki, usado)
  if (tabla <= 1) return tabla
  const previo = 1 + (tabla - 1) / 2
  const medido = salidaMedida(celda)
  if (medido === undefined || celda === undefined) return previo
  const peso = celda.testigos.mensajes / (celda.testigos.mensajes + PESO_PREVIO)
  return Math.min(tabla, Math.max(1, previo + (medido - previo) * peso))
}

function conCelda(cal: CalibracionEsfuerzo, clave: string, cambiar: (c: CeldaEsfuerzo) => CeldaEsfuerzo): CalibracionEsfuerzo {
  const { [clave]: vieja, ...otras } = cal
  // La que se toca pasa al final: al recortar se van las que hace más que no se usan.
  return Object.fromEntries([...Object.entries(otras), [clave, cambiar(vieja ?? celdaVacia())] as const].slice(-MAX_CELDAS))
}

/** Un mensaje más que Toki pudo bajar en esta celda (vaya bajado o de testigo). */
export function contarCandidato(cal: CalibracionEsfuerzo, clave: string): CalibracionEsfuerzo {
  return conCelda(cal, clave, c => ({ ...c, candidatos: c.candidatos + 1 }))
}

/** Un mensaje terminado, a su grupo. */
export function sumarACalibracion(cal: CalibracionEsfuerzo, clave: string, grupo: 'bajados' | 'testigos', m: { pedidos: number; salida: number }): CalibracionEsfuerzo {
  return conCelda(cal, clave, c => {
    const g = c[grupo]
    const suma = { mensajes: g.mensajes + 1, pedidos: g.pedidos + m.pedidos, salida: g.salida + m.salida }
    return grupo === 'bajados' ? { ...c, bajados: suma } : { ...c, testigos: suma }
  })
}

/** Lo guardado, celda por celda: lo que no tenga la forma se descarta. */
export function leerCalibracion(v: unknown): CalibracionEsfuerzo {
  if (typeof v !== 'object' || v === null) return {}
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined)
  const grupo = (g: unknown): GrupoMedido | undefined => {
    if (typeof g !== 'object' || g === null) return undefined
    const r = g as Record<string, unknown>
    const mensajes = n(r['mensajes'])
    const pedidos = n(r['pedidos'])
    const salida = n(r['salida'])
    return mensajes === undefined || pedidos === undefined || salida === undefined ? undefined : { mensajes, pedidos, salida }
  }
  const celdas: [string, CeldaEsfuerzo][] = []
  for (const [clave, c] of Object.entries(v)) {
    if (typeof c !== 'object' || c === null) continue
    const r = c as Record<string, unknown>
    const candidatos = n(r['candidatos'])
    const bajados = grupo(r['bajados'])
    const testigos = grupo(r['testigos'])
    if (candidatos !== undefined && bajados !== undefined && testigos !== undefined) celdas.push([clave, { candidatos, bajados, testigos }])
  }
  return Object.fromEntries(celdas.slice(-MAX_CELDAS))
}

/**
 * Salida con respuestas breves frente a sin ellas, medida: los mismos guiones sin
 * Toki en Opus 5.5, tres corridas por brazo (oct 2026, evals/modo-breve). Con
 * tareas de código bajó un 12 % y con preguntas abiertas un 15 %: se usa la menor.
 */
export const SALIDA_BREVE = 0.88

/**
 * La salida que Claude no escribió por las respuestas breves: sin ellas, la de este
 * pedido habría sido 1/0,88 veces mayor (y `factorEsfuerzo` veces, con tu esfuerzo).
 */
export function salidaEvitadaBreve(salida: number, factorEsfuerzo = 1): number {
  if (!(salida > 0) || !(factorEsfuerzo > 0) || !Number.isFinite(salida * factorEsfuerzo)) return 0
  return salida * factorEsfuerzo * (1 / SALIDA_BREVE - 1)
}

/** Lo que vale esa salida, a precio del modelo que la habría escrito sin Toki. */
export function ahorroBreve(salida: number, familia: Familia, contexto = 0, factorEsfuerzo = 1): number {
  return (salidaEvitadaBreve(salida, factorEsfuerzo) * precio(familia, contexto).salida) / 1_000_000
}

/** Lo que mide la sección de respuestas breves en el system prompt: 201 tokens en Opus 5.5, con margen. */
export const TOKENS_BREVE = 210

/**
 * Lo que cuesta mandar la sección en un pedido, que se descuenta de lo que ahorra:
 * se lee del caché, o se escribe si el pedido escribió la conversación de nuevo.
 */
export function costoSeccionBreve(familia: Familia, escrita: boolean, ttl1h: boolean, contexto = 0): number {
  return escrita ? valorEscritura(TOKENS_BREVE, familia, ttl1h, contexto) : valorLectura(TOKENS_BREVE, familia, contexto)
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

/** Lo que Toki ahorró en la sesión, en dólares: recortes, relecturas, empezar en limpio, respuestas breves y modelo (menos el extra que costó). */
export type AhorroUsd = { recorte?: number; relecturas?: number; limpio?: number; breve?: number; ruteo?: number; ruteoExtra?: number }

export function ahorroNeto(s: AhorroUsd): number {
  return (s.recorte ?? 0) + (s.relecturas ?? 0) + (s.limpio ?? 0) + (s.breve ?? 0) + (s.ruteo ?? 0) - (s.ruteoExtra ?? 0)
}

/** Las cifras en dólares de una sesión, como las guarda Toki. */
export type CifrasUsd = {
  recorteUsd?: number
  relecturasUsd?: number
  limpioUsd?: number
  breveUsd?: number
  ruteoAhorroUsd?: number
  ruteoExtraUsd?: number
  gastoMedidoUsd?: number
}

/**
 * La cifra única: lo que Toki ahorró (neto), cuánto costó de verdad, cuánto
 * habría costado sin Toki y el "−18 %" (solo si hubo ahorro).
 */
export function resumenAhorro(s: CifrasUsd): { neto: number; gastado: number; sinToki: number; pct?: number } {
  const neto = ahorroNeto({ recorte: s.recorteUsd, relecturas: s.relecturasUsd, limpio: s.limpioUsd, breve: s.breveUsd, ruteo: s.ruteoAhorroUsd, ruteoExtra: s.ruteoExtraUsd })
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
