// Testigos de cada ayuda: 1 de cada tantas tareas va sin una de las ayudas de Toki (compactar
// salidas, frenar archivos generados, la nota del mapa, el aviso de delegar a Explore, la
// entrevista) y Toki compara lo que costaron esas tareas y cuánto las corregiste contra las
// que sí la tuvieron. Si una ayuda sale claramente peor, se pausa. Funciones puras.

import { CENTAVO } from './ahorro'
import type { Idioma } from './idioma'
import { fecha } from './semana'

export type Intervencion = 'compactacion' | 'generados' | 'mapa' | 'explore' | 'entrevista'
export const INTERVENCIONES: readonly Intervencion[] = ['compactacion', 'generados', 'mapa', 'explore', 'entrevista']

/** 1 de cada tantas tareas elegibles va sin la ayuda: la que pasa en casi todas, de a 10; las que pasan poco, de a 4. */
export const CADA: Record<Intervencion, number> = { compactacion: 10, generados: 4, mapa: 4, explore: 4, entrevista: 4 }
/** Con menos testigos que estos, Toki no compara: el azar pesa más que la ayuda. */
export const TESTIGOS_MINIMOS = 10
/** Con estos testigos la ronda cierra: Toki deja de apartar tareas y decide si la ayuda sigue. */
export const TESTIGOS_RONDA = 30
/** Lo decidido vale tanto; después Toki vuelve a medir (los modelos y tus proyectos cambian). */
export const DIAS_RONDA = 90

const DIA = 86_400_000

/** Las tareas de un brazo: cuántas, y la suma (y la suma de cuadrados) de lo que costaron y de tus correcciones. */
export type Grupo = { tareas: number; usd: number; usd2: number; corr: number; corr2: number }

/**
 * Una ronda de medición de una ayuda: desde cuándo, cuántas tareas pudieron tenerla y lo
 * medido con ella y sin ella. Al juntar TESTIGOS_RONDA testigos se cierra; si la ayuda salió
 * peor, queda en pausa hasta que la ronda vence.
 */
export type Ronda = { desde: number; elegibles: number; con: Grupo; testigos: Grupo; cerrada?: number; pausada?: boolean }
export type Testigos = Partial<Record<Intervencion, Ronda>>

export type Brazo = 'con' | 'testigo'
/** Lo que Toki hace con la ayuda: darla, guardarla para el testigo, o nada porque está en pausa. */
export type Ayuda = 'si' | 'testigo' | 'pausa'
/** Lo que costó una tarea desde que la ayuda pudo actuar hasta la tarea siguiente, y cuántas veces la corregiste. */
export type Medida = { usd: number; correcciones: number }

const GRUPO_VACIO: Grupo = { tareas: 0, usd: 0, usd2: 0, corr: 0, corr2: 0 }

function rondaNueva(ahora: number): Ronda {
  return { desde: ahora, elegibles: 0, con: GRUPO_VACIO, testigos: GRUPO_VACIO }
}

export type Eleccion = { testigos: Testigos; ayuda: Ayuda; medido: boolean }

/**
 * Una tarea en la que la ayuda puede actuar por primera vez. Sin medir (fuera de una tarea),
 * con la ronda cerrada o en pausa, no cuenta. Si cuenta, a 1 de cada CADA le toca ir de testigo.
 */
export function elegir(t: Testigos, i: Intervencion, ahora: number, medir: boolean): Eleccion {
  const r = t[i]
  if (r?.pausada === true) return { testigos: t, ayuda: 'pausa', medido: false }
  if (r?.cerrada !== undefined || !medir) return { testigos: t, ayuda: 'si', medido: false }
  const actual = r ?? rondaNueva(ahora)
  const testigo = actual.elegibles % CADA[i] === CADA[i] - 1
  return { testigos: { ...t, [i]: { ...actual, elegibles: actual.elegibles + 1 } }, ayuda: testigo ? 'testigo' : 'si', medido: true }
}

export type Cierre = { comparacion: Comparacion; pausada: boolean }

