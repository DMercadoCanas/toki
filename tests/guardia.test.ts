import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { recortarPegado } from '../hooks/pegados'
import { agregarMuestra, evaluarCacheFrio, opcionesFrio, preguntaFrio, proyectar, textosGuardia } from '../hooks/guardia'

// Las dos guardias antes de enviar: caché vencido y límites. Primero lo puro, después con el motor.

const H = 3_600_000
const MIN = 60_000
const x = textosGuardia.es

describe('caché vencido (puro)', () => {
  const base = { ahora: 10 * H, ultimoUsoCache: 10 * H - 61 * MIN, ttlMin: 60, contexto: 220_000, familia: 'opus' as const, ttl1h: true }

  test('con el caché vivo, o con poco contexto, no hay nada que avisar', () => {
    expect(evaluarCacheFrio({ ...base, ultimoUsoCache: 10 * H - 30 * MIN })).toBe(undefined)
    expect(evaluarCacheFrio({ ...base, contexto: 40_000 })).toBe(undefined)
    expect(evaluarCacheFrio({ ...base, ultimoUsoCache: 0 })).toBe(undefined)
  })

  test('con 220k en Opus: reescribir cuesta ~$1.72, como varios mensajes normales, y compactar es la recomendada', () => {
    const f = evaluarCacheFrio(base)
    if (f === undefined) throw new Error('debió avisar')
    expect(f.minutos).toBe(61)
    expect(Math.abs(f.extraUsd - (220_000 * (8 - 0.2)) / 1_000_000)).toBeLessThan(1e-9)
    expect(f.mensajes).toBeGreaterThanOrEqual(4)
    expect(f.mensajes).toBeLessThanOrEqual(7)
    expect(f.despuesPct).toBeGreaterThan(30)
    expect(f.recomendada).toBe('compactar')
    const ops = opcionesFrio(f, x)
    expect(ops.map(o => o.tipo)).toEqual(['compactar', 'enviar', 'limpio'])
    expect(ops[0]?.etiqueta).toMatch(/★$/)
    expect(preguntaFrio(f, true, x)).toContain('mensajes normales de tu límite')
    expect(preguntaFrio(f, false, x)).toContain('≈$1.72 más')
  })

  test('con 80k, enviar así es la recomendada; en la API vence a los 5 min', () => {
    const f = evaluarCacheFrio({ ...base, contexto: 80_000, ttlMin: 5, ttl1h: false, ultimoUsoCache: 10 * H - 6 * MIN })
    expect(f?.recomendada).toBe('enviar')
    expect(opcionesFrio(f as NonNullable<typeof f>, x)[0]?.tipo).toBe('enviar')
  })
})

