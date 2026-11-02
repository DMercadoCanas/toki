import { describe, expect, test } from 'claude-code/testing'

import { anotarRespuesta, CADA_PREGUNTA, calidadVacia, ENTRE_PREGUNTAS, esBajado, leerCalidad, marcarPregunta, META_RESPUESTAS, sumarMensaje, sumarSiguiente, tocaPreguntar } from '../hooks/calidad'
import type { Calidad, GrupoCalidad } from '../hooks/calidad'

// «¿Quedó bien?»: lo que Toki bajó solo, contra sus testigos, con lo que respondes y corriges.

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const AHORA = 1_800_000_000_000

/** Un mensaje del grupo; si le toca, lo pregunta. Devuelve si preguntó. */
function mensaje(c: Calidad, grupo: GrupoCalidad, ahora: number): [Calidad, boolean] {
  const sumada = sumarMensaje(c, grupo)
  const toca = tocaPreguntar(sumada, grupo, ahora)
  return [toca ? marcarPregunta(sumada, grupo, ahora) : sumada, toca]
}

describe('¿quedó bien?', () => {
  test('bajado es un modelo más chico, o el mismo con menos esfuerzo', () => {
    expect(esBajado({ modelo: OPUS, esfuerzo: 'high' }, { modelo: SONNET, esfuerzo: 'high' })).toBe(true)
    expect(esBajado({ modelo: OPUS, esfuerzo: 'high' }, { modelo: OPUS, esfuerzo: 'low' })).toBe(true)
    expect(esBajado({ modelo: OPUS, esfuerzo: 'low' }, { modelo: OPUS, esfuerzo: 'high' })).toBe(false)
    expect(esBajado({ modelo: OPUS, esfuerzo: 'high' }, { modelo: OPUS, esfuerzo: 'high' })).toBe(false)
    // Subir de modelo no es bajar, aunque baje el esfuerzo.
    expect(esBajado({ modelo: SONNET, esfuerzo: 'high' }, { modelo: OPUS, esfuerzo: 'low' })).toBe(false)
    expect(esBajado({ modelo: 'claude-fable-5-1', esfuerzo: 'medium' }, { modelo: OPUS, esfuerzo: 'max' })).toBe(true)
  })

  test(`de los bajados pregunta por 1 de cada ${CADA_PREGUNTA}, el primero incluido; de los testigos, por cada uno; nunca dos seguidas`, () => {
    let c = calidadVacia()
    let preguntadas: number[] = []
    for (let i = 0; i < 2 * CADA_PREGUNTA + 1; i++) {
      let toca: boolean
      ;[c, toca] = mensaje(c, 'bajados', AHORA + i * ENTRE_PREGUNTAS)
      if (toca) preguntadas.push(i)
    }
    expect(preguntadas).toEqual([0, CADA_PREGUNTA, 2 * CADA_PREGUNTA])
    expect(c.bajados).toEqual({ mensajes: 2 * CADA_PREGUNTA + 1, preguntas: 3, bien: 0, mal: 0, siguientes: 0, corregidos: 0 })

    // Testigos: cada uno, pero no dos dentro de ENTRE_PREGUNTAS (la espera vale para los dos grupos).
    const ultima = c.ultimaPregunta
    preguntadas = []
    for (const [i, cuando] of [ultima + 1, ultima + ENTRE_PREGUNTAS, ultima + ENTRE_PREGUNTAS + 1, ultima + 2 * ENTRE_PREGUNTAS].entries()) {
      let toca: boolean
      ;[c, toca] = mensaje(c, 'testigos', cuando)
      if (toca) preguntadas.push(i)
    }
    // El que no pudo preguntarse queda debiendo: sale en el siguiente testigo con espera cumplida.
    expect(preguntadas).toEqual([1, 3])
    expect(c.testigos.preguntas).toBe(2)
  })

  test('las respuestas: bien y mal cuentan, «aún no sé» no, y «no preguntes más» la apaga', () => {
    let c = calidadVacia()
    c = anotarRespuesta(c, 'bajados', 'bien')
    c = anotarRespuesta(c, 'bajados', 'mal')
    c = anotarRespuesta(c, 'testigos', 'nose')
    expect(c.bajados.bien).toBe(1)
    expect(c.bajados.mal).toBe(1)
    expect(c.testigos).toEqual(calidadVacia().testigos)
    c = anotarRespuesta(c, 'testigos', 'apagar')
    expect(c.apagada).toBe(true)
    expect(tocaPreguntar(sumarMensaje(c, 'testigos'), 'testigos', AHORA)).toBe(false)
  })

  test(`con ${META_RESPUESTAS} respuestas en un grupo ya no pregunta por él`, () => {
    const c: Calidad = { ...calidadVacia(), testigos: { mensajes: META_RESPUESTAS, preguntas: META_RESPUESTAS, bien: META_RESPUESTAS - 1, mal: 1, siguientes: 0, corregidos: 0 } }
    expect(tocaPreguntar(sumarMensaje(c, 'testigos'), 'testigos', AHORA)).toBe(false)
    expect(tocaPreguntar(sumarMensaje(c, 'bajados'), 'bajados', AHORA)).toBe(true)
  })

  test('tu mensaje siguiente cuenta si corregía; lo guardado se lee con cuidado', () => {
    let c = sumarSiguiente(calidadVacia(), 'bajados', true)
    c = sumarSiguiente(c, 'bajados', false)
    expect(c.bajados.siguientes).toBe(2)
    expect(c.bajados.corregidos).toBe(1)
    expect(leerCalidad(JSON.parse(JSON.stringify(c)))).toEqual(c)
    expect(leerCalidad(null)).toEqual(calidadVacia())
    expect(leerCalidad({ bajados: { mensajes: -3, bien: 'x', mal: 2 }, apagada: 'sí' })).toEqual({ ...calidadVacia(), bajados: { ...calidadVacia().bajados, mal: 2 } })
  })
})