/** Una tarea medida terminó. Con el testigo número TESTIGOS_RONDA la ronda cierra y, si la ayuda salió peor, se pausa. */
export function anotarTarea(t: Testigos, i: Intervencion, brazo: Brazo, m: Medida, ahora: number): { testigos: Testigos; cierre?: Cierre } {
  const r = t[i]
  if (r === undefined || r.cerrada !== undefined) return { testigos: t }
  const usd = Number.isFinite(m.usd) ? Math.max(0, m.usd) : 0
  const corr = Number.isFinite(m.correcciones) ? Math.max(0, m.correcciones) : 0
  const g = brazo === 'testigo' ? r.testigos : r.con
  const sumado: Grupo = { tareas: g.tareas + 1, usd: g.usd + usd, usd2: g.usd2 + usd * usd, corr: g.corr + corr, corr2: g.corr2 + corr * corr }
  const nueva: Ronda = brazo === 'testigo' ? { ...r, testigos: sumado } : { ...r, con: sumado }
  if (nueva.testigos.tareas < TESTIGOS_RONDA) return { testigos: { ...t, [i]: nueva } }
  const comparacion = comparar(nueva)
  const pausada = empeora(comparacion)
  return { testigos: { ...t, [i]: { ...nueva, cerrada: ahora, ...(pausada ? { pausada } : {}) } }, cierre: { comparacion, pausada } }
}

/** Las ayudas en pausa vuelven ya, con una ronda nueva. */
export function reanudar(t: Testigos): { testigos: Testigos; reanudadas: Intervencion[] } {
  const reanudadas = INTERVENCIONES.filter(i => t[i]?.pausada === true)
  const nuevos: Testigos = { ...t }
  for (const i of reanudadas) delete nuevos[i]
  return { testigos: nuevos, reanudadas }
}

/** Hasta cuándo vale lo que decidió una ronda cerrada (y su pausa, si la hay). */
export function vence(r: Ronda): number | undefined {
  return r.cerrada === undefined ? undefined : r.cerrada + DIAS_RONDA * DIA
}

// ---------- Comparar ----------

/** Una diferencia de medias por tarea (con la ayuda menos sin ella) y su intervalo del 95 %. */
export type Intervalo = { media: number; bajo: number; alto: number }
export type Medias = { tareas: number; usd: number; correcciones: number }
export type Comparacion = { con: Medias; testigos: Medias; extra?: Intervalo; correcciones?: Intervalo }

function medias(g: Grupo): Medias {
  return g.tareas === 0 ? { tareas: 0, usd: 0, correcciones: 0 } : { tareas: g.tareas, usd: g.usd / g.tareas, correcciones: g.corr / g.tareas }
}

function varianza(n: number, suma: number, suma2: number): number {
  return n > 1 ? Math.max(0, (suma2 - (suma * suma) / n) / (n - 1)) : 0
}

/** El cuantil 97.5 % de la t de Student (Cornish-Fisher): 2.26 con 9 grados de libertad, 2.04 con 30. */
export function tCritico(gl: number): number {
  const z = 1.96
  const g = Math.max(1, gl)
  return z + (z ** 3 + z) / (4 * g) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * g * g)
}

/** a − b por tarea, con el intervalo de Welch: los dos grupos pueden variar distinto. */
function diferencia(na: number, sa: number, s2a: number, nb: number, sb: number, s2b: number): Intervalo | undefined {
  if (na < 2 || nb < 2) return undefined
  const va = varianza(na, sa, s2a) / na
  const vb = varianza(nb, sb, s2b) / nb
  const error = Math.sqrt(va + vb)
  const gl = error === 0 ? na + nb - 2 : (va + vb) ** 2 / (va ** 2 / (na - 1) + vb ** 2 / (nb - 1))
  const media = sa / na - sb / nb
  const margen = tCritico(gl) * error
  return { media, bajo: media - margen, alto: media + margen }
}

