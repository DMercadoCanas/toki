import type { On, PromptComposeInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { ID_BREVE } from '../hooks/breve'
import { DIAS_REVISION_EMPRESA, detectarEmpresa, leerEstadoEmpresa, revisarEmpresa, terminarRevision } from '../hooks/empresa'
import { t } from '../hooks/idioma'

// «Guardia de empresa»: en las cuentas Team y Enterprise, el guardia de Claude Code se salta
// algunos hooks de Toki y le avisa a Claude cada vez (~200 tokens). Con la opción prendida, Toki
// no los registra. Toki la prende al notar el guardia y la apaga cada 30 días para revisar.
// Primero lo puro, después con el motor.

const DIA = 86_400_000
const AHORA = 400 * DIA
const x = t('es')

describe('guardia de empresa (puro)', () => {
  test('lo guardado se lee con cuidado: lo que no se entiende no cuenta', () => {
    expect(leerEstadoEmpresa(undefined)).toEqual({})
    expect(leerEstadoEmpresa('sí')).toEqual({})
    expect(leerEstadoEmpresa({ desde: 'ayer', revisando: 'sí', avisar: 1, nota: '', negada: null })).toEqual({})
    expect(leerEstadoEmpresa({ desde: 5, revisando: true, avisar: true, nota: 's1', negada: true })).toEqual({ desde: 5, revisando: true, avisar: true, nota: 's1', negada: true })
  })

  test('prendida corren los 30 días (desde hoy si la prendiste tú); cumplidos, se apaga para revisar', () => {
    expect(revisarEmpresa({}, true, AHORA)).toEqual({ estado: { desde: AHORA }, apagar: false, avisar: false })
    const casi = AHORA - (DIAS_REVISION_EMPRESA * DIA - 1)
    expect(revisarEmpresa({ desde: casi }, true, AHORA)).toEqual({ estado: { desde: casi }, apagar: false, avisar: false })
    expect(revisarEmpresa({ desde: AHORA - DIAS_REVISION_EMPRESA * DIA }, true, AHORA)).toEqual({ estado: { revisando: true }, apagar: true, avisar: false })
  })

  test('si Toki acaba de prenderla se avisa una vez; si la prendiste tú tras un rechazo, el rechazo se olvida', () => {
    expect(revisarEmpresa({ desde: AHORA, avisar: true }, true, AHORA + 1_000)).toEqual({ estado: { desde: AHORA }, apagar: false, avisar: true })
    expect(revisarEmpresa({ negada: true }, true, AHORA)).toEqual({ estado: { desde: AHORA }, apagar: false, avisar: false })
  })

  test('apagada (por ti o por la revisión), el plazo se olvida y la revisión sigue en pie', () => {
    expect(revisarEmpresa({ desde: AHORA - DIA, avisar: true }, false, AHORA)).toEqual({ estado: {}, apagar: false, avisar: false })
    expect(revisarEmpresa({ revisando: true }, false, AHORA)).toEqual({ estado: { revisando: true }, apagar: false, avisar: false })
  })

  test('al notar el guardia avisa la primera vez, no en la revisión; si se fue, la revisión termina', () => {
    expect(detectarEmpresa({}, AHORA, 's1')).toEqual({ desde: AHORA, avisar: true, nota: 's1' })
    expect(detectarEmpresa({ revisando: true }, AHORA, undefined)).toEqual({ desde: AHORA })
    expect(detectarEmpresa({ negada: true }, AHORA, undefined)).toEqual({ desde: AHORA, avisar: true, negada: true })
    expect(terminarRevision({ revisando: true, negada: true })).toEqual({ negada: true })
  })
})

const PROMPT: PromptComposeInput = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] }
const BASE = [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }]
const USO = { input_tokens: 2, output_tokens: 300, cache_read_input_tokens: 29_000, cache_creation_input_tokens: 998, model: 'claude-opus-5-5' }