describe('límites (puro)', () => {
  const ahora = 100 * H

  test('a 70 % con 2 h por delante y 3 h usadas: se acaba antes de renovarse', () => {
    const p = proyectar({ ventana: 'five_hour', pct: 70, reinicia: ahora + 2 * H, ahora, muestras: [] })
    expect(p?.avisar).toBe(true)
    expect(p?.critico).toBe(false)
    // 70 % en 3 h = 23,3/h; faltan 30 → ~1,3 h.
    expect(Math.abs(((p?.agotaEn ?? 0) - ahora) / H - 30 / (70 / 3))).toBeLessThan(0.01)
  })

  test('a buen ritmo, o por debajo del umbral, no avisa', () => {
    expect(proyectar({ ventana: 'five_hour', pct: 40, reinicia: ahora + 1 * H, ahora, muestras: [] })?.avisar).toBe(false)
    expect(proyectar({ ventana: 'five_hour', pct: 45, reinicia: ahora + 4 * H, ahora, muestras: [] })?.avisar).toBe(false)
    expect(proyectar({ ventana: 'seven_day', pct: 20, reinicia: ahora + 24 * H, ahora, muestras: [] })?.avisar).toBe(false)
  })

  test('en la de 5 h manda el ritmo reciente: si aceleraste, avisa aunque el promedio vaya bien', () => {
    const reinicia = ahora + 1 * H
    // Promedio: 55 % en 4 h (13,75/h) → los 45 que faltan duran más de la hora que queda.
    expect(proyectar({ ventana: 'five_hour', pct: 55, reinicia, ahora, muestras: [] })?.avisar).toBe(false)
    // Pero en los últimos 20 min subió 20 puntos: a 60/h se acaba en ~45 min.
    const p = proyectar({ ventana: 'five_hour', pct: 55, reinicia, ahora, muestras: [{ t: ahora - 20 * MIN, pct: 35 }] })
    expect(p?.avisar).toBe(true)
    expect(p?.ritmoHora).toBe(60)
  })

  test('las muestras: solo cuando cambia el %, y nada de la ventana anterior', () => {
    let m = agregarMuestra([], { t: 1, pct: 10 }, 0)
    m = agregarMuestra(m, { t: 2, pct: 10 }, 0)
    m = agregarMuestra(m, { t: 3, pct: 12 }, 0)
    expect(m).toEqual([{ t: 1, pct: 10 }, { t: 3, pct: 12 }])
    // Se renovó: el % bajó y empieza otra ventana.
    expect(agregarMuestra(m, { t: 10, pct: 2 }, 5)).toEqual([{ t: 10, pct: 2 }])
  })

  test('al 90 % es crítico; ya renovado no proyecta', () => {
    expect(proyectar({ ventana: 'seven_day', pct: 91, reinicia: ahora + H, ahora, muestras: [] })?.critico).toBe(true)
    expect(proyectar({ ventana: 'seven_day', pct: 91, reinicia: ahora - H, ahora, muestras: [] })).toBe(undefined)
  })
})

// ---------- Con el motor ----------

type Limite = { kind: string; percentUsed: number; resetsAt?: string }
type Mundo = { reenviados: string[]; toasts: string[]; preguntas: string[]; etiquetas: string[][]; compactos: number; fills: string[]; comandos: string[]; entrados: string[]; escritos: Record<string, string>; vistos: { turnId: string; model: string; effort?: string }[] }

function mundo(on: On, o: { tokens: number; limites?: () => Limite[]; respuesta?: (etiquetas: string[]) => string }): Mundo {
  const m: Mundo = { reenviados: [], toasts: [], preguntas: [], etiquetas: [], compactos: 0, fills: [], comandos: [], entrados: [], escritos: {}, vistos: [] }
  mock.store(on)
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    m.escritos[e.path] = e.text
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
  on('session.surfaces', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: o.tokens, window: 1_000_000, percent: 10 }, rateLimits: o.limites?.() ?? [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.compact', () => {
    m.compactos += 1
    return { messages: [{ role: 'user', text: 'Resumen de lo anterior.', toolUses: [] }], tokensBefore: 220_000, tokensAfter: 30_000 } as never
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') m.reenviados.push(e.text)
    m.entrados.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', ($, e) => {
    m.fills.push(e.text)
    return { isFilled: true } as never
  })
  on('command.run', { command: 'clear' }, () => {
    m.comandos.push('clear')
    return { text: '' } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('turn.step', async function* ($, e) {
    m.vistos.push({ turnId: e.turnId, model: e.model, effort: typeof e.effort === 'string' ? e.effort : undefined })
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: o.tokens - 1_000, cache_creation_input_tokens: 998, model: e.model },
    }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    m.preguntas.push(q.question)
    const ls = q.options.map(op => op.label)
    m.etiquetas.push(ls)
    const elegida = o.respuesta?.(ls) ?? ls[0] ?? ''
    return { result: { questions: [], answers: { [q.question]: elegida } } } as never
  })
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  return m
}

type Motor = Parameters<TestBody>[0]

/** Manda un mensaje como lo haría la persona; si Toki lo frena, no hay turno. */
async function mensaje($: Motor, turnId: string, texto: string): Promise<unknown> {
  const r = await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  if (r !== null && typeof r === 'object' && 'drop' in r) return r
  await $.turn.start({ text: texto, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })
  return r
}

