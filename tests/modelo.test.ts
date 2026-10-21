import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  costoMensaje,
  decidirInterfaz,
  etiquetas,
  familiaDe,
  hermano,
  leerModo,
  limpiarPrompt,
  modeloSubagente,
  nivelHeuristico,
  proponer,
  textosRuta,
} from '../hooks/modelo'

// Qué modelo y esfuerzo merece cada mensaje: primero lo puro, después con el motor simulado.

describe('leer el mensaje', () => {
  test('limpia código, URLs, rutas y etiquetas antes de leer la tarea', () => {
    const t = limpiarPrompt('mira esto ```\nconst a = 1\n``` en https://x.com/a y /src/app/main.ts <task-notification>x</task-notification> `foo()`')
    expect(t).toBe('mira esto en y x')
  })

  test('pedir pensarlo a fondo es profundo', () => {
    expect(nivelHeuristico('ultrathink: por qué se cae el login').nivel).toBe('profundo')
    expect(nivelHeuristico('Piensa bien todos los escenarios antes de tocar la base de datos').nivel).toBe('profundo')
    expect(nivelHeuristico('think hard about the cache invalidation').nivel).toBe('profundo')
  })

  test('diseño, depuración o varios archivos es complejo', () => {
    const l = nivelHeuristico('Diseña la arquitectura de la sincronización offline y refactoriza el módulo de pagos para que escale')
    expect(l.nivel).toBe('complejo')
    expect(l.seguro).toBe(true)
  })

  test('lo mecánico es simple', () => {
    expect(nivelHeuristico('renombra la variable foo a bar en utils').nivel).toBe('trivial')
    expect(nivelHeuristico('haz commit y push de esto').nivel).toBe('trivial')
    expect(nivelHeuristico('corre los tests').nivel).toBe('trivial')
  })

  test('un "sí, dale" sigue con el nivel de antes', () => {
    expect(nivelHeuristico('sí, dale', 'complejo')).toEqual({ nivel: 'complejo', seguro: true, motivo: 'seguimiento' })
    expect(nivelHeuristico('Implementalo', 'profundo').nivel).toBe('profundo')
    expect(nivelHeuristico('ok').nivel).toBe('normal')
  })

  test('si lo anterior no funcionó, sube un nivel', () => {
    expect(nivelHeuristico('sigue fallando el build con el mismo error', 'normal')).toEqual({ nivel: 'complejo', seguro: true, motivo: 'atascado' })
    expect(nivelHeuristico('still broken after your change', 'complejo').nivel).toBe('profundo')
  })

  test('una tarea corriente es normal', () => {
    expect(nivelHeuristico('agrega un botón de exportar a CSV en la tabla de pacientes').nivel).toBe('normal')
  })
})

