// La caché de los subagentes. Claude Code les escribe el caché a 5 minutos: si un subagente
// vuelve tras una pausa de 5 a 60 minutos, o se lanza otro del mismo tipo en ese rato,
// reescribe lo que una caché de 1 hora habría leído. A cambio, con 1 hora cada escritura
// cuesta 2× la entrada en vez de 1.25×. Toki mide las dos cosas en cada pedido de subagente,
// día por día; con 200 pedidos en 30 días y un ahorro de al menos 1.15× lo que cuesta de más,
// propone la caché de 1 hora (la variable CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL). Si la
// activas la sigue midiendo, y a los 14 días la quita si no paga. Funciones puras:
// register.tsx mide, guarda y pone la variable.

import { cifraUsd, cifraUsdFirmada } from './ahorro'
import type { Idioma } from './idioma'
import { precio } from './modelo'
import type { Familia } from './modelo'
import { fecha } from './semana'

/** Con menos pedidos de subagentes en 30 días no se decide nada. */
export const PEDIDOS_MINIMOS = 200
export const DIAS_VENTANA = 30
/** El ahorro debe pasar lo que cuesta de más al menos en esta proporción. */
export const MARGEN = 1.15
/** Puesta por Toki, a los tantos días se juzga si paga. */
export const DIAS_PRUEBA = 14
/** Menos que esto en 30 días (USD a precio de API) no vale el cambio. */
export const NETO_MINIMO = 0.5
/** Claude Code deja elegir la caché de los subagentes desde esta versión. */
export const VERSION_MINIMA = '2.1.243'

const DIAS_GUARDADOS = 45
const CORTO = 5 * 60_000
const LARGO = 60 * 60_000
const DIA = 86_400_000

/** `c`: la caché de 5 minutos de Claude Code; `l`: la de 1 hora que puso Toki. */
export type Regimen = 'c' | 'l'

/** Pedidos de subagentes, lo que la caché de 1 hora ahorra en reescrituras y lo que cuesta de más al escribir (USD a precio de API). */
export type Medida = { pedidos: number; ahorro: number; prima: number }

/** Lo medido por día (días desde 1970, en UTC) y por caché. */
export type DiasTtl = Record<string, Partial<Record<Regimen, Medida>>>

export type MotivoQuitada = 'no-paga' | 'restaurar' | 'tuya'

/** Lo que Toki recuerda entre sesiones. */
export type EstadoTtl = {
  dias: DiasTtl
  /** Desde cuándo Toki la tiene en 1 hora. */
  activa?: number
  /** Toki la volvió a 5 minutos: cuándo, por qué y, si fue por no pagar, el neto que dio. */
  quitada?: { ms: number; motivo: MotivoQuitada; neto?: number }
  /** Ya avisó que conviene: no lo repite. */
  avisada?: number
}

/** Una capa del caché: cuándo se tocó por última vez y cuántos tokens tenía. */
export type Capa = { ms: number; tokens: number }

/** Por qué Toki no toca ni mide la caché de los subagentes en esta sesión. */
export type Fuera = { motivo: 'version' | 'proveedor' } | { motivo: 'tuya'; nombre: string }

const MOTIVOS: readonly string[] = ['no-paga', 'restaurar', 'tuya']

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function leerMedida(v: unknown): Medida | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  const pedidos = numero(m.pedidos)
  const ahorro = numero(m.ahorro)
  const prima = numero(m.prima)
  if (pedidos === undefined || pedidos <= 0 || ahorro === undefined || ahorro < 0 || prima === undefined || prima < 0) return undefined
  return { pedidos, ahorro, prima }
}

/** Sin los campos vacíos: así se guarda y así se compara. */
function limpiar(e: EstadoTtl): EstadoTtl {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as EstadoTtl
}