describe('guardias con el motor', () => {
  test('caché vencido con 220k: pregunta antes de enviar, compacta, reenvía tu mensaje y después no vuelve a preguntar', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 220_000, respuesta: ls => ls.find(l => l.startsWith('Compactar')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    expect(m.preguntas.length).toBe(0)
    // Sin límites de suscripción: API, el caché dura 5 min.
    await reloj.advance(6 * MIN)
    const r = await mensaje($, 't1', 'ahora agrega también el filtro por fecha')
    expect(m.preguntas[0]).toContain('Tu caché venció (pasaron 6 min)')
    expect(m.preguntas[0]).toContain('reescribe 220k')
    expect(m.etiquetas[0]?.[0]).toMatch(/^Compactar y enviar .* ★$/)
    // Con tu mensaje en la mano no se puede compactar: se frena, se compacta y se reenvía como tuyo.
    expect(r).toEqual({ drop: expect.stringContaining('compacto') })
    await reloj.advance(100)
    expect(m.compactos).toBe(1)
    expect(m.reenviados).toEqual(['ahora agrega también el filtro por fecha'])
    await $.turn.start({ text: 'ahora agrega también el filtro por fecha', turnId: 't1' })
    await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const })
    // El turno siguiente, con el caché vivo: nada.
    await mensaje($, 't2', 'y el de estado también')
    expect(m.preguntas.length).toBe(1)
  })

  test('caché vencido: "Empezar en limpio" frena el mensaje, hace /clear y lo devuelve al cuadro', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 220_000, respuesta: ls => ls.find(l => l.startsWith('Empezar en limpio')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    await reloj.advance(6 * MIN)
    const r = await mensaje($, 't1', 'ahora agrega también el filtro por fecha')
    expect(r).toEqual({ drop: expect.stringContaining('limpiando') })
    expect(m.vistos.some(v => v.turnId === 't1')).toBe(false)
    await reloj.advance(200)
    expect(m.comandos).toEqual(['clear'])
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await reloj.advance(500)
    expect(m.fills.some(f => f.startsWith('ahora agrega también el filtro por fecha'))).toBe(true)
  })

  test('"Enviar así" dos veces y no vuelve a preguntar en la sesión', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 220_000, respuesta: ls => ls.find(l => l.startsWith('Enviar así')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    for (const t of ['t1', 't2', 't3']) {
      await reloj.advance(6 * MIN)
      await mensaje($, t, 'sigue con la siguiente tabla, por favor')
    }
    expect(m.preguntas.length).toBe(2)
    expect(m.compactos).toBe(0)
    expect(m.toasts.some(t => t.includes('no te pregunto más'))).toBe(true)
  })

  test('sin sesión interactiva (claude -p) no pregunta nada', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 220_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    await reloj.advance(6 * MIN)
    await mensaje($, 't1', 'ahora agrega también el filtro por fecha')
    expect(m.preguntas.length).toBe(0)
  })

  test('límite de 5 h: a este ritmo se acaba antes de renovarse → avisa una sola vez', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const reinicia = new Date(50 * H + 2 * H).toISOString()
    const m = mundo(on, { tokens: 30_000, limites: () => [{ kind: 'five_hour', percentUsed: 70, resetsAt: reinicia }, { kind: 'seven_day', percentUsed: 20 }] })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    await reloj.advance(10_000)
    await mensaje($, 't1', 'sigue con la siguiente tabla, por favor')
    const avisos = m.toasts.filter(t => t.includes('tu límite de 5 h se acaba'))
    expect(avisos.length).toBe(1)
    expect(m.preguntas.some(q => q.includes('Llevas'))).toBe(false)
  })

  test('al 92 %: pregunta una vez; con modo ahorro, lo siguiente va con menos esfuerzo sin preguntar', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const reinicia = new Date(50 * H + 1 * H).toISOString()
    const m = mundo(on, {
      tokens: 30_000,
      limites: () => [{ kind: 'five_hour', percentUsed: 92, resetsAt: reinicia }],
      respuesta: ls => ls.find(l => l.startsWith('Modo ahorro')) ?? '',
    })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'ultrathink: diseña la arquitectura de la sincronización offline y analiza todos los escenarios de conflicto')
    expect(m.preguntas[0]).toContain('Llevas 92% de tu límite de 5 h')
    expect(m.etiquetas[0]?.[0]).toMatch(/^Modo ahorro .* ★$/)
    // Lo profundo, en ahorro: alto en vez de máximo.
    expect(m.vistos.find(v => v.turnId === 't0')?.effort).toBe('high')
    await reloj.advance(10_000)
    await mensaje($, 't1', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    expect(m.preguntas.length).toBe(1)
    expect(m.vistos.find(v => v.turnId === 't1')?.effort).toBe('low')
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('Modo ahorro por límite hasta')
  })

  test('al 92 %: "Esperar" frena el mensaje y lo deja en el cuadro', async ($, on) => {
    const reloj = mock.clock(on, { now: 50 * H })
    const reinicia = new Date(50 * H + 1 * H).toISOString()
    const m = mundo(on, { tokens: 30_000, limites: () => [{ kind: 'seven_day', percentUsed: 95, resetsAt: reinicia }], respuesta: ls => ls.find(l => l.startsWith('Esperar')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    expect(m.preguntas[0]).toContain('límite de la semana')
    expect(r).toEqual({ drop: expect.stringContaining('quedó en el cuadro') })
    await reloj.advance(200)
    expect(m.fills).toContain('agrega un botón de exportar a CSV en la tabla de pacientes')
  })
})

describe('textos pegados enormes', () => {
  const log = (n: number) =>
    ['por qué falla el build?', ...Array.from({ length: n }, (_, i) => (i === 1500 ? 'ERROR: Cannot find module ./config' : `[info] compilando módulo ${i} de ${n} sin novedad en el paso actual`))].join('\n')

  test('puro: deja principio, final, errores del medio y la ruta', () => {
    const r = recortarPegado(log(3000), '.claude/toki/pegados/a.txt')
    expect(r).toBeDefined()
    expect(r?.texto.startsWith('por qué falla el build?')).toBe(true)
    expect(r?.texto).toContain('.claude/toki/pegados/a.txt')
    expect(r?.texto).toContain('1502: ERROR: Cannot find module')
    expect(r?.texto).toContain('módulo 2999 de 3000')
    expect((r?.tokensDespues ?? 0) * 5 < (r?.tokensAntes ?? 0)).toBe(true)
    expect(recortarPegado('corto', 'x')).toBeUndefined()
    // Una sola línea gigante (JSON minificado) también se recorta.
    expect(recortarPegado(`{"a":"${'x'.repeat(80_000)}"}`, 'x')?.texto.length ?? 1e9).toBeLessThan(10_000)
  })

  test('con el motor: guarda el original y entra el recorte', async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 20_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const texto = log(3000)
    await mensaje($, 't0', texto)
    expect(m.preguntas[0]).toContain('Pegaste 3001 líneas')
    const entrado = m.entrados.at(-1) ?? ''
    expect(entrado.length < texto.length / 5).toBe(true)
    const [ruta, copia] = Object.entries(m.escritos).find(([r]) => r.includes('pegados/')) ?? []
    expect(copia).toBe(texto)
    expect(ruta?.endsWith(entrado.match(/\.claude\/toki\/pegados\/\S+\.txt/)?.[0] ?? '???')).toBe(true)
  })

  test('"Enviar completo" lo deja intacto; dos veces y se calla', async ($, on) => {
    mock.clock(on, { now: 50 * H })
    const m = mundo(on, { tokens: 20_000, respuesta: ls => ls.find(l => l === 'Enviar completo') ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    for (const t of ['t0', 't1', 't2']) await mensaje($, t, log(3000))
    expect(m.entrados.every(e => e === log(3000))).toBe(true)
    expect(m.preguntas.filter(p => p.includes('Pegaste')).length).toBe(2)
  })
})