describe('modelos y costos', () => {
  test('familia y hermano por id completo', () => {
    expect(familiaDe('claude-opus-5-5')).toBe('opus')
    expect(familiaDe('claude-sonnet-5-5[1m]')).toBe('sonnet')
    expect(familiaDe('claude-fable-5-1')).toBe('fable')
    expect(familiaDe('gpt-5')).toBe(undefined)
    expect(hermano('claude-opus-5-5', 'sonnet')).toBe('claude-sonnet-5-5')
    expect(hermano('claude-opus-5-5[1m]', 'sonnet')).toBe('claude-sonnet-5-5')
    expect(hermano('claude-fable-5-1', 'sonnet')).toBe(undefined)
  })

  test('cambiar de modelo cuesta reescribir el contexto una vez', () => {
    const sin = costoMensaje({ familia: 'opus', esfuerzo: 'medium', contexto: 100_000, pedidos: 4, cambiaModelo: false, ttl1h: true })
    const con = costoMensaje({ familia: 'opus', esfuerzo: 'medium', contexto: 100_000, pedidos: 4, cambiaModelo: true, ttl1h: true })
    expect(con.reescribe).toBe(100_000)
    // 100k × $8/M (escritura de 1 h en Opus).
    expect(Math.round((con.usd - sin.usd) * 100) / 100).toBe(0.8)
  })

  test('mensaje profundo: Opus al máximo, cuesta más que como va', () => {
    const p = proponer({ nivel: 'profundo', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 40_000, ttl1h: true, permitirModelo: true })
    expect(p.recomendada).toMatchObject({ tipo: 'calidad', modelo: 'claude-opus-5-5', esfuerzo: 'max' })
    expect(p.recomendada.usd).toBeGreaterThan(p.actual.usd)
    expect(decidirInterfaz('preguntar', p, false)).toBe('preguntar')
    expect(decidirInterfaz('automatico', p, false)).toBe('auto')
    expect(decidirInterfaz('no', p, false)).toBe('nada')
  })

  test('mensaje simple con contexto chico: Sonnet, porque lo que ahorra paga el cambio', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 30_000, ttl1h: true, permitirModelo: true })
    expect(p.recomendada).toMatchObject({ tipo: 'ahorro', modelo: 'claude-sonnet-5-5', esfuerzo: 'low', reescribe: 30_000 })
    // Ahorra por mensaje, pero reescribe 30k: en modo "preguntar" pregunta.
    expect(p.recomendada.usd).toBeLessThan(p.actual.usd)
    expect(decidirInterfaz('preguntar', p, false)).toBe('preguntar')
  })

  test('con el caché frío (sesión nueva o recién compactado) el cambio no reescribe nada: se aplica solo', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 30_000, ttl1h: true, permitirModelo: true, cacheFrio: true })
    expect(p.recomendada).toMatchObject({ modelo: 'claude-sonnet-5-5', reescribe: 0, cambio: 0 })
    expect(decidirInterfaz('preguntar', p, false)).toBe('auto')
  })

  test('mensaje simple con contexto grande: no cambia de modelo, solo baja el esfuerzo', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 400_000, ttl1h: true, permitirModelo: true })
    expect(p.recomendada).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'low', reescribe: 0 })
    // Ahorra sin tocar el caché: se aplica solo y avisa.
    expect(decidirInterfaz('preguntar', p, false)).toBe('auto')
    expect(decidirInterfaz('siempre', p, false)).toBe('preguntar')
  })

  test('con Fable u otro modelo solo mueve el esfuerzo', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-fable-5-1', esfuerzo: 'high', contexto: 20_000, ttl1h: true, permitirModelo: true, cacheFrio: true })
    for (const o of p.opciones) expect(o.modelo).toBe('claude-fable-5-1')
  })

  test('si ya va como se recomienda, no hay nada que hacer', () => {
    const p = proponer({ nivel: 'normal', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 50_000, ttl1h: true, permitirModelo: true })
    expect(p.recomendada).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'medium' })
    expect(decidirInterfaz('siempre', p, false)).toBe('nada')
  })

  test('callado: solo lo que ahorra sin tocar el caché', () => {
    const caro = proponer({ nivel: 'profundo', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 40_000, ttl1h: true, permitirModelo: true })
    expect(decidirInterfaz('preguntar', caro, true)).toBe('nada')
    const barato = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 400_000, ttl1h: true, permitirModelo: true })
    expect(decidirInterfaz('preguntar', barato, true)).toBe('auto')
  })

  test('las etiquetas dicen el costo y la diferencia; la recomendada lleva ★', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 30_000, ttl1h: true, permitirModelo: true })
    const { opciones, dejar } = etiquetas(p, textosRuta.es)
    expect(opciones.length).toBeGreaterThanOrEqual(2)
    expect(opciones.length).toBeLessThanOrEqual(3)
    const rec = opciones.find(o => o.opcion === p.recomendada)
    expect(rec?.etiqueta).toContain('Sonnet · bajo — ahorro ★')
    expect(rec?.etiqueta).toContain('cambiar reescribe 30k de caché')
    expect(rec?.etiqueta).toMatch(/−\d+%/)
    expect(dejar).toMatch(/^Dejar como está: Opus · medio · ≈\$/)
  })

  test('modos', () => {
    expect(leerModo(undefined)).toBe('preguntar')
    expect(leerModo('automático')).toBe('automatico')
    expect(leerModo('off')).toBe('no')
    expect(leerModo('siempre')).toBe('siempre')
  })

  test('subagentes: los generales con encargos simples, en Sonnet; Explore y los complejos, como vienen', () => {
    expect(modeloSubagente('general-purpose', 'Lista los archivos de src y dime cuáles usan fetch', 'claude-opus-5-5')).toBe('claude-sonnet-5-5')
    expect(modeloSubagente('general-purpose', 'Diseña la arquitectura del módulo de pagos y compara tres opciones de seguridad', 'claude-opus-5-5')).toBe(undefined)
    expect(modeloSubagente('Explore', 'busca dónde se define X', 'claude-opus-5-5')).toBe(undefined)
    expect(modeloSubagente('general-purpose', 'lista los archivos', 'claude-sonnet-5-5')).toBe(undefined)
  })
})