export function leerEstadoTtl(valor: unknown): EstadoTtl {
  if (typeof valor !== 'object' || valor === null) return { dias: {} }
  const v = valor as Record<string, unknown>
  const dias: DiasTtl = {}
  if (typeof v.dias === 'object' && v.dias !== null) {
    for (const [dia, porCache] of Object.entries(v.dias)) {
      if (!/^\d+$/.test(dia) || typeof porCache !== 'object' || porCache === null) continue
      const c = leerMedida((porCache as Record<string, unknown>).c)
      const l = leerMedida((porCache as Record<string, unknown>).l)
      if (c !== undefined || l !== undefined) dias[dia] = { ...(c !== undefined ? { c } : {}), ...(l !== undefined ? { l } : {}) }
    }
  }
  const q = typeof v.quitada === 'object' && v.quitada !== null ? (v.quitada as Record<string, unknown>) : undefined
  const ms = numero(q?.ms)
  const neto = numero(q?.neto)
  const motivo = q?.motivo
  const quitada = ms !== undefined && typeof motivo === 'string' && MOTIVOS.includes(motivo) ? { ms, motivo: motivo as MotivoQuitada, ...(neto !== undefined ? { neto } : {}) } : undefined
  return limpiar({ dias, activa: numero(v.activa), quitada, avisada: numero(v.avisada) })
}

function sumar(a: Medida | undefined, b: Medida): Medida {
  return { pedidos: (a?.pedidos ?? 0) + b.pedidos, ahorro: (a?.ahorro ?? 0) + b.ahorro, prima: (a?.prima ?? 0) + b.prima }
}

function diaDe(ms: number): number {
  return Math.floor(ms / DIA)
}

/**
 * Un pedido de subagente con una y otra caché. `propia`: lo que dejó en el caché su pedido
 * anterior; `comun`: el comienzo que comparte con los subagentes del mismo tipo y modelo (sus
 * instrucciones y herramientas), tocado por última vez por cualquiera de ellos. Solo cuenta lo
 * que una capa tocada hace 5 a 60 minutos explica: con 5 minutos (`c`) es lo que se habría
 * leído además de lo leído; con la de 1 hora de Toki (`l`), lo leído que 5 minutos no habría
 * leído. `releidos`: esos tokens. La prima es lo que cuesta de más escribir a 1 hora lo que
 * igual se escribe.
 */
export function medirPaso(a: { familia: Familia; ms: number; leido: number; escrito: number; propia?: Capa; comun?: Capa; regimen: Regimen }): { medida: Medida; releidos: number } {
  const cacheable = a.leido + a.escrito
  const capa = (c: Capa | undefined, desde: number, hasta: number) => {
    const edad = c === undefined ? -1 : a.ms - c.ms
    return c !== undefined && edad > desde && edad <= hasta ? Math.min(c.tokens, cacheable) : 0
  }
  const tibio = Math.max(capa(a.propia, -1, CORTO), capa(a.comun, -1, CORTO))
  const soloLarga = Math.max(capa(a.propia, CORTO, LARGO), capa(a.comun, CORTO, LARGO))
  const releidos =
    a.regimen === 'c' ? Math.min(a.escrito, Math.max(0, soloLarga - Math.max(a.leido, tibio))) : Math.min(a.leido, Math.max(0, Math.min(a.leido, soloLarga) - tibio))
  const escritoLarga = a.regimen === 'c' ? a.escrito - releidos : a.escrito
  const p = precio(a.familia, cacheable)
  return {
    medida: { pedidos: 1, ahorro: (releidos * (p.escritura5m - p.lectura)) / 1_000_000, prima: (escritoLarga * (p.escritura1h - p.escritura5m)) / 1_000_000 },
    releidos,
  }
}

/** Suma un pedido medido a su día. */
export function anotarPaso(dias: DiasTtl, ms: number, regimen: Regimen, m: Medida): DiasTtl {
  const clave = String(diaDe(ms))
  const dia = dias[clave] ?? {}
  return { ...dias, [clave]: { ...dia, [regimen]: sumar(dia[regimen], m) } }
}

/** Lo guardado más lo medido desde la última vez; lo de más de 45 días se olvida. */
export function juntarDias(guardado: DiasTtl, nuevo: DiasTtl, ahora: number): DiasTtl {
  const desde = diaDe(ahora) - DIAS_GUARDADOS
  const r: DiasTtl = {}
  for (const fuente of [guardado, nuevo]) {
    for (const [clave, dia] of Object.entries(fuente)) {
      if (Number(clave) <= desde) continue
      const previo = r[clave] ?? {}
      r[clave] = { ...previo, ...(dia.c !== undefined ? { c: sumar(previo.c, dia.c) } : {}), ...(dia.l !== undefined ? { l: sumar(previo.l, dia.l) } : {}) }
    }
  }
  return r
}

