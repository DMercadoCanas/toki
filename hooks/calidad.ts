// «¿Quedó bien?»: la calidad de lo que Toki bajó de modelo o esfuerzo, contra sus
// testigos, con lo que tú respondes y lo que corriges después. Pregunta Toki, no
// Claude: cero tokens. Solo guarda cuentas, nunca tu texto. Funciones puras.

import { ESFUERZOS, familiaDe } from './modelo'
import type { Esfuerzo, Familia } from './modelo'

/**
 * Bajados: Toki los mandó con menos modelo o esfuerzo que el tuyo. Testigos: Toki
 * los habría bajado y los dejó con el tuyo, para comparar.
 */
export type GrupoCalidad = 'bajados' | 'testigos'
export const GRUPOS_CALIDAD: readonly GrupoCalidad[] = ['bajados', 'testigos']

export type ConteoCalidad = {
  /** Mensajes enteros del grupo. */
  mensajes: number
  /** A cuántos les preguntó, contestaras o no. */
  preguntas: number
  bien: number
  mal: number
  /** Tus mensajes que siguieron a uno del grupo, y cuántos lo corregían ("no era eso"). */
  siguientes: number
  corregidos: number
}

export type Calidad = { bajados: ConteoCalidad; testigos: ConteoCalidad; ultimaPregunta: number; apagada: boolean }

export type RespuestaCalidad = 'bien' | 'mal' | 'nose' | 'apagar'

/** De los bajados pregunta por 1 de cada tantos; los testigos ya son 1 de cada 10: por cada uno. */
export const CADA_PREGUNTA = 10
/** Con tantas respuestas en un grupo, ya no pregunta por él. */
export const META_RESPUESTAS = 30
/** Nunca dos preguntas más seguidas que esto: cansan. */
export const ENTRE_PREGUNTAS = 30 * 60_000

const RANGO: Record<Familia, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

function conteoVacio(): ConteoCalidad {
  return { mensajes: 0, preguntas: 0, bien: 0, mal: 0, siguientes: 0, corregidos: 0 }
}

export function calidadVacia(): Calidad {
  return { bajados: conteoVacio(), testigos: conteoVacio(), ultimaPregunta: 0, apagada: false }
}

/** Toki lo mandó con menos que lo tuyo: un modelo más chico, o el mismo con menos esfuerzo. */
export function esBajado(tuyo: { modelo: string; esfuerzo: Esfuerzo }, usada: { modelo: string; esfuerzo: Esfuerzo }): boolean {
  const a = familiaDe(tuyo.modelo)
  const b = familiaDe(usada.modelo)
  if (a !== undefined && b !== undefined && a !== b) return RANGO[b] < RANGO[a]
  return ESFUERZOS.indexOf(usada.esfuerzo) < ESFUERZOS.indexOf(tuyo.esfuerzo)
}

function cambiarGrupo(c: Calidad, grupo: GrupoCalidad, cambiar: (g: ConteoCalidad) => ConteoCalidad): Calidad {
  return { ...c, [grupo]: cambiar(c[grupo]) }
}

/** Un mensaje entero del grupo, ya respondido. */
export function sumarMensaje(c: Calidad, grupo: GrupoCalidad): Calidad {
  return cambiarGrupo(c, grupo, g => ({ ...g, mensajes: g.mensajes + 1 }))
}

/**
 * ¿Le toca preguntar por el mensaje que acaba de sumar? Con los bajados, como mucho
 * una pregunta por cada CADA_PREGUNTA mensajes (la primera, en el primero); con los
 * testigos, por cada uno. Nunca dos en menos de ENTRE_PREGUNTAS, ni pasada la meta.
 */
export function tocaPreguntar(c: Calidad, grupo: GrupoCalidad, ahora: number): boolean {
  const g = c[grupo]
  if (c.apagada || g.bien + g.mal >= META_RESPUESTAS || (c.ultimaPregunta > 0 && ahora - c.ultimaPregunta < ENTRE_PREGUNTAS)) return false
  return g.preguntas * (grupo === 'testigos' ? 1 : CADA_PREGUNTA) < g.mensajes
}

/** Va a preguntar: cuenta antes de mostrarla, para que otra sesión no pregunte a la vez. */
export function marcarPregunta(c: Calidad, grupo: GrupoCalidad, ahora: number): Calidad {
  return { ...cambiarGrupo(c, grupo, g => ({ ...g, preguntas: g.preguntas + 1 })), ultimaPregunta: ahora }
}

export function anotarRespuesta(c: Calidad, grupo: GrupoCalidad, r: RespuestaCalidad): Calidad {
  if (r === 'apagar') return { ...c, apagada: true }
  if (r === 'nose') return c
  return cambiarGrupo(c, grupo, g => (r === 'bien' ? { ...g, bien: g.bien + 1 } : { ...g, mal: g.mal + 1 }))
}

/** Tu mensaje siguiente a uno del grupo: si lo corregía, la respuesta no había quedado bien. */
export function sumarSiguiente(c: Calidad, grupo: GrupoCalidad, corrige: boolean): Calidad {
  return cambiarGrupo(c, grupo, g => ({ ...g, siguientes: g.siguientes + 1, corregidos: g.corregidos + (corrige ? 1 : 0) }))
}

export function leerCalidad(v: unknown): Calidad {
  const vacia = calidadVacia()
  if (typeof v !== 'object' || v === null) return vacia
  const r = v as Record<string, unknown>
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
  const conteo = (g: unknown): ConteoCalidad => {
    if (typeof g !== 'object' || g === null) return conteoVacio()
    const o = g as Record<string, unknown>
    return { mensajes: n(o['mensajes']), preguntas: n(o['preguntas']), bien: n(o['bien']), mal: n(o['mal']), siguientes: n(o['siguientes']), corregidos: n(o['corregidos']) }
  }
  return { bajados: conteo(r['bajados']), testigos: conteo(r['testigos']), ultimaPregunta: n(r['ultimaPregunta']), apagada: r['apagada'] === true }
}