// ---------- Con el motor ----------

type Visto = { turnId: string; model: string; effort?: string }

function mundo(on: On, opciones: { respondeCon?: string; preguntas?: string[]; respuesta?: (etiquetas: string[]) => string } = {}): { vistos: Visto[]; toasts: string[] } {
  const vistos: Visto[] = []
  const toasts: string[] = []
  mock.store(on)
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('fs.read', () => ({ deny: 'no existe' }))
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
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
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 30_000, window: 200_000, percent: 15 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('turn.step', async function* ($, e) {
    vistos.push({ turnId: e.turnId, model: e.model, effort: typeof e.effort === 'string' ? e.effort : undefined })
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: 29_000, cache_creation_input_tokens: 998, model: opciones.respondeCon ?? e.model },
    }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    opciones.preguntas?.push(q.question)
    const elegida = opciones.respuesta?.(q.options.map(o => o.label)) ?? q.options[0]?.label ?? ''
    return { result: { questions: [], answers: { [q.question]: elegida } } } as never
  })
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  return { vistos, toasts }
}

type Motor = Parameters<TestBody>[0]

async function mensaje($: Motor, turnId: string, texto: string, pedidos = 2): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  for (let i = 0; i < pedidos; i++) {
    const stream = $.turn.step({ turnId, index: i, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 + i })
    for await (const _ of stream) {
      // Sin trozos.
    }
    await stream.result
  }
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })
}