/** Lo medido con una caché en los últimos 30 días, desde `desde` si se da. */
export function total(dias: DiasTtl, regimen: Regimen, ahora: number, desde = 0): Medida {
  const hoy = diaDe(ahora)
  let m: Medida = { pedidos: 0, ahorro: 0, prima: 0 }
  for (const [clave, dia] of Object.entries(dias)) {
    const n = Number(clave)
    const medida = dia[regimen]
    if (medida !== undefined && n > hoy - DIAS_VENTANA && n >= diaDe(desde)) m = sumar(m, medida)
  }
  return m
}

export type Veredicto = { tipo: 'faltan' | 'conviene' | 'no-conviene'; medida: Medida }

/** Con 5 minutos, ¿conviene la de 1 hora? 200 pedidos en 30 días, ahorro de 1.15× lo de más y un neto que valga. */
export function veredicto(dias: DiasTtl, ahora: number): Veredicto {
  const m = total(dias, 'c', ahora)
  if (m.pedidos < PEDIDOS_MINIMOS) return { tipo: 'faltan', medida: m }
  return { tipo: m.ahorro >= MARGEN * m.prima && m.ahorro - m.prima >= NETO_MINIMO ? 'conviene' : 'no-conviene', medida: m }
}

/**
 * Al empezar y tras cada mensaje. Puesta por Toki: cumplidos 14 días, con 200 pedidos medidos
 * desde entonces y un neto negativo, se quita. Sin poner: si conviene, con alguien mirando y sin
 * haberla quitado antes (tú o Toki), se avisa una vez.
 */
export function revisarTtl(e: EstadoTtl, ahora: number, puedeAvisar: boolean): { estado: EstadoTtl; quitar: boolean; avisar: boolean } {
  if (e.activa !== undefined) {
    const m = total(e.dias, 'l', ahora, e.activa)
    const neto = m.ahorro - m.prima
    if (ahora - e.activa >= DIAS_PRUEBA * DIA && m.pedidos >= PEDIDOS_MINIMOS && neto < 0) {
      return { estado: limpiar({ ...e, activa: undefined, quitada: { ms: ahora, motivo: 'no-paga', neto } }), quitar: true, avisar: false }
    }
    return { estado: e, quitar: false, avisar: false }
  }
  if (!puedeAvisar || e.avisada !== undefined || e.quitada !== undefined || veredicto(e.dias, ahora).tipo !== 'conviene') return { estado: e, quitar: false, avisar: false }
  return { estado: { ...e, avisada: ahora }, quitar: false, avisar: true }
}

export function activarTtl(e: EstadoTtl, ahora: number): EstadoTtl {
  return limpiar({ ...e, activa: ahora, quitada: undefined })
}

export function quitarTtl(e: EstadoTtl, ahora: number, motivo: MotivoQuitada): EstadoTtl {
  return limpiar({ ...e, activa: undefined, quitada: { ms: ahora, motivo } })
}

/** Una variable prendida: algo distinto de vacío, 0 o false. */
export function prendida(valor: string | undefined): boolean {
  return valor !== undefined && !/^(|0|false|no|off)$/i.test(valor.trim())
}

/** `2.1.280` o `2.1.280-dev…`: ¿de la 2.1.243 en adelante? */
export function versionConTtl(version: string | undefined): boolean {
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(VERSION_MINIMA)
  if (v === null || m === null) return false
  for (let i = 1; i <= 3; i++) {
    if (Number(v[i]) !== Number(m[i])) return Number(v[i]) > Number(m[i])
  }
  return true
}

/**
 * Por qué Toki no toca la caché de los subagentes; nada si puede. Lo tuyo gana siempre:
 * `subagentPromptCacheTtl` con cualquier valor, la variable si no la puso Toki, o las que
 * fijan la caché de todo (FORCE_PROMPT_CACHING_5M, ENABLE_PROMPT_CACHING_1H, DISABLE_PROMPT_CACHING).
 */
