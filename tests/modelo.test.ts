import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  ahorroSinCache,
  costoMedido,
  costoMensaje,
  costoSinToki,
  daIgual,
  decidirInterfaz,
  deltaRuteo,
  etiquetas,
  familiaDe,
  hermano,
  leerModo,
  limpiarPrompt,
  modeloSubagente,
  nivelHeuristico,
  proponer,
  terminaEnPregunta,
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

  test('una consulta de flujo o de "qué recomiendas" también es compleja', () => {
    const l = nivelHeuristico('Cuál es el flujo que tú recomiendas en Odoo para crear un empleado? Supongo que primero el usuario y luego el empleado desde el contacto, no es así? O cuál es el flujo para automatizar los archivados de usuarios, empleados y contactos?')
    expect(l.nivel).toBe('complejo')
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

  test('un "gracias" cierra; un "ok" cierra si Claude no preguntó nada, y si preguntó es un sí', () => {
    for (const t of ['Perfecto, gracias.', 'gracias', 'Muchas gracias!', 'no, gracias', 'thanks', 'great, thanks!', 'listo']) {
      expect(nivelHeuristico(t, 'profundo')).toEqual({ nivel: 'trivial', seguro: true, motivo: 'cierre' })
    }
    // Claude preguntó "¿lo implemento?": el "ok" es un sí, con el nivel de la tarea.
    expect(nivelHeuristico('ok', 'complejo', true)).toEqual({ nivel: 'complejo', seguro: true, motivo: 'seguimiento' })
    expect(nivelHeuristico('Perfecto, gracias.', 'profundo', true).motivo).toBe('seguimiento')
    // "Gracias" solo nunca pide trabajo, aunque Claude haya preguntado.
    expect(nivelHeuristico('gracias', 'profundo', true).motivo).toBe('cierre')
    // "Sí, gracias" y "dale" siguen con la tarea.
    expect(nivelHeuristico('sí, gracias', 'complejo')).toEqual({ nivel: 'complejo', seguro: true, motivo: 'seguimiento' })
    expect(nivelHeuristico('dale', 'complejo').nivel).toBe('complejo')
    // Un "gracias" con un pedido detrás es el pedido.
    expect(nivelHeuristico('Perfecto, gracias. Ahora renombra la variable foo a bar en utils', 'profundo').nivel).toBe('trivial')
    expect(nivelHeuristico('Perfecto, gracias. Ahora renombra la variable foo a bar en utils', 'profundo').motivo).toBe('tarea-mecanica')
  })

  test('sabe si Claude terminó preguntando', () => {
    expect(terminaEnPregunta('Listo, cambié el nombre. ¿Quieres que también actualice los tests?')).toBe(true)
    expect(terminaEnPregunta('¿Cuál prefieres?\n\n1. Opción A\n2. Opción B')).toBe(true)
    expect(terminaEnPregunta('Want me to run the tests?')).toBe(true)
    expect(terminaEnPregunta('Ya está corregido. No ejecuté los tests.')).toBe(false)
    // Un ? dentro de código o de un enlace no es una pregunta.
    expect(terminaEnPregunta('Mira https://x.com/a?b=1 y `a ?? b`.\n```ts\nconst c = d ?? e\n```\nListo.')).toBe(false)
  })

  test('si lo anterior no funcionó, sube un nivel', () => {
    expect(nivelHeuristico('sigue fallando el build con el mismo error', 'normal')).toEqual({ nivel: 'complejo', seguro: true, motivo: 'atascado' })
    expect(nivelHeuristico('still broken after your change', 'complejo').nivel).toBe('profundo')
  })

  test('lee bien las palabras con tilde y ñ', () => {
    // «no funcionó» es estar atascado, no un mensaje corto que se pueda bajar.
    for (const t of ['no sirvió', 'no funcionó tu cambio', 'no arregló nada']) expect(nivelHeuristico(t, 'normal').motivo).toBe('atascado')
    // «área» no es «REA»: no pide pensar a fondo.
    expect(nivelHeuristico('cambia el color del área de texto').nivel).toBe('trivial')
    expect(nivelHeuristico('REA: mercado de plugins de ahorro de tokens').nivel).toBe('profundo')
    expect(nivelHeuristico('hazme el diseño de la pantalla de inicio').motivo).toBe('tarea-compleja')
    // Texto descompuesto (NFD), como el que viene de nombres de archivo en macOS.
    expect(nivelHeuristico('no funcionó'.normalize('NFD'), 'normal').motivo).toBe('atascado')
    expect(limpiarPrompt('mira /docs/diseño-arquitectura.md y /src/app/módulo.ts')).toBe('mira y')
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

  test('mensaje simple con contexto grande: no cambia de modelo, solo baja el esfuerzo (de medio a bajo da igual)', () => {
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'max', contexto: 400_000, ttl1h: true, permitirModelo: true })
    expect(p.recomendada).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'low', reescribe: 0 })
    // Ahorra sin tocar el caché: se aplica solo y avisa.
    expect(decidirInterfaz('preguntar', p, false)).toBe('auto')
    expect(decidirInterfaz('siempre', p, false)).toBe('preguntar')
    // Desde medio, lo simple cuesta lo mismo en bajo: no hay nada que hacer, ni siquiera en "siempre".
    const medio = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 400_000, ttl1h: true, permitirModelo: true })
    expect(medio.recomendada).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'low' })
    expect(decidirInterfaz('preguntar', medio, false)).toBe('nada')
    expect(decidirInterfaz('siempre', medio, false)).toBe('nada')
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

  test('en lo simple, bajo y medio responden lo mismo (medido): bajar de medio a bajo da igual', () => {
    const simple = (esfuerzo: 'low' | 'medium' | 'high') => costoMensaje({ familia: 'opus', esfuerzo, contexto: 35_000, pedidos: 2, cambiaModelo: false, ttl1h: true, nivel: 'trivial' }).usd
    expect(simple('low')).toBe(simple('medium'))
    expect(simple('high')).toBeGreaterThan(simple('medium'))
    // Fuera de lo simple, la tabla de siempre.
    const normal = costoMensaje({ familia: 'opus', esfuerzo: 'medium', contexto: 35_000, pedidos: 2, cambiaModelo: false, ttl1h: true, nivel: 'normal' })
    expect(normal.usd).toBe(costoMensaje({ familia: 'opus', esfuerzo: 'medium', contexto: 35_000, pedidos: 2, cambiaModelo: false, ttl1h: true }).usd)
    const p = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 35_000, ttl1h: true, permitirModelo: false })
    const bajo = p.opciones.find(o => o.esfuerzo === 'low')
    expect(bajo !== undefined && daIgual(bajo, p.actual)).toBe(true)
    // Otro modelo nunca da igual: cambiar reescribe el caché.
    expect(daIgual({ modelo: 'claude-sonnet-5-5', usd: p.actual.usd }, p.actual)).toBe(false)
    // En lo normal, de medio a bajo sí ahorra.
    const n = proponer({ nivel: 'normal', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 35_000, ttl1h: true, permitirModelo: false })
    const ahorro = n.opciones.find(o => o.tipo === 'ahorro')
    expect(ahorro).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'low' })
    expect(ahorro !== undefined && daIgual(ahorro, n.actual)).toBe(false)
  })

  test('lo medido: cada pedido a precio de API, con las cifras que devolvió el modelo', () => {
    // Dos pedidos del mundo de prueba en Opus: 4 de entrada, 58k leídos del caché, 1996 escritos, 400 de salida.
    const u = { entrada: 4, leido: 58_000, escrito: 1_996, salida: 400 }
    expect(Math.abs(costoMedido('opus', u, true) - 0.035584) < 1e-9).toBe(true)
    // Con el caché de 5 min, escribir cuesta menos.
    expect(Math.abs(costoMedido('opus', u, false) - 0.029596) < 1e-9).toBe(true)
    expect(costoMedido('sonnet', u, true)).toBeLessThan(costoMedido('opus', u, true))
  })

  test('callado: solo lo que ahorra sin tocar el caché', () => {
    const caro = proponer({ nivel: 'profundo', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 40_000, ttl1h: true, permitirModelo: true })
    expect(decidirInterfaz('preguntar', caro, true)).toBe('nada')
    const barato = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'max', contexto: 400_000, ttl1h: true, permitirModelo: true })
    expect(decidirInterfaz('preguntar', barato, true)).toBe('auto')
    // Lo recomendado pasa a Sonnet y reescribe el caché: callado, al menos baja el esfuerzo en Opus.
    const simple = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'high', contexto: 30_000, ttl1h: true, permitirModelo: true })
    expect(simple.recomendada).toMatchObject({ modelo: 'claude-sonnet-5-5', reescribe: 30_000 })
    expect(decidirInterfaz('preguntar', simple, true)).toBe('nada')
    // Medio y bajo cuestan lo mismo en lo simple: a igual costo, el esfuerzo más bajo.
    expect(ahorroSinCache(simple)).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'low', reescribe: 0 })
    // Desde medio no hay nada que bajar que ahorre.
    const desdeMedio = proponer({ nivel: 'trivial', modelo: 'claude-opus-5-5', esfuerzo: 'medium', contexto: 30_000, ttl1h: true, permitirModelo: true })
    expect(desdeMedio.recomendada.modelo).toBe('claude-sonnet-5-5')
    expect(ahorroSinCache(desdeMedio)).toBe(undefined)
    // Lo que cuesta más, o ya va en tu modelo, no tiene versión sin caché.
    expect(ahorroSinCache(caro)).toBe(undefined)
    expect(ahorroSinCache(barato)).toBe(undefined)
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

