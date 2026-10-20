import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

// Lo que Toki hace cuando el guardia corporativo apaga los eventos de compactación
// y de cambio de modelo, o cuando el hook de comando no corre (Windows sin Git Bash).

const USO_TURNO = { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 1_000, model: 'claude-sonnet-5-5' }

/** Lo que hay debajo de los plugins en una sesión real: el turno empieza y termina. */
function motor(on: On): void {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
}

function fin(turnId: string, answer = 'Listo, revisé el código.') {
  return { answer, durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const, usage: USO_TURNO }
}

describe('plan B', () => {
  test('tras una compactación entre turnos, Toki mismo le recuerda la tarea a Claude (una sola vez)', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    const sesion = mock.session(on)
    let tokens: number | undefined = 150_000
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 200_000, percent: tokens === undefined ? undefined : 75 }, rateLimits: [] } }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    motor(on)

    await $.turn.start({ text: 'arregla el login que falla con tarjetas vencidas', turnId: 't1' })
    await $.turn.complete(fin('t1'))
    tokens = undefined // Claude Code compactó: el contexto queda sin cifra hasta la próxima respuesta.
    await $.turn.start({ text: 'sigue', turnId: 't2' })

    const notas = sesion.appended().map(r => JSON.stringify(r.message))
    const recordatorios = notas.filter(n => n.includes('Recordatorio guardado antes de compactar'))
    expect(recordatorios.length).toBe(1)
    expect(recordatorios[0]).toContain('arregla el login que falla con tarjetas vencidas')
    expect(toasts.some(t => t.includes('se compactó el contexto'))).toBe(true)

    // La respuesta siguiente trae la cifra nueva (más chica): no es otra compactación.
    tokens = 12_000
    await $.turn.complete(fin('t2'))
    await $.turn.start({ text: 'ahora revisa también el registro de usuarios', turnId: 't3' })
    expect(sesion.appended().filter(r => JSON.stringify(r.message).includes('Recordatorio')).length).toBe(1)
  })

  test('nota un cambio de modelo con el caché caliente aunque el evento no llegue', async ($, on) => {
    const reloj = mock.clock(on, { now: 2_000_000 })
    mock.store(on)
    let modelo = 'claude-sonnet-5-5'
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 120_000, window: 200_000, percent: 60 }, rateLimits: [] } }))
    on('session.model', () => ({ value: modelo }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    motor(on)

    await $.turn.start({ text: 'revisa el flujo de pagos completo por favor', turnId: 't1' })
    await $.turn.complete(fin('t1'))
    modelo = 'claude-opus-5-5' // /model con el caché caliente
    await $.turn.start({ text: 'sigue con lo mismo', turnId: 't2' })
    await reloj.advance(10)
    expect(toasts.some(t => t.includes('cambiaste a Opus') && t.includes('~120.0k'))).toBe(true)
  })

  test('con poco contexto, cambiar de modelo no genera aviso', async ($, on) => {
    const reloj = mock.clock(on, { now: 3_000_000 })
    mock.store(on)
    let modelo = 'claude-sonnet-5-5'
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 6_000, window: 200_000, percent: 3 }, rateLimits: [] } }))
    on('session.model', () => ({ value: modelo }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    motor(on)
    await $.turn.start({ text: 'hola, empecemos con el proyecto nuevo', turnId: 't1' })
    await $.turn.complete(fin('t1'))
    modelo = 'claude-haiku-5-5'
    await $.turn.start({ text: 'sigue con lo mismo', turnId: 't2' })
    await reloj.advance(10)
    expect(toasts.some(t => t.includes('cambiaste'))).toBe(false)
  })
})