/** Lo medido de una ronda: las medias de cada brazo y, con TESTIGOS_MINIMOS testigos, cuánto cambia la ayuda. */
export function comparar(r: Ronda): Comparacion {
  const base = { con: medias(r.con), testigos: medias(r.testigos) }
  if (r.testigos.tareas < TESTIGOS_MINIMOS) return base
  const extra = diferencia(r.con.tareas, r.con.usd, r.con.usd2, r.testigos.tareas, r.testigos.usd, r.testigos.usd2)
  const correcciones = diferencia(r.con.tareas, r.con.corr, r.con.corr2, r.testigos.tareas, r.testigos.corr, r.testigos.corr2)
  return extra === undefined || correcciones === undefined ? base : { ...base, extra, correcciones }
}

export type Veredicto = 'midiendo' | 'ahorra' | 'cuesta' | 'igual'

/** Con la ayuda, ¿las tareas cuestan menos, más, o todavía no se nota? Solo si el intervalo entero cae de un lado. */
export function veredicto(c: Comparacion): Veredicto {
  if (c.extra === undefined) return 'midiendo'
  return c.extra.alto < 0 ? 'ahorra' : c.extra.bajo > 0 ? 'cuesta' : 'igual'
}

/** Con la ayuda la corriges más, sin duda: el intervalo entero sobre cero. */
export function corrigeMas(c: Comparacion): boolean {
  return c.correcciones !== undefined && c.correcciones.bajo > 0
}

function corrigeMenos(c: Comparacion): boolean {
  return c.correcciones !== undefined && c.correcciones.alto < 0
}

/** La ayuda salió peor que no darla: más cara, o más corregida. */
export function empeora(c: Comparacion): boolean {
  return veredicto(c) === 'cuesta' || corrigeMas(c)
}

// ---------- Leer lo guardado ----------

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
}

function grupo(v: unknown): Grupo | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const [tareas, usd, usd2, corr, corr2] = [r['tareas'], r['usd'], r['usd2'], r['corr'], r['corr2']].map(numero)
  if (tareas === undefined || usd === undefined || usd2 === undefined || corr === undefined || corr2 === undefined) return undefined
  return { tareas: Math.floor(tareas), usd, usd2, corr, corr2 }
}

function ronda(v: unknown, ahora: number): Ronda | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const desde = numero(r['desde'])
  const elegibles = numero(r['elegibles'])
  const con = grupo(r['con'])
  const testigos = grupo(r['testigos'])
  if (desde === undefined || elegibles === undefined || con === undefined || testigos === undefined) return undefined
  const cerrada = numero(r['cerrada'])
  const leida: Ronda = { desde, elegibles: Math.floor(elegibles), con, testigos, ...(cerrada !== undefined ? { cerrada } : {}), ...(r['pausada'] === true && cerrada !== undefined ? { pausada: true } : {}) }
  // Vencida: se mide de nuevo desde cero.
  const hasta = vence(leida)
  return hasta !== undefined && ahora >= hasta ? undefined : leida
}

export function leerTestigos(v: unknown, ahora: number): Testigos {
  const t: Testigos = {}
  if (v === null || typeof v !== 'object') return t
  for (const i of INTERVENCIONES) {
    const r = ronda((v as Record<string, unknown>)[i], ahora)
    if (r !== undefined) t[i] = r
  }
  return t
}

// ---------- Textos ----------

/** "$0.12", "−$0.12" y, con signo, "+$0.07": una media medida, sin la tilde de las estimaciones. */
function usd(n: number, signo = false): string {
  const a = Math.abs(n)
  const cifra = a >= 100 ? `$${Math.round(a)}` : `$${a.toFixed(2)}`
  if (n <= -CENTAVO) return `−${cifra}`
  return signo && n >= CENTAVO ? `+${cifra}` : cifra
}

function veces(n: number): string {
  return n.toFixed(1)
}

type TextosTestigos = {
  titulo: string
  nombre: Record<Intervencion, string>
  pocos: (testigos: number, con: number, cada: number) => string
  medias: (con: Medias, sin: Medias) => string
  ahorra: (menos: string, bajo: string, alto: string) => string
  cuesta: (mas: string, bajo: string, alto: string) => string
  igual: (dif: string, bajo: string, alto: string) => string
  corrigeMas: string
  corrigeMenos: string
  cerrada: (vence: string) => string
  pausa: (hasta: string) => string
  reanudar: string
  aviso: (nombre: string, hasta: string, testigos: number) => string
  reanudadas: (nombres: string[]) => string
  nadaEnPausa: string
  pista: string
  motivo: { testigo: (cada: number) => string; pausa: string }
}