export function fueraTtl(e: { version?: string; ajuste?: unknown; variable?: string; puestaPorToki: boolean; otras: readonly { nombre: string; valor?: string }[]; proveedor: boolean }): Fuera | undefined {
  if (!versionConTtl(e.version)) return { motivo: 'version' }
  if (e.proveedor) return { motivo: 'proveedor' }
  if (e.ajuste !== undefined && e.ajuste !== null) return { motivo: 'tuya', nombre: 'subagentPromptCacheTtl' }
  if (!e.puestaPorToki && e.variable !== undefined && e.variable.trim() !== '') return { motivo: 'tuya', nombre: 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL' }
  const otra = e.otras.find(o => prendida(o.valor))
  return otra !== undefined ? { motivo: 'tuya', nombre: otra.nombre } : undefined
}

const TEXTOS = {
  es: {
    titulo: 'Caché de los subagentes:',
    corta: '5 minutos, la de Claude Code.',
    faltan: (n: number) => `Toki decide con ${PEDIDOS_MINIMOS} pedidos de subagentes en ${DIAS_VENTANA} días: lleva ${n}.`,
    medido: (n: number, ahorro: string, prima: string) => `En ${DIAS_VENTANA} días, ${n} pedidos: con 1 hora habrían ahorrado ${ahorro} en reescrituras y pagado ${prima} más al escribir`,
    conviene: (neto: string) => ` (neto ${neto}).`,
    noConviene: ': no conviene.',
    activar: `/toki-dieta subagentes la pone en 1 hora; Toki la quita si en ${DIAS_PRUEBA} días no paga.`,
    larga: (dias: number) => `1 hora, puesta por Toki ${dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}.`,
    desde: (n: number, ahorro: string, prima: string, neto: string) => `Desde entonces, ${n} pedidos: ahorró ${ahorro} en reescrituras y pagó ${prima} más al escribir (neto ${neto}).`,
    decide: (n: number) => (n <= 1 ? 'Toki decide mañana si se queda.' : `Toki decide en ${n} días si se queda.`),
    restaurar: '/toki-dieta restaurar la vuelve a 5 minutos.',
    quitadaNoPaga: (cuando: string, mas: string) => `Toki quitó la de 1 hora el ${cuando}: costó ${mas} más de lo que ahorró.`,
    tuya: (nombre: string) => `La fija tu configuración (${nombre}): Toki no la toca.`,
    hecho: `Listo: tus subagentes usan caché de 1 hora desde ahora, en todas tus sesiones con Toki. Toki la sigue midiendo y la vuelve a 5 minutos si en ${DIAS_PRUEBA} días no paga; /toki-dieta restaurar lo hace ya.`,
    yaPuesta: 'Tus subagentes ya usan caché de 1 hora. /toki-dieta restaurar la vuelve a 5 minutos.',
    noVersion: `Esta versión de Claude Code no deja elegir la caché de los subagentes (desde la ${VERSION_MINIMA}).`,
    noProveedor: 'Con Bedrock, Vertex o Foundry Toki no cambia la caché de los subagentes.',
    negada: (m: string) => `Claude Code no dejó poner la caché de 1 hora (${m}).`,
    restaurada: 'La caché de tus subagentes vuelve a 5 minutos desde ahora.',
    op: 'Caché de 1 h para subagentes',
    aviso: (neto: string) => `Toki: con caché de 1 hora tus subagentes habrían ahorrado ${neto} en ${DIAS_VENTANA} días. Míralo en /toki-dieta.`,
    avisoQuitada: (mas: string) => `Toki volvió a 5 minutos la caché de tus subagentes: en ${DIAS_PRUEBA} días costó ${mas} más de lo que ahorró.`,
  },
  en: {
    titulo: 'Subagent cache:',
    corta: '5 minutes, Claude Code’s.',
    faltan: (n: number) => `Toki decides with ${PEDIDOS_MINIMOS} subagent requests in ${DIAS_VENTANA} days: ${n} so far.`,
    medido: (n: number, ahorro: string, prima: string) => `In ${DIAS_VENTANA} days, ${n} requests: with 1 hour they would have saved ${ahorro} in rewrites and paid ${prima} more to write`,
    conviene: (neto: string) => ` (net ${neto}).`,
    noConviene: ': not worth it.',
    activar: `/toki-dieta subagents sets it to 1 hour; Toki removes it if it doesn't pay within ${DIAS_PRUEBA} days.`,
    larga: (dias: number) => `1 hour, set by Toki ${dias <= 0 ? 'today' : dias === 1 ? 'yesterday' : `${dias} days ago`}.`,
    desde: (n: number, ahorro: string, prima: string, neto: string) => `Since then, ${n} requests: it saved ${ahorro} in rewrites and paid ${prima} more to write (net ${neto}).`,
    decide: (n: number) => (n <= 1 ? 'Toki decides tomorrow whether it stays.' : `Toki decides in ${n} days whether it stays.`),
    restaurar: '/toki-dieta restore puts it back to 5 minutes.',
    quitadaNoPaga: (cuando: string, mas: string) => `Toki removed the 1-hour one on ${cuando}: it cost ${mas} more than it saved.`,
    tuya: (nombre: string) => `Your configuration sets it (${nombre}): Toki leaves it alone.`,
    hecho: `Done: your subagents use a 1-hour cache from now on, in all your sessions with Toki. Toki keeps measuring and puts it back to 5 minutes if it doesn't pay within ${DIAS_PRUEBA} days; /toki-dieta restore does it now.`,
    yaPuesta: 'Your subagents already use a 1-hour cache. /toki-dieta restore puts it back to 5 minutes.',
    noVersion: `This Claude Code version doesn't let you choose the subagent cache (it needs ${VERSION_MINIMA}).`,
    noProveedor: 'With Bedrock, Vertex or Foundry Toki doesn’t change the subagent cache.',
    negada: (m: string) => `Claude Code didn't allow setting the 1-hour cache (${m}).`,
    restaurada: 'Your subagent cache goes back to 5 minutes from now.',
    op: '1-hour cache for subagents',
    aviso: (neto: string) => `Toki: with a 1-hour cache your subagents would have saved ${neto} in ${DIAS_VENTANA} days. See /toki-dieta.`,
    avisoQuitada: (mas: string) => `Toki put your subagent cache back to 5 minutes: over ${DIAS_PRUEBA} days it cost ${mas} more than it saved.`,
  },
}

/** Los textos de la caché de los subagentes. */
export function txTtl(idioma: Idioma = 'es'): (typeof TEXTOS)['es'] {
  return TEXTOS[idioma]
}

/** La sección de /toki-dieta; vacía si no hay nada que contar. */
export function textoTtl(e: EstadoTtl, o: { ahora: number; idioma?: Idioma; fuera?: Fuera }): string[] {
  const idioma = o.idioma ?? 'es'
  const x = TEXTOS[idioma]
  if (o.fuera?.motivo === 'tuya') return [x.titulo, `  ${x.tuya(o.fuera.nombre)}`]
  if (o.fuera !== undefined) return []
  if (e.activa !== undefined) {
    const m = total(e.dias, 'l', o.ahora, e.activa)
    const dias = Math.floor((o.ahora - e.activa) / DIA)
    const lineas = [x.titulo, `  ${x.larga(dias)}`]
    if (m.pedidos > 0) lineas.push(`  ${x.desde(m.pedidos, cifraUsd(m.ahorro), cifraUsd(m.prima), cifraUsdFirmada(m.ahorro - m.prima))}`)
    if (dias < DIAS_PRUEBA) lineas.push(`  ${x.decide(DIAS_PRUEBA - dias)}`)
    return [...lineas, `  ${x.restaurar}`]
  }
  const v = veredicto(e.dias, o.ahora)
  const noPaga = e.quitada?.motivo === 'no-paga' ? e.quitada : undefined
  if (v.medida.pedidos === 0 && noPaga === undefined) return []
  const lineas = [x.titulo, `  ${x.corta}`]
  if (noPaga !== undefined) lineas.push(`  ${x.quitadaNoPaga(fecha(noPaga.ms, idioma), cifraUsd(-(noPaga.neto ?? 0)))}`)
  const m = v.medida
  if (v.tipo === 'faltan') {
    if (m.pedidos > 0) lineas.push(`  ${x.faltan(m.pedidos)}`)
    return lineas
  }
  lineas.push(`  ${x.medido(m.pedidos, cifraUsd(m.ahorro), cifraUsd(m.prima))}${v.tipo === 'conviene' ? x.conviene(cifraUsdFirmada(m.ahorro - m.prima)) : x.noConviene}`)
  if (v.tipo === 'conviene') lineas.push(`  ${x.activar}`)
  return lineas
}
