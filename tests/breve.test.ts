import type { On, PromptComposeInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { ahorroBreve, cifraUsd, costoSeccionBreve, SALIDA_BREVE, salidaEvitadaBreve, TOKENS_BREVE } from '../hooks/ahorro'
import { breveActivo, decidirBreve, ESTILO_TOKI, ID_BREVE, SECCION_BREVE } from '../hooks/breve'
import type { DecisionBreve } from '../hooks/breve'
import { formatearTokens } from '../hooks/mascota'

// Respuestas breves: una sección fija al final del system prompt, y la salida que Claude no escribió
// cuenta como ahorro (menos lo que cuesta mandarla). Primero lo puro, después con el motor.

const H = 3_600_000

function cerca(a: number, b: number): void {
  expect(Math.abs(a - b)).toBeLessThan(1e-12)
}

describe('respuestas breves (puro)', () => {
  test('con el estilo por defecto y la opción prendida, va la sección', () => {
    expect(decidirBreve({ activo: true, estilo: null, traits: [] })).toBe('agregar')
    expect(decidirBreve({ activo: true, estilo: undefined, traits: ['skills', 'print'] })).toBe('agregar')
  })

  test('tu estilo se respeta; el de Toki pide lo mismo y cuenta; --bare no se toca; apagada, nada', () => {
    expect(decidirBreve({ activo: true, estilo: 'Explanatory', traits: [] })).toBe('tuyo')
    expect(decidirBreve({ activo: true, estilo: ESTILO_TOKI, traits: [] })).toBe('estilo')
    expect(decidirBreve({ activo: false, estilo: ESTILO_TOKI, traits: [] })).toBe('estilo')
    expect(decidirBreve({ activo: true, estilo: null, traits: ['bare'] })).toBe('bare')
    expect(decidirBreve({ activo: false, estilo: null, traits: [] })).toBe('apagado')
    const todas: (DecisionBreve | undefined)[] = ['agregar', 'estilo', 'tuyo', 'apagado', 'bare', undefined]
    expect(todas.map(breveActivo)).toEqual([true, true, false, false, false, false])
  })

  test('la sección: fija, en inglés, sin recortar lo técnico, en tu idioma y corta', () => {
    expect(ID_BREVE).toBe('toki:breve')
    expect(SECCION_BREVE.startsWith('# Brief replies\n')).toBe(true)
    expect(SECCION_BREVE).toContain('Never cut code, commands, paths, error messages, numbers, security warnings')
    expect(SECCION_BREVE).toContain('If the person asks for detail or a longer explanation, give it.')
    expect(SECCION_BREVE).toContain("Reply in the person's language.")
    expect(SECCION_BREVE).not.toMatch(/[áéíóúñ¿¡]/)
    // ~4 caracteres por token: cabe en lo que Toki descuenta.
    expect(SECCION_BREVE.length).toBeLessThan(TOKENS_BREVE * 4)
  })

  test('lo que vale: la salida que no se escribió, a precio del modelo y el esfuerzo sin Toki', () => {
    expect(SALIDA_BREVE).toBe(0.88)
    cerca(salidaEvitadaBreve(1_000), 1_000 * (1 / 0.88 - 1))
    cerca(ahorroBreve(1_000, 'opus'), (1_000 * (1 / 0.88 - 1) * 20) / 1_000_000)
    cerca(ahorroBreve(1_000, 'sonnet'), (1_000 * (1 / 0.88 - 1) * 10) / 1_000_000)
    // Con tu esfuerzo (muy alto) habría escrito 1,37 veces más.
    cerca(ahorroBreve(1_000, 'opus', 0, 1.37), (1_370 * (1 / 0.88 - 1) * 20) / 1_000_000)
    for (const malo of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(salidaEvitadaBreve(malo)).toBe(0)
    expect(salidaEvitadaBreve(1_000, 0)).toBe(0)
    expect(ahorroBreve(0, 'opus')).toBe(0)
  })

  test('lo que cuesta mandarla: leída del caché casi nada; escrita, un poco más; se paga sola', () => {
    cerca(costoSeccionBreve('opus', false, false), (210 * 0.2) / 1_000_000)
    cerca(costoSeccionBreve('opus', true, false), (210 * 5) / 1_000_000)
    cerca(costoSeccionBreve('opus', true, true), (210 * 8) / 1_000_000)
    // 500 tokens de salida en Opus valen más de 30 veces lo que cuesta leerla.
    expect(ahorroBreve(500, 'opus') / costoSeccionBreve('opus', false, false)).toBeGreaterThan(30)
  })
})

// ---------- Con el motor ----------

type Mundo = { toasts: string[]; salida: number }

/** El system prompt de siempre, como lo arma el motor: la parte compartida y la de la sesión. */
const BASE = [
  { id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const },
  { id: 'memory', text: 'Notas de la sesión.', scope: 'session' as const },
]

const PROMPT: PromptComposeInput = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] }

function mundo(on: On, o: { tokens: number; salida: number; store?: Record<string, unknown> }): Mundo {
  const m: Mundo = { toasts: [], salida: o.salida }
  mock.store(on, o.store)
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
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
  on('session.surfaces', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: o.tokens, window: 1_000_000, percent: 10 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', ($, e) => ({ sections: e.traits.includes('bare') ? [{ id: 'bare', text: 'You are Claude Code.', scope: 'shared' as const }] : BASE }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: m.salida, cache_read_input_tokens: o.tokens - 1_000, cache_creation_input_tokens: 998, model: e.model },
    }
  })
  return m
}

type Motor = Parameters<TestBody>[0]

async function mensaje($: Motor, turnId: string, texto: string): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })
}

async function panel($: Motor): Promise<string> {
  return ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
}