function lista(nombres: string[], y: string): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} ${y} ${nombres[nombres.length - 1]}`
}

const TEXTOS: Record<Idioma, TextosTestigos> = {
  es: {
    titulo: '¿Te sirve cada ayuda? Toki deja algunas tareas sin ella (testigos) y compara lo que costaron hasta la tarea siguiente:',
    nombre: {
      compactacion: 'Compactar salidas',
      generados: 'Frenar archivos generados',
      mapa: 'Nota del mapa',
      explore: 'Aviso de delegar a Explore',
      entrevista: 'Entrevista antes de pedidos grandes',
    },
    pocos: (t, c, cada) => `${t} ${t === 1 ? 'testigo' : 'testigos'} y ${c} ${c === 1 ? 'tarea' : 'tareas'} con ella (1 de cada ${cada} va sin ella); compara desde ${TESTIGOS_MINIMOS} testigos.`,
    medias: (c, s) => `con ella ${usd(c.usd)} por tarea y ${veces(c.correcciones)} correcciones; sin ella ${usd(s.usd)} y ${veces(s.correcciones)} (${s.tareas} testigos).`,
    ahorra: (m, b, a) => `Ahorra ${m} por tarea (entre ${b} y ${a}).`,
    cuesta: (m, b, a) => `Cuesta ${m} más por tarea (entre ${b} y ${a}).`,
    igual: (d, b, a) => `Aún no se nota la diferencia: ${d} por tarea, entre ${b} y ${a}.`,
    corrigeMas: 'Con ella la corriges más.',
    corrigeMenos: 'Con ella la corriges menos.',
    cerrada: v => `Toki vuelve a medir el ${v}.`,
    pausa: h => `en pausa hasta el ${h};`,
    reanudar: '/toki-por-que reanudar la vuelve a usar.',
    aviso: (n, h, t) => `Toki pausó «${n}» hasta el ${h}: en ${t} tareas de testigo salió mejor sin ella. /toki-por-que lo explica.`,
    reanudadas: n => `Listo: Toki vuelve a usar ${lista(n.map(m => `«${m}»`), 'y')}, y ${n.length === 1 ? 'la mide' : 'las mide'} de nuevo con testigos.`,
    nadaEnPausa: 'No hay ayudas en pausa.',
    pista: 'reanudar',
    motivo: {
      testigo: cada => `testigo: en esta tarea Toki no compacta, para medir si compactar te ahorra (1 de cada ${cada} tareas)`,
      pausa: 'Toki pausó la compactación: sus testigos dicen que no te ahorraba (/toki-por-que)',
    },
  },
  en: {
    titulo: 'Does each aid pay off? Toki leaves some tasks without it (controls) and compares what they cost up to the next task:',
    nombre: {
      compactacion: 'Compacting outputs',
      generados: 'Holding back generated files',
      mapa: 'Map note',
      explore: 'Nudge to delegate to Explore',
      entrevista: 'Interview before big requests',
    },
    pocos: (t, c, cada) => `${t} ${t === 1 ? 'control' : 'controls'} and ${c} ${c === 1 ? 'task' : 'tasks'} with it (1 in ${cada} goes without it); compares from ${TESTIGOS_MINIMOS} controls on.`,
    medias: (c, s) => `with it ${usd(c.usd)} per task and ${veces(c.correcciones)} corrections; without it ${usd(s.usd)} and ${veces(s.correcciones)} (${s.tareas} controls).`,
    ahorra: (m, b, a) => `Saves ${m} per task (between ${b} and ${a}).`,
    cuesta: (m, b, a) => `Costs ${m} more per task (between ${b} and ${a}).`,
    igual: (d, b, a) => `No clear difference yet: ${d} per task, between ${b} and ${a}.`,
    corrigeMas: 'With it you correct more.',
    corrigeMenos: 'With it you correct less.',
    cerrada: v => `Toki measures again on ${v}.`,
    pausa: h => `paused until ${h};`,
    reanudar: '/toki-por-que resume brings it back.',
    aviso: (n, h, t) => `Toki paused “${n}” until ${h}: in ${t} control tasks it did better without it. /toki-por-que explains.`,
    reanudadas: n => `Done: Toki uses ${lista(n.map(m => `“${m}”`), 'and')} again, and measures ${n.length === 1 ? 'it' : 'them'} anew with controls.`,
    nadaEnPausa: 'No aids are paused.',
    pista: 'resume',
    motivo: {
      testigo: cada => `control: in this task Toki doesn't compact, to measure whether compacting saves you anything (1 in ${cada} tasks)`,
      pausa: 'Toki paused compaction: its controls say it wasn’t saving you anything (/toki-por-que)',
    },
  },
}