type Mundo = {
  guardado: Map<string, unknown>
  toasts: string[]
  /** Cada cambio de opción que Toki pidió, como si fuera en /plugin. */
  cambios: { key: string; value: unknown }[]
  /** Las notas que Toki le deja a Claude en la conversación. */
  notas: string[]
  /** Lo que Toki anotó en el diagnóstico sobre el guardia, sin la hora. */
  diagnostico: string[]
}

/** `superficies`: dónde dibuja la sesión en cada momento (la app llega con isInteractive en false). */
function mundo(on: On, o: { guardado?: Record<string, unknown>; negar?: string; superficies?: () => string[] } = {}): Mundo {
  const m: Mundo = { guardado: new Map(Object.entries(o.guardado ?? {})), toasts: [], cambios: [], notas: [], diagnostico: [] }
  on('store.get', ($, e) => ({ value: m.guardado.get(e.key) }))
  on('store.set', ($, e) => {
    m.guardado.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    m.guardado.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...m.guardado.keys()] }))
  on('config.list', () => ({ value: [] }) as never)
  on('config.set', ($, e) => {
    m.cambios.push({ key: e.key, value: e.value })
    return o.negar === undefined ? { value: e.value } : { deny: o.negar }
  })
  on('session.id', () => ({ value: 's1' }))
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    const linea = (e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, '')
    if (e.path.endsWith('diagnostico.txt') && linea.startsWith('guardia de empresa:')) m.diagnostico.push(linea)
    return { value: undefined }
  })
  on('fs.read', () => ({ deny: 'no existe' }))
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.toast', ($, e) => {
    m.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'prueba' } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: o.superficies?.() ?? [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 30_000, window: 1_000_000, percent: 3 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.append', ($, e, next) => {
    const c = (e as unknown as { message: { content: { text?: string }[] } }).message.content
    m.notas.push(c.map(p => p.text ?? '').join(''))
    return next(e)
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: BASE }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { ...USO, model: e.model } }
  })
  return m
}

type Motor = Parameters<TestBody>[0]

/** Un mensaje tuyo entero. Con el guardia, el motor arma el system prompt sin pasar por Toki. */
async function mensaje($: Motor, turnId: string, o: { conGuardia: boolean }): Promise<void> {
  const texto = 'explícame cómo funciona agendar en src/turnos.ts'
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  if (!o.conGuardia) await $.prompt.compose(PROMPT)
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const, usage: USO } as never)
}

const NOTA = '[Toki] Responde de forma concisa'
const SIN_RUTEO = { options: { recomendarModelo: 'no' } }
const PRENDIDA = { options: { recomendarModelo: 'no', guardiaEmpresa: true } }
const PRENDIDO = (desde: number): Record<string, unknown> => ({ guardiaEmpresa: { desde } })