const AVISO = 'Toki le pide a Claude respuestas breves'
const SIN_RUTEO = { options: { recomendarModelo: 'no' } }

describe('respuestas breves con el motor', () => {
  test('la sección va al final, del lado de la sesión, y la salida que Claude no escribió cuenta (menos lo que costó mandarla)', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 5_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose(PROMPT)
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'memory', ID_BREVE])
    expect(r.sections[2]).toEqual({ id: ID_BREVE, text: SECCION_BREVE, scope: 'session' })
    await mensaje($, 't0', 'explícame cómo funciona agendar en src/turnos.ts')
    // El primer pedido escribe la sección en el caché (en la API, de 5 min).
    let usd = ahorroBreve(5_000, 'opus') - costoSeccionBreve('opus', true, false)
    let tokens = salidaEvitadaBreve(5_000)
    let toki = await panel($)
    expect(toki).toContain(`  Respuestas breves: ${cifraUsd(usd)} (~${formatearTokens(Math.round(tokens))} tokens de salida que Claude no escribió; estimado con lo medido, ~12 % menos)\n`)
    expect(toki).toContain('las respuestas breves, de la salida de cada pedido con lo medido (~12 % menos)')
    // La cifra de arriba ya lo incluye.
    const cifra = Number(/^Toki · ~\$([\d.]+) ahorrados en esta sesión/.exec(toki)?.[1])
    expect(cifra).toBeGreaterThanOrEqual(Number(usd.toFixed(2)))
    // El siguiente la lee del caché.
    m.salida = 3_000
    await mensaje($, 't1', 'y ahora explícame los casos borde de agendar')
    usd += ahorroBreve(3_000, 'opus') - costoSeccionBreve('opus', false, false)
    tokens += salidaEvitadaBreve(3_000)
    toki = await panel($)
    expect(toki).toContain(`  Respuestas breves: ${cifraUsd(usd)} (~${formatearTokens(Math.round(tokens))} tokens de salida`)
    // El aviso, una sola vez y para siempre.
    expect(m.toasts.filter(t => t.startsWith(AVISO)).length).toBe(1)
    expect(m.toasts.find(t => t.startsWith(AVISO))).toContain('~12 % menos salida, medido')
    // Ya con respuestas breves, Toki no sugiere el estilo conciso.
    expect(toki).not.toContain('toki:conciso')
    const semana = ((await $.command.run({ command: 'toki-semana', args: '' } as never)) as { text: string }).text
    expect(semana).toContain(`Respuestas breves: ${cifraUsd(usd)} en salida que Claude no escribió (estimado con lo medido)`)
  })

  test('si el aviso ya se dio en otra sesión, no se repite', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 5_000, store: { avisoBreveDado: true } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.prompt.compose(PROMPT)
    await mensaje($, 't0', 'explícame cómo funciona agendar en src/turnos.ts')
    expect(m.toasts.some(t => t.startsWith(AVISO))).toBe(false)
    expect(await panel($)).toContain('  Respuestas breves: ')
  })

  test('tu propio /output-style se respeta: ni sección ni ahorro', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 5_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose({ ...PROMPT, outputStyle: { name: 'Explanatory', isKeepingCodingInstructions: true } })
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'memory'])
    await mensaje($, 't0', 'explícame cómo funciona agendar en src/turnos.ts')
    const toki = await panel($)
    expect(toki).not.toContain('Respuestas breves')
    expect(toki).not.toContain('toki:conciso')
    expect(m.toasts.some(t => t.startsWith(AVISO))).toBe(false)
  })

  test('con /output-style toki:conciso no hace falta la sección, y la salida cuenta igual', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 5_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose({ ...PROMPT, outputStyle: { name: ESTILO_TOKI, isKeepingCodingInstructions: true } })
    expect(r.sections.some(s => s.id === ID_BREVE)).toBe(false)
    await mensaje($, 't0', 'explícame cómo funciona agendar en src/turnos.ts')
    expect(await panel($)).toContain(`  Respuestas breves: ${cifraUsd(ahorroBreve(5_000, 'opus') - costoSeccionBreve('opus', true, false))} `)
    // Lo elegiste tú: no hay aviso.
    expect(m.toasts.some(t => t.startsWith(AVISO))).toBe(false)
  })

  test('con --bare no se toca el prompt', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    mundo(on, { tokens: 30_000, salida: 5_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose({ ...PROMPT, traits: ['bare'] })
    expect(r.sections.map(s => s.id)).toEqual(['bare'])
  })

  test('apagada en /plugin: ni sección ni ahorro', { options: { recomendarModelo: 'no', concisoAutomatico: false } }, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 5_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.prompt.compose(PROMPT)
    expect(r.sections.some(s => s.id === ID_BREVE)).toBe(false)
    await mensaje($, 't0', 'explícame cómo funciona agendar en src/turnos.ts')
    expect(await panel($)).not.toContain('Respuestas breves')
    expect(m.toasts.some(t => t.startsWith(AVISO))).toBe(false)
  })

  test('si mandar la sección cuesta más de lo que ahorra (una respuesta de una palabra), no suma: la cuenta sigue', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 30_000, salida: 10 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.prompt.compose(PROMPT)
    await mensaje($, 't0', 'ok')
    expect(await panel($)).not.toContain('Respuestas breves')
    // El siguiente, largo: suma lo suyo menos lo que faltaba del anterior.
    m.salida = 5_000
    await mensaje($, 't1', 'explícame cómo funciona agendar en src/turnos.ts')
    const usd = ahorroBreve(10, 'opus') - costoSeccionBreve('opus', true, false) + ahorroBreve(5_000, 'opus') - costoSeccionBreve('opus', false, false)
    expect(await panel($)).toContain(`  Respuestas breves: ${cifraUsd(usd)} `)
  })
})