type UsoFalso = Partial<{ input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }>

function mundo(
  on: On,
  opciones: {
    respondeCon?: string
    preguntas?: string[]
    respuesta?: (etiquetas: string[]) => string
    archivos?: Map<string, string>
    /** Las cifras de un pedido, si no son las de siempre (`model`: el que respondió). */
    uso?: (e: { turnId: string; index: number; model: string; agentId?: string }) => UsoFalso
    /** El store, para leerlo desde la prueba. */
    guardado?: Map<string, unknown>
  } = {},
): { vistos: Visto[]; toasts: string[] } {
  const vistos: Visto[] = []
  const toasts: string[] = []
  // Sin `archivos`, la carpeta del proyecto está vacía y lo que se escribe se pierde.
  // Las rutas llegan absolutas: `.claude/toki/…` se guarda con esa clave corta.
  const archivos = opciones.archivos
  const clave = (ruta: string) => (ruta.includes('/.claude/toki/') ? ruta.slice(ruta.indexOf('/.claude/toki/') + 1) : ruta)
  const guardado = opciones.guardado
  if (guardado === undefined) mock.store(on)
  else {
    // Como el de verdad: los valores pasan por JSON.
    on('store.get', ($, e) => ({ value: guardado.get(e.key) }))
    on('store.set', ($, e) => {
      guardado.set(e.key, e.value === undefined ? undefined : JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('store.delete', ($, e) => {
      guardado.delete(e.key)
      return { value: undefined }
    })
    on('store.keys', () => ({ value: [...guardado.keys()] }))
  }
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', ($, e) => ({ value: archivos?.has(clave(e.path)) ?? false }))
  on('fs.write', ($, e) => {
    archivos?.set(clave(e.path), e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const t = archivos?.get(clave(e.path))
    return t === undefined ? { deny: 'no existe' } : { value: t }
  })
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
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('turn.step', async function* ($, e) {
    vistos.push({ turnId: e.turnId, model: e.model, effort: typeof e.effort === 'string' ? e.effort : undefined })
    const model = opciones.respondeCon ?? e.model
    const otro = opciones.uso?.({ turnId: e.turnId, index: e.index, model, agentId: e.agentId }) ?? {}
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: 29_000, cache_creation_input_tokens: 998, ...otro, model },
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
  // /model del motor: aquí no cambia nada (eliges el mismo modelo que ya tenías).
  on('command.run', { command: 'model' }, () => ({ text: '' }) as never)
  return { vistos, toasts }
}

type Motor = Parameters<TestBody>[0]

async function mensaje($: Motor, turnId: string, texto: string, pedidos = 2, respuesta = 'Listo.', esfuerzo = 'medium'): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await correr($, turnId, texto, pedidos, respuesta, esfuerzo)
}

/** El turno de un mensaje ya enviado: sus pedidos al modelo (con el esfuerzo de la sesión) y el final. */
async function correr($: Motor, turnId: string, texto: string, pedidos = 2, respuesta = 'Listo.', esfuerzo = 'medium'): Promise<void> {
  await $.turn.start({ text: texto, turnId })
  for (let i = 0; i < pedidos; i++) {
    const stream = $.turn.step({ turnId, index: i, model: 'claude-opus-5-5', effort: esfuerzo, messageCount: 10 + i } as never)
    for await (const _ of stream) {
      // Sin trozos.
    }
    await stream.result
  }
  await $.turn.complete({ answer: respuesta, durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })
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
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('Último mensaje: simple (tarea mecánica) · Opus · medio → Sonnet · bajo')
    expect(estado.text).toContain('· aplicado')
    // Medido pedido por pedido: t2 en Sonnet ahorró; t1 a máximo costó de más (responde más largo).
    expect(estado.text).toContain('Ahorro por el modelo y el esfuerzo de cada mensaje: ~$0.01 medido a precio de API · costó de más: <$0.01 (más esfuerzo o reescribir el caché)')
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
    // La sesión va en alto: desde ahí, bajar el esfuerzo en lo simple sí ahorra.
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1, 'Listo.', 'high')
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline', 1, 'Listo.', 'high')
    expect(preguntas.length).toBe(0)
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('high')
    // Un "gracias" después de pensar a fondo no hereda lo profundo: es un cierre.
    await mensaje($, 't2', 'Perfecto, gracias.', 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't2')).toEqual({ turnId: 't2', model: 'claude-opus-5-5', effort: 'low' })
    // Lo simple pasaría a Sonnet, pero eso reescribe el caché: sin preguntar, solo baja el esfuerzo.
    await mensaje($, 't3', 'renombra la variable foo a bar en utils', 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't3')).toEqual({ turnId: 't3', model: 'claude-opus-5-5', effort: 'low' })
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('Último mensaje: simple (tarea mecánica) · Opus · alto → Opus · bajo')
    expect(estado.text).toContain('· aplicado')
    expect(preguntas.length).toBe(0)
  })

  test('un "gracias" no es una tarea: no hereda lo profundo ni cambia de modelo, y el "dale" de después sigue con la tarea', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'ultrathink: diseña la arquitectura de la sincronización offline', 1)
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('max')
    // En automático, lo simple pasaría a Sonnet; un cierre no, porque no se sabe qué viene.
    // Y de medio a bajo cuesta lo mismo: se queda como va.
    await mensaje($, 't2', 'Perfecto, gracias.', 1)
    expect(vistos.find(v => v.turnId === 't2')).toEqual({ turnId: 't2', model: 'claude-opus-5-5', effort: 'medium' })
    await mensaje($, 't3', 'dale', 1)
    expect(vistos.find(v => v.turnId === 't3')).toEqual({ turnId: 't3', model: 'claude-opus-5-5', effort: 'max' })
    // Si Claude preguntó algo, el "ok" es un sí: sigue la tarea con su nivel.
    await mensaje($, 't4', 'piensa a fondo cómo migrar la base de datos sin downtime', 1, 'Este es el plan, en cinco pasos. ¿Lo implemento?')
    await mensaje($, 't5', 'ok', 1)
    expect(vistos.find(v => v.turnId === 't5')?.effort).toBe('max')
  })

  test('lo que casi no cambia el costo no se toca ni se cuenta como ahorro', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const preguntas: string[] = []
    const { vistos, toasts } = mundo(on, { preguntas })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes', 1)
    await mensaje($, 't1', 'Perfecto, gracias.', 1)
    expect(vistos.find(v => v.turnId === 't1')).toEqual({ turnId: 't1', model: 'claude-opus-5-5', effort: 'medium' })
    expect(preguntas.length).toBe(0)
    expect(toasts.some(t => t.includes('Opus · bajo'))).toBe(false)
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('· sin cambio (casi no cambia el costo)')
    expect(estado.text.includes('Ahorro por el modelo')).toBe(false)
    const en = textosRuta.en.decision['da-igual']
    expect(en).toBe('no change (it barely changes the cost)')
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

describe('ahorro por modelo', () => {
  test('bajar ahorra, subir cuesta de más, y reescribir el caché se descuenta', async () => {
    expect(Math.abs(deltaRuteo({ usd: 0.02, cambio: 0 }, { usd: 0.08 }) - (0.06)) < 1e-9).toBe(true)
    expect(Math.abs(deltaRuteo({ usd: 0.1, cambio: 0 }, { usd: 0.08 }) - (-0.02)) < 1e-9).toBe(true)
    expect(Math.abs(deltaRuteo({ usd: 0.02, cambio: 0.07 }, { usd: 0.08 }) - (-0.01)) < 1e-9).toBe(true)
    const x = textosRuta.es
    expect(x.balance('$0.42', undefined, false)).toContain('~$0.42')
    expect(x.balance('$0.42', '$0.10', true)).toContain('límite')
    expect(x.balance('$0.42', '$0.10', true)).toContain('~$0.10')
  })
})

// ---------- Solo Sonnet hasta que haga falta ----------

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const BOTON = 'agrega un botón de exportar a CSV en la tabla de pacientes'
const COLUMNA = 'agrega una columna con la fecha de nacimiento en la tabla de pacientes'
const FILTRO = 'agrega un filtro por fecha en la tabla de pacientes'
const PROFUNDO = 'ultrathink: diseña la arquitectura de la sincronización offline y analiza todos los escenarios de conflicto'

describe('solo Sonnet hasta que haga falta', () => {
  const con = { ttl1h: true, permitirModelo: true, sonnetPrimero: true } as const

  test('lo normal y lo complejo van en Sonnet; con el caché frío el cambio sale gratis y se aplica solo', () => {
    const normal = proponer({ ...con, nivel: 'normal', modelo: OPUS, esfuerzo: 'medium', contexto: 35_000, cacheFrio: true })
    expect(normal.recomendada).toMatchObject({ modelo: SONNET, esfuerzo: 'medium', reescribe: 0 })
    expect(decidirInterfaz('preguntar', normal, false, SONNET)).toBe('auto')
    const complejo = proponer({ ...con, nivel: 'complejo', modelo: OPUS, esfuerzo: 'medium', contexto: 35_000, cacheFrio: true })
    expect(complejo.recomendada).toMatchObject({ modelo: SONNET, esfuerzo: 'high' })
    // Sin Sonnet primero, lo complejo va en Opus.
    const sin = proponer({ ttl1h: true, permitirModelo: true, nivel: 'complejo', modelo: OPUS, esfuerzo: 'medium', contexto: 35_000, cacheFrio: true })
    expect(sin.recomendada.modelo).toBe(OPUS)
  })

  test('pensar a fondo, o lo que no funcionó, sube a Opus; subir cuesta más y pregunta', () => {
    const profundo = proponer({ ...con, nivel: 'profundo', modelo: SONNET, esfuerzo: 'medium', contexto: 50_000 })
    expect(profundo.recomendada).toMatchObject({ modelo: OPUS, esfuerzo: 'max' })
    expect(decidirInterfaz('preguntar', profundo, false, SONNET)).toBe('preguntar')
    expect(decidirInterfaz('automatico', profundo, false, SONNET)).toBe('auto')
    const atascado = proponer({ ...con, nivel: 'complejo', modelo: SONNET, esfuerzo: 'medium', contexto: 50_000, atascado: true })
    expect(atascado.recomendada).toMatchObject({ modelo: OPUS, esfuerzo: 'high' })
    // Lo complejo que no está atascado se queda en Sonnet.
    const sigue = proponer({ ...con, nivel: 'complejo', modelo: SONNET, esfuerzo: 'medium', contexto: 50_000 })
    expect(sigue.recomendada).toMatchObject({ modelo: SONNET, esfuerzo: 'high' })
  })

  test('volver a Sonnet con el caché caliente: si se paga, se aplica solo aunque reescriba', () => {
    const p = proponer({ ...con, nivel: 'normal', modelo: OPUS, esfuerzo: 'medium', contexto: 60_000 })
    expect(p.recomendada).toMatchObject({ modelo: SONNET, esfuerzo: 'medium', reescribe: 60_000 })
    expect(decidirInterfaz('preguntar', p, false, SONNET)).toBe('auto')
    // Sin Sonnet primero, reescribir 60k pregunta; en "siempre" pregunta igual.
    expect(decidirInterfaz('preguntar', p, false)).toBe('preguntar')
    expect(decidirInterfaz('siempre', p, false, SONNET)).toBe('preguntar')
  })

  test('con un caché grande y caliente espera: lo simple solo baja el esfuerzo; lo normal se paga en 8 mensajes', () => {
    const simple = proponer({ ...con, nivel: 'trivial', modelo: OPUS, esfuerzo: 'medium', contexto: 150_000 })
    expect(simple.recomendada).toMatchObject({ modelo: OPUS, esfuerzo: 'low', reescribe: 0 })
    const normal = proponer({ ...con, nivel: 'normal', modelo: OPUS, esfuerzo: 'medium', contexto: 150_000 })
    expect(normal.recomendada.modelo).toBe(SONNET)
    // Sin Sonnet primero (4 mensajes) a 150k no se paga.
    expect(proponer({ ...con, sonnetPrimero: false, nivel: 'trivial', modelo: OPUS, esfuerzo: 'medium', contexto: 150_000 }).recomendada.modelo).toBe(OPUS)
  })

  test('con Fable no hay Sonnet al que pasar: solo el esfuerzo', () => {
    const p = proponer({ ...con, nivel: 'normal', modelo: 'claude-fable-5-1', esfuerzo: 'high', contexto: 35_000, cacheFrio: true })
    for (const o of p.opciones) expect(o.modelo).toBe('claude-fable-5-1')
  })

  test('subagentes generales: también lo complejo va en Sonnet; pensar a fondo y lo atascado, como vienen', () => {
    const complejo = 'Diseña la arquitectura del módulo de pagos y compara tres opciones de seguridad'
    expect(modeloSubagente('general-purpose', complejo, OPUS)).toBe(undefined)
    expect(modeloSubagente('general-purpose', complejo, OPUS, true)).toBe(SONNET)
    expect(modeloSubagente('general-purpose', PROFUNDO, OPUS, true)).toBe(undefined)
    expect(modeloSubagente('general-purpose', 'sigue fallando el build con el mismo error', OPUS, true)).toBe(undefined)
    expect(modeloSubagente('Explore', 'busca dónde se define X', OPUS, true)).toBe(undefined)
  })

  test('sin Toki: tu modelo con el esfuerzo de la sesión, sin reescribir nada', () => {
    const sin = costoSinToki({ nivel: 'normal', modelo: OPUS, esfuerzo: 'medium', contexto: 50_000, ttl1h: true })
    const directo = costoMensaje({ familia: 'opus', esfuerzo: 'medium', contexto: 50_000, pedidos: 4, cambiaModelo: false, ttl1h: true })
    expect(Math.abs(sin.usd - directo.usd) < 1e-12).toBe(true)
    expect(costoSinToki({ nivel: 'normal', modelo: SONNET, esfuerzo: 'medium', contexto: 50_000, ttl1h: true }).usd).toBeLessThan(sin.usd)
  })

  test('preguntar: va en Sonnet, cuenta cada mensaje, pregunta antes de subir a Opus y vuelve solo', { options: { sonnetPrimero: true } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const preguntas: string[] = []
    const archivos = new Map<string, string>()
    const { vistos } = mundo(on, { preguntas, archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Lo medido de cada mensaje: lo que costó y lo que habría costado sin Toki.
    const medidos = async (): Promise<{ real: number; sin: number }[]> => {
      await reloj.settle()
      const diag = archivos.get('.claude/toki/diagnostico.txt') ?? ''
      return [...diag.matchAll(/ uso: .* \$(\d+\.\d+) · sin Toki \$(\d+\.\d+)/g)].map(m => ({ real: Number(m[1]), sin: Number(m[2]) }))
    }
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')).toEqual({ turnId: 't0', model: SONNET, effort: 'medium' })
    // Los mismos tokens en Sonnet cuestan la mitad que en Opus.
    expect(await medidos()).toEqual([{ real: 0.0074, sin: 0.0148 }])
    await mensaje($, 't1', COLUMNA, 1)
    expect(vistos.find(v => v.turnId === 't1')?.model).toBe(SONNET)
    // El que sigue en Sonnet también cuenta, aunque Toki no haya cambiado nada en él.
    expect((await medidos())[1]).toEqual({ real: 0.0074, sin: 0.0148 })
    const balance = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(balance).toContain('Ahorro por el modelo y el esfuerzo de cada mensaje: ~$0.01 medido a precio de API\n')
    expect(preguntas.length).toBe(0)

    await mensaje($, 't2', PROFUNDO, 1)
    expect(preguntas.length).toBe(1)
    expect(vistos.find(v => v.turnId === 't2')).toEqual({ turnId: 't2', model: OPUS, effort: 'max' })

    await mensaje($, 't3', FILTRO, 1)
    expect(preguntas.length).toBe(1)
    expect(vistos.find(v => v.turnId === 't3')).toEqual({ turnId: 't3', model: SONNET, effort: 'medium' })

    const estado = (await $.command.run({ command: 'toki-sonnet', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('Solo Sonnet hasta que haga falta: activado')
    expect(estado.text).toContain('Esta sesión: 3 mensajes en Sonnet, 1 en Opus')
    const modelo = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(modelo.text).toContain('Solo Sonnet hasta que haga falta: activado')
    // La tarjeta semanal cuenta cada mensaje en el modelo que de verdad respondió.
    const semana = (await $.command.run({ command: 'toki-semana', args: '' } as never)) as { text: string }
    expect(semana.text).toContain('Mensajes por modelo: Sonnet 3 · Opus 1')
  })

  test('automático: si algo sigue fallando sube a Opus, y un "dale" sigue ahí', { options: { recomendarModelo: 'automatico', sonnetPrimero: true } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')?.model).toBe(SONNET)
    await mensaje($, 't1', 'sigue fallando el build con el mismo error', 1)
    expect(vistos.find(v => v.turnId === 't1')).toEqual({ turnId: 't1', model: OPUS, effort: 'high' })
    await mensaje($, 't2', 'sí, dale', 1)
    expect(vistos.find(v => v.turnId === 't2')).toEqual({ turnId: 't2', model: OPUS, effort: 'high' })
    await mensaje($, 't3', FILTRO, 1)
    expect(vistos.find(v => v.turnId === 't3')?.model).toBe(SONNET)
  })

  test('deshacer: vuelve a tu modelo y no lo repite solo para ese nivel', { options: { sonnetPrimero: true } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const nada = (await $.command.run({ command: 'toki-modelo', args: 'deshacer' } as never)) as { text: string }
    expect(nada.text).toContain('no hay ningún cambio')
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')?.model).toBe(SONNET)
    const r = (await $.command.run({ command: 'toki-modelo', args: 'deshacer' } as never)) as { text: string }
    expect(r.text).toContain('Toki: deshecho. Vuelves a Opus · medio')
    expect(r.text).toContain('cuando el mensaje sea normal')
    await mensaje($, 't1', COLUMNA, 1)
    expect(vistos.find(v => v.turnId === 't1')?.model).toBe(OPUS)
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('sin cambio (lo deshiciste antes)')
    // Otro nivel sí: lo simple pasa a Sonnet.
    await mensaje($, 't2', 'renombra la variable foo a bar en utils', 1)
    expect(vistos.find(v => v.turnId === 't2')).toEqual({ turnId: 't2', model: SONNET, effort: 'low' })
    const otra = (await $.command.run({ command: 'toki-modelo', args: 'undo' } as never)) as { text: string }
    expect(otra.text).toContain('cuando el mensaje sea simple')
    const ya = (await $.command.run({ command: 'toki-modelo', args: 'deshacer' } as never)) as { text: string }
    expect(ya.text).toContain('no hay ningún cambio')
  })

  test('el diagnóstico sigue entre sesiones: cada decisión, lo deshecho y las correcciones, sin tu texto', { options: { sonnetPrimero: true } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const DIAG = '.claude/toki/diagnostico.txt'
    const archivos = new Map([[DIAG, '2026-10-21T10:00:00.000Z inicio 0.16.1: de la sesión de ayer\n']])
    const { vistos } = mundo(on, { archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')?.model).toBe(SONNET)
    await $.command.run({ command: 'toki-modelo', args: 'deshacer' } as never)
    await mensaje($, 't1', 'no funcionó, sigue igual', 1)
    // Las escrituras van en fila: se espera a que terminen.
    await reloj.settle()
    const diag = archivos.get(DIAG) ?? ''
    expect(diag.startsWith('2026-10-21T10:00:00.000Z inicio 0.16.1: de la sesión de ayer\n')).toBe(true)
    expect(diag).toMatch(/Z inicio \d+\.\d+\.\d+: superficie=/)
    expect(diag).toMatch(/ruta: normal \(.+\) claude-opus-5-5\/medium → claude-sonnet-5-5\//)
    expect(diag).toMatch(/ruta deshecha: claude-sonnet-5-5\/\w+ → claude-opus-5-5\/medium \(normal\)/)
    expect(diag).toMatch(/ruta: .+ · corrige el anterior\n/)
    // Lo que de verdad usó cada mensaje, junto a lo que Toki estimó: solo cifras.
    // En la API (sin límites de suscripción) el caché dura 5 min; el primer mensaje lo encuentra frío.
    // Sin Toki: los mismos tokens en Opus, la mitad de barato en Sonnet.
    expect(diag).toContain(' uso: normal claude-sonnet-5-5/medium · 1 pedido · entrada 2 · salida 200 · caché escrito 998 · leído 29000 · $0.0074 · sin Toki $0.0148 · Toki estimó $0.0680 (4 pedidos, contexto 35k, caché 5 min, frío)\n')
    // Lo complejo va en Opus, que aún no tenía esta conversación en caché (el primero fue a Sonnet).
    // Sin Toki: Opus en medio (responde más corto) y con su caché al día. Lo estimado (9 pedidos)
    // contra lo real (1) es lo que sirve para calibrar.
    expect(diag).toContain(' uso: complejo claude-opus-5-5/xhigh · 1 pedido · entrada 2 · salida 200 · caché escrito 998 · leído 29000 · $0.0148 · sin Toki $0.0089 · Toki estimó $0.5580 (9 pedidos, contexto 35k, caché 5 min, frío)\n')
    expect((diag.match(/ uso: /g) ?? []).length).toBe(2)
    // La ventana se recalcula en cada mensaje mientras no hay datos: al registro llega una vez.
    expect((diag.match(/ ventana: /g) ?? []).length <= 1).toBe(true)
    expect(diag).not.toContain('exportar a CSV')
    expect(diag).not.toContain('sigue igual')
  })

  test('deshacer antes de que empiece el mensaje: va con tu modelo y su cuenta vuelve atrás', { options: { sonnetPrimero: true } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.prompt.submit({ text: BOTON, wait: false, origin: { kind: 'composer' } } as never)
    await $.command.run({ command: 'toki-modelo', args: 'deshacer' } as never)
    await correr($, 't0', BOTON, 1)
    expect(vistos[0]).toEqual({ turnId: 't0', model: OPUS, effort: 'medium' })
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text.includes('Ahorro por el modelo')).toBe(false)
  })

  test('/toki-sonnet: se prende, se apaga y vuelves a tu modelo; avisa si el modelo por mensaje está apagado', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const estado = (await $.command.run({ command: 'toki-sonnet', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('Solo Sonnet hasta que haga falta: apagado')
    expect(estado.text).toContain('/toki-sonnet sí | no')
    const si = (await $.command.run({ command: 'toki-sonnet', args: 'sí' } as never)) as { text: string }
    expect(si.text).toContain('activado')
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')?.model).toBe(SONNET)
    const no = (await $.command.run({ command: 'toki-sonnet', args: 'no' } as never)) as { text: string }
    expect(no.text).toContain('Desde el próximo mensaje vuelves a Opus')
    await mensaje($, 't1', COLUMNA, 1)
    expect(vistos.find(v => v.turnId === 't1')?.model).toBe(OPUS)
    // Como dice la ayuda, «Actívalo o apágalo», con tilde.
    const activalo = (await $.command.run({ command: 'toki-sonnet', args: 'Actívalo' } as never)) as { text: string }
    expect(activalo.text).toContain('— activado')
    const apagalo = (await $.command.run({ command: 'toki-sonnet', args: 'apágalo' } as never)) as { text: string }
    expect(apagalo.text).toContain('— apagado')
    await $.command.run({ command: 'toki-modelo', args: 'no' } as never)
    const sinRuteo = (await $.command.run({ command: 'toki-sonnet', args: 'on' } as never)) as { text: string }
    expect(sinRuteo.text).toContain('/toki-modelo no')
  })

  test('/model: si eliges Opus, Sonnet primero espera hasta /toki-sonnet sí', { options: { recomendarModelo: 'automatico', sonnetPrimero: true } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    expect(vistos.find(v => v.turnId === 't0')?.model).toBe(SONNET)
    await $.command.run({ command: 'model', args: 'opus' } as never)
    await mensaje($, 't1', COLUMNA, 1)
    expect(vistos.find(v => v.turnId === 't1')?.model).toBe(OPUS)
    const estado = (await $.command.run({ command: 'toki-sonnet', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('en pausa en esta sesión')
    await $.command.run({ command: 'toki-sonnet', args: 'sí' } as never)
    await mensaje($, 't2', FILTRO, 1)
    expect(vistos.find(v => v.turnId === 't2')?.model).toBe(SONNET)
  })

  test('subagentes: con Sonnet primero, también los encargos complejos van en Sonnet', { options: { sonnetPrimero: true } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = (await $.agent.spawn({ prompt: 'Diseña la arquitectura del módulo de pagos y compara tres opciones de seguridad', subagentType: 'general-purpose', parentModel: OPUS } as never)) as { model: string }
    expect(r.model).toBe(SONNET)
  })
})

describe('ahorro medido con el motor', () => {
  test('cambiar a Sonnet con el caché de Opus caliente: el primer pedido reescribe todo y se cuenta como costo de más', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    let primero = true
    mundo(on, {
      archivos,
      // El primer pedido en Sonnet no tiene nada en su caché: escribe la conversación entera.
      uso: e => {
        if (e.model !== SONNET || !primero) return {}
        primero = false
        return { cache_read_input_tokens: 0, cache_creation_input_tokens: 30_000 }
      },
    })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    await mensaje($, 't1', 'renombra la variable foo a bar en utils')
    await reloj.settle()
    const diag = archivos.get('.claude/toki/diagnostico.txt') ?? ''
    // Real: 30k escritos en Sonnet ($0.075) y el pedido de siempre. Sin Toki, Opus leía
    // esos 30k del caché y respondía en medio (salida ×1/0.73): $0.0115 + $0.0163.
    expect(diag).toContain(' · 2 pedidos · entrada 4 · salida 400 · caché escrito 30998 · leído 29000 · $0.0844 · sin Toki $0.0278 · ')
    const estado = (await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }
    expect(estado.text).toContain('· costó de más: ~$0.06 (más esfuerzo o reescribir el caché)')
  })

  test('subagente en Sonnet: lo medido va al total y al día cuando termina la sesión', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const guardado = new Map<string, unknown>()
    mundo(on, { guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = await $.agent.spawn({ prompt: 'Lista los archivos de src y dime cuáles usan fetch', subagentType: 'general-purpose', parentModel: OPUS } as never)
    expect(r).toEqual({ model: SONNET, agentId: 'a1' })
    for (let i = 0; i < 2; i++) {
      const stream = $.turn.step({ turnId: 'ta', index: i, model: SONNET, effort: 'medium', messageCount: 2 + i, agentId: 'a1' } as never)
      for await (const _ of stream) {
        // Sin trozos.
      }
      await stream.result
    }
    // Se acredita al terminar el mensaje o la sesión, no a cada pedido.
    expect(guardado.get('ahorroUsdTotal')).toBeUndefined()
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    // Cada pedido: $0.0148 en Opus contra $0.0074 en Sonnet, con el mismo caché (el subagente empieza de cero igual).
    const total = Number(guardado.get('ahorroUsdTotal'))
    expect(Math.abs(total - 0.014798)).toBeLessThan(1e-6)
    expect(Object.values(guardado.get('historialDiarioUsd') as Record<string, number>)).toEqual([total])
    // Solo hubo pedidos de subagentes: no hay último pedido del hilo principal que guardar.
    expect(guardado.get('ultimoPedido')).toBeUndefined()
  })

  test('el último pedido queda guardado: la próxima sesión sabe qué caché sigue vivo', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const guardado = new Map<string, unknown>()
    mundo(on, { guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    expect(guardado.get('ultimoPedido')).toMatchObject({ familia: 'opus', sin: 'opus', tamano: 30_000 })
    // Sin cambios de modelo, lo real es lo que habría costado: nada que acreditar por el modelo.
    expect(Number(guardado.get('ahorroUsdTotal') ?? 0)).toBeLessThan(0.001)
  })
})