describe('guardia de empresa con el motor', () => {
  test('un turno entero sin prompt.compose: Toki prende la opción después del turno y recuerda la nota ya mandada', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: true })
    // Cambiar la opción recarga el plugin: no a mitad del turno.
    expect(m.cambios).toEqual([])
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: true }])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA, avisar: true, nota: 's1' })
    expect(m.diagnostico).toEqual(['guardia de empresa: prompt.compose no corrió en un turno entero; Toki prende la opción'])
    // Una sola vez por activación.
    await mensaje($, 't1', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios.length).toBe(1)
  })

  test('si prompt.compose corre, no hay guardia: nada cambia', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: false })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([])
    expect(m.guardado.has('guardiaEmpresa')).toBe(false)
  })

  test('sin una persona delante (-p, una eval) no cambia tu configuración', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([])
  })

  test('en la app de escritorio (isInteractive en false, pero con superficie) también la prende', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { superficies: () => ['desktop'] })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: true }])
  })

  test('si la app aún no se veía al empezar, la revisión de los 30 días va al final del primer mensaje', PRENDIDA, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    let superficies: string[] = []
    const m = mundo(on, { guardado: PRENDIDO(AHORA - DIAS_REVISION_EMPRESA * DIA), superficies: () => superficies })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([])
    superficies = ['desktop']
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: false }])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ revisando: true })
  })

  test('un turno que empezó antes de recargar el plugin no prueba nada', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId: 't9', reason: 'answer' as const, usage: USO } as never)
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([])
  })

  test('prendida, Toki no agrega la sección al system prompt y las respuestas breves van como nota', PRENDIDA, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: PRENDIDO(AHORA - DIA) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose(PROMPT)
    expect(r.sections.some(s => s.id === ID_BREVE)).toBe(false)
    await mensaje($, 't0', { conGuardia: true })
    expect(m.notas.filter(n => n.startsWith(NOTA)).length).toBe(1)
    expect(m.cambios).toEqual([])
  })

  test('apagada, la sección va como siempre', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose(PROMPT)
    expect(r.sections.some(s => s.id === ID_BREVE)).toBe(true)
  })

  test('al recargar con la opción prendida: avisa qué hizo una vez y no repite la nota', PRENDIDA, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { guardiaEmpresa: { desde: AHORA, avisar: true, nota: 's1' } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.toasts.filter(t => t === x.toastEmpresa).length).toBe(1)
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA })
    await mensaje($, 't0', { conGuardia: true })
    expect(m.notas.some(n => n.startsWith(NOTA))).toBe(false)
  })

  test('la nota de otra conversación no cuenta: en esta sí va', PRENDIDA, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { guardiaEmpresa: { desde: AHORA, nota: 's0' } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: true })
    expect(m.notas.filter(n => n.startsWith(NOTA)).length).toBe(1)
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA })
  })

  test('si la prendiste tú, los 30 días corren desde hoy; antes de cumplirse no se toca', PRENDIDA, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await reloj.advance(1_000)
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA })
    expect(m.cambios).toEqual([])
    expect(m.toasts.some(t => t === x.toastEmpresa)).toBe(false)
  })

  test('a los 30 días Toki la apaga para revisar, sin avisar', PRENDIDA, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: PRENDIDO(AHORA - DIAS_REVISION_EMPRESA * DIA) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.cambios).toEqual([])
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: false }])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ revisando: true })
    expect(m.diagnostico).toEqual([`guardia de empresa: ${DIAS_REVISION_EMPRESA} días con la opción prendida; Toki la apaga para ver si sigue`])
    expect(m.toasts.some(t => t === x.toastEmpresa)).toBe(false)
  })

  test('en la revisión, si el guardia sigue, la vuelve a prender sin avisar', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { guardiaEmpresa: { revisando: true } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: true }])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA, nota: 's1' })
  })

  test('en la revisión, si prompt.compose corre, el guardia ya no está y la opción queda apagada', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { guardiaEmpresa: { revisando: true } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: false })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({})
    expect(m.diagnostico).toEqual(['guardia de empresa: ya no está (prompt.compose corrió); la opción queda apagada'])
  })

  test('si la apagaste tú (cambiaste de cuenta), el plazo se olvida; si el guardia sigue, Toki la prende y avisa', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: PRENDIDO(AHORA - 5 * DIA) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.guardado.get('guardiaEmpresa')).toEqual({})
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios).toEqual([{ key: 'toki.guardiaEmpresa', value: true }])
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ desde: AHORA, avisar: true, nota: 's1' })
  })

  test('si Claude Code no deja cambiarla, avisa una vez que puedes hacerlo tú', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { negar: 'la administra tu organización' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.guardado.get('guardiaEmpresa')).toEqual({ negada: true })
    expect(m.toasts.filter(t => t === x.toastEmpresaNegada).length).toBe(1)
    expect(m.diagnostico).toEqual([
      'guardia de empresa: prompt.compose no corrió en un turno entero; Toki prende la opción',
      'guardia de empresa: Claude Code no dejó prender la opción (la administra tu organización)',
    ])
  })

  test('el aviso de que no se pudo se da una sola vez, desde siempre', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { guardiaEmpresa: { negada: true } }, negar: 'no' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', { conGuardia: true })
    await reloj.advance(1_000)
    expect(m.cambios.length).toBe(1)
    expect(m.toasts.some(t => t === x.toastEmpresaNegada)).toBe(false)
  })
})