export function txTestigos(idioma: Idioma = 'es'): TextosTestigos {
  return TEXTOS[idioma]
}

/** Lo que dice el intervalo: cuánto ahorra o cuesta la ayuda por tarea, o que todavía no se nota. */
function lineaVeredicto(x: TextosTestigos, c: Comparacion): string | undefined {
  const e = c.extra
  if (e === undefined) return undefined
  const v = veredicto(c)
  const base =
    v === 'ahorra' ? x.ahorra(usd(-e.media), usd(-e.alto), usd(-e.bajo)) : v === 'cuesta' ? x.cuesta(usd(e.media), usd(e.bajo), usd(e.alto)) : x.igual(usd(e.media, true), usd(e.bajo, true), usd(e.alto, true))
  return corrigeMas(c) ? `${base} ${x.corrigeMas}` : corrigeMenos(c) ? `${base} ${x.corrigeMenos}` : base
}

/** Para /toki-por-que: cada ayuda con tareas medidas, sus medias y lo que se sabe. Nada si no hay tareas medidas. */
export function textoTestigos(t: Testigos, o: { idioma?: Idioma } = {}): string[] {
  const idioma = o.idioma ?? 'es'
  const x = TEXTOS[idioma]
  const lineas: string[] = []
  for (const i of INTERVENCIONES) {
    const r = t[i]
    if (r === undefined || r.con.tareas + r.testigos.tareas === 0) continue
    const c = comparar(r)
    const veredictoLinea = lineaVeredicto(x, c)
    if (veredictoLinea === undefined) {
      lineas.push(`  ${x.nombre[i]}: ${x.pocos(r.testigos.tareas, r.con.tareas, CADA[i])}`)
      continue
    }
    const hasta = vence(r)
    const pausa = r.pausada === true && hasta !== undefined ? `${x.pausa(fecha(hasta, idioma))} ` : ''
    lineas.push(`  ${x.nombre[i]}: ${pausa}${x.medias(c.con, c.testigos)}`)
    const cola = r.pausada === true ? x.reanudar : hasta !== undefined ? x.cerrada(fecha(hasta, idioma)) : undefined
    lineas.push(`    ${cola === undefined ? veredictoLinea : `${veredictoLinea} ${cola}`}`)
  }
  return lineas.length === 0 ? [] : [x.titulo, ...lineas]
}

/** La línea del diagnóstico al cerrar una ronda. */
export function lineaCierre(i: Intervencion, cierre: Cierre, ahora: number): string {
  const c = cierre.comparacion
  const e = c.extra
  const cifras = e === undefined ? '' : `, ${usd(e.media, true)} por tarea [${usd(e.bajo, true)}, ${usd(e.alto, true)}], correcciones ${veces(c.con.correcciones)} contra ${veces(c.testigos.correcciones)}`
  const pausa = cierre.pausada ? `; en pausa hasta el ${fecha(ahora + DIAS_RONDA * DIA, 'es')}` : ''
  return `testigos: ronda de ${i} cerrada (${veredicto(c)}${cifras})${pausa}`
}