describe('modelo y esfuerzo con el motor', () => {
  test('automático: lo profundo va con esfuerzo máximo; lo simple pasa a Sonnet bajo y lo avisa', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Para calibrar el esfuerzo de la sesión: un primer mensaje normal que no cambia nada.
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    expect(vistos[0]).toEqual({ turnId: 't0', model: 'claude-opus-5-5', effort: 'medium' })

    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline y analiza todos los escenarios de conflicto')
    expect(vistos.filter(v => v.turnId === 't1')).toEqual([
      { turnId: 't1', model: 'claude-opus-5-5', effort: 'max' },
      { turnId: 't1', model: 'claude-opus-5-5', effort: 'max' },
    ])

    await mensaje($, 't2', 'renombra la variable foo a bar en utils')
    expect(vistos.filter(v => v.turnId === 't2')).toEqual([
      { turnId: 't2', model: 'claude-sonnet-5-5', effort: 'low' },
      { turnId: 't2', model: 'claude-sonnet-5-5', effort: 'low' },
    ])
    const porQue = (await $.command.run({ command: 'toki-por-que', args: '' } as never)) as { text: string }
    expect(porQue.text).toContain('Modelo y esfuerzo: cambia solo y avisa')
    expect(porQue.text).toContain('Sonnet por Toki')
    expect(porQue.text).toContain('simple (tarea mecánica) → Sonnet · bajo')
  })

  test('si el modelo que Toki pide no responde, vuelve al tuyo y solo ajusta el esfuerzo', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos, toasts } = mundo(on, { respondeCon: 'claude-opus-5-5' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'renombra la variable foo a bar en utils')
    expect(vistos.filter(v => v.turnId === 't1').map(v => v.model)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5'])
    expect(toasts.some(t => t.includes('Sonnet no respondió'))).toBe(true)
  })

  test('preguntar: cuando cuesta más muestra las opciones con su costo, y aplica la que eliges', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const preguntas: string[] = []
    let etiquetasVistas: string[] = []
    const { vistos } = mundo(on, {
      preguntas,
      respuesta: ls => {
        etiquetasVistas = ls
        return ls.find(l => l.includes('equilibrio')) ?? ls[0] ?? ''
      },
    })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline y analiza todos los escenarios de conflicto', 1)
    expect(preguntas[0]).toContain('para pensar a fondo')
    expect(etiquetasVistas.length).toBe(4)
    expect(etiquetasVistas[0]).toContain('mejor calidad ★')
    expect(etiquetasVistas[3]).toMatch(/^Dejar como está/)
    expect(vistos.find(v => v.turnId === 't1')).toEqual({ turnId: 't1', model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test('preguntar: "dejar como está" tres veces y Toki se calla por la sesión', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const preguntas: string[] = []
    const { vistos, toasts } = mundo(on, { preguntas, respuesta: ls => ls[ls.length - 1] ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline', 1)
    await mensaje($, 't2', 'piensa a fondo cómo migrar la base de datos sin downtime', 1)
    await mensaje($, 't3', 'think hard about the cache invalidation strategy', 1)
    // El primero preguntó; "dejar como está" quedó recordado para ese nivel, así que no vuelve a preguntar por lo mismo.
    expect(preguntas.length).toBe(1)
    for (const v of vistos) expect(v.effort).toBe('medium')
    expect(toasts.some(t => t.includes('ya no preguntará'))).toBe(false)
  })

  test('sin nadie que responda (claude -p) no pregunta: solo aplica lo que ahorra sin tocar el caché', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const preguntas: string[] = []
    const { vistos } = mundo(on, { preguntas })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline', 1)
    expect(preguntas.length).toBe(0)
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('medium')
  })

  test('/toki-modelo no apaga todo; /toki-modelo automatico lo vuelve a prender', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = (await $.command.run({ command: 'toki-modelo', args: 'no' } as never)) as { text: string }
    expect(r.text).toContain('apagado')
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline', 1)
    expect(vistos[0]?.effort).toBe('medium')
    await $.command.run({ command: 'toki-modelo', args: 'automatico' } as never)
    await mensaje($, 't2', 'ultrathink: diseña la arquitectura de la sincronización offline', 1)
    expect(vistos[1]?.effort).toBe('max')
  })

  test('subagente general con un encargo simple: Sonnet, y lo avisa una vez', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { toasts } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = (await $.agent.spawn({ prompt: 'Lista los archivos de src y dime cuáles usan fetch', subagentType: 'general-purpose', parentModel: 'claude-opus-5-5' } as never)) as { model: string }
    expect(r.model).toBe('claude-sonnet-5-5')
    const r2 = (await $.agent.spawn({ prompt: 'Lista los archivos de tests', subagentType: 'general-purpose', parentModel: 'claude-opus-5-5' } as never)) as { model: string }
    expect(r2.model).toBe('claude-sonnet-5-5')
    expect(toasts.filter(t => t.includes('subagentes')).length).toBe(1)
    const explore = (await $.agent.spawn({ prompt: 'busca X', subagentType: 'Explore', parentModel: 'claude-opus-5-5' } as never)) as { model: string }
    expect(explore.model).toBe('claude-opus-5-5')
  })
})
