import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { cifraUsd, valorLectura } from '../hooks/ahorro'
import {
  armarPedidoMejorado,
  cambioDeTema,
  consejoDe,
  esCorreccion,
  esDetallado,
  evaluarEntrevista,
  leerModoEntrevista,
  RUTA_SPEC,
  textosEntrevista,
} from '../hooks/entrevista'
import { nivelHeuristico } from '../hooks/modelo'

// Preguntas antes de un pedido grande y consejos para pedir mejor: primero lo puro, después con el motor.

const x = textosEntrevista.es

function evaluar(texto: string, extra: { mensajes?: number; recientes?: string[]; interactivo?: boolean } = {}): ReturnType<typeof evaluarEntrevista> {
  const l = nivelHeuristico(texto)
  return evaluarEntrevista({ texto, nivel: l.nivel, motivo: l.motivo, interactivo: extra.interactivo ?? true, mensajes: extra.mensajes ?? 0, recientes: extra.recientes ?? [] })
}

const PROYECTO = 'quiero construir una app para gestionar las citas de mi clínica con recordatorios por WhatsApp'
const ARQUITECTURA = 'diseña la arquitectura de la sincronización offline y analiza todos los escenarios de conflicto entre dispositivos'

describe('¿entrevistar? (puro)', () => {
  test('un proyecto nuevo al empezar: sí, y lo dice', () => {
    expect(evaluar(PROYECTO)).toEqual({ entrevistar: true, porque: 'proyecto' })
  })

  test('un pedido grande y vago al empezar: sí', () => {
    expect(evaluar(ARQUITECTURA)).toEqual({ entrevistar: true, porque: 'grande' })
  })

  test('lo trivial, los "sí/dale" y las tareas con archivo y criterio de listo: no', () => {
    expect(evaluar('renombra la variable foo a bar en utils')).toEqual({ entrevistar: false })
    expect(evaluar('dale')).toEqual({ entrevistar: false })
    expect(evaluar('sí, hazlo')).toEqual({ entrevistar: false })
    const claro = 'refactoriza src/pagos/cobro.ts para separar el cálculo de impuestos; los tests de tests/cobro.test.ts deben seguir pasando'
    expect(evaluar(claro)).toEqual({ entrevistar: false })
  })

  test('un proyecto con ñ o tildes en medio también cuenta', () => {
    expect(evaluar('quiero un pequeño sistema de turnos para la barbería')).toEqual({ entrevistar: true, porque: 'proyecto' })
    expect(esCorreccion('ya te lo dije, no funcionó')).toBe(true)
  })

  test('un pedido muy detallado ya dice lo que la entrevista iba a preguntar', () => {
    const lista = ['crea una API de citas con estas rutas:', ...Array.from({ length: 6 }, (_, i) => `- GET /citas/${i} devuelve la cita y debe validar el token en src/auth/token.ts`), 'y corre los tests de tests/citas.test.ts'].join('\n')
    expect(esDetallado(lista)).toBe(true)
    expect(evaluar(lista)).toEqual({ entrevistar: false })
  })

  test('en medio de la misma conversación no entrevista: solo al empezar algo nuevo', () => {
    const recientes = ['arregla el error de sincronización offline entre dispositivos', 'la sincronización offline sigue perdiendo conflictos entre dispositivos']
    expect(evaluar(ARQUITECTURA, { mensajes: 4, recientes })).toEqual({ entrevistar: false })
    // Otro tema (o el primero después de /clear): sí.
    expect(evaluar(ARQUITECTURA, { mensajes: 4, recientes: ['agrega un botón de exportar a CSV en la tabla de pacientes'] })).toEqual({ entrevistar: true, porque: 'grande' })
    expect(evaluar(ARQUITECTURA, { mensajes: 0 })).toEqual({ entrevistar: true, porque: 'grande' })
  })

  test('"sin preguntas" se respeta y cuenta como salto; sin nadie que responda no hay entrevista', () => {
    expect(evaluar(`${PROYECTO}. Sin preguntas, por favor`)).toEqual({ entrevistar: false, omitido: 'sin-preguntas' })
    expect(evaluar(`${ARQUITECTURA}, don't ask me questions`)).toEqual({ entrevistar: false, omitido: 'sin-preguntas' })
    expect(evaluar(PROYECTO, { interactivo: false })).toEqual({ entrevistar: false })
  })

  test('las correcciones nunca se entrevistan', () => {
    expect(esCorreccion('no, eso no es lo que pedí: el redondeo debe ser a dos decimales')).toBe(true)
    expect(esCorreccion('sigue fallando el redondeo')).toBe(true)
    expect(esCorreccion("that's not what I asked for")).toBe(true)
    expect(esCorreccion('agrega un botón de exportar a CSV')).toBe(false)
    expect(evaluar('sigue fallando la sincronización offline entre dispositivos después de reconectar')).toEqual({ entrevistar: false })
  })

  test('el modo: auto por defecto', () => {
    expect(leerModoEntrevista(undefined)).toBe('auto')
    expect(leerModoEntrevista('preguntar')).toBe('preguntar')
    expect(leerModoEntrevista('no')).toBe('no')
    expect(leerModoEntrevista('off')).toBe('no')
  })
})

describe('cambio de tema (puro)', () => {
  const antes = ['agrega un botón de exportar a CSV en la tabla de pacientes', 'ahora el botón de exportar debe respetar el filtro de la tabla']
  test('mismo asunto: no; otro asunto: sí; sin historial o con muy poco texto: no', () => {
    expect(cambioDeTema(antes, 'el exportar a CSV de la tabla de pacientes pierde los acentos')).toBe(false)
    expect(cambioDeTema(antes, 'diseña el sistema de facturación electrónica con firma digital y reintentos automáticos')).toBe(true)
    expect(cambioDeTema([], 'diseña el sistema de facturación electrónica con firma digital')).toBe(false)
    expect(cambioDeTema(antes, 'dale')).toBe(false)
  })
})

describe('consejos para pedir mejor (puro)', () => {
  test('sin dónde: nombra el archivo; sin cómo comprobar: di cómo; mezcla; "todo"', () => {
    expect(consejoDe('arregla el error del redondeo cuando el total tiene tres decimales', 'normal')).toBe('ubicar')
    expect(consejoDe('arregla el redondeo en src/facturas/total.ts cuando el total tiene tres decimales', 'normal')).toBe('verificar')
    expect(consejoDe('arregla el redondeo en src/facturas/total.ts y corre los tests para comprobar que pasan', 'normal')).toBe(undefined)
    expect(consejoDe('revisa todo el código y dime qué mejorarías para que sea más rápido de mantener', 'normal')).toBe('amplio')
    const mezcla = 'arregla el login en src/auth.ts. Además cambia los colores del encabezado en src/ui/header.css. Otra cosa: actualiza el README con los pasos de instalación nuevos y revisa que los enlaces de la documentación sigan funcionando bien.'
    expect(consejoDe(mezcla, 'normal')).toBe('mezcla')
  })

  test('lo trivial y lo corto no llevan consejo; cada tipo sale un par de veces', () => {
    expect(consejoDe('renombra foo a bar', 'trivial')).toBe(undefined)
    expect(consejoDe('arregla esto', 'normal')).toBe(undefined)
    const texto = 'arregla el error del redondeo cuando el total tiene tres decimales'
    expect(consejoDe(texto, 'normal', { ubicar: 1 })).toBe('ubicar')
    expect(consejoDe(texto, 'normal', { ubicar: 2 })).toBe('verificar')
    expect(consejoDe(texto, 'normal', { ubicar: 2, verificar: 2 })).toBe(undefined)
  })
})

describe('pedido mejorado (puro)', () => {
  test('la tarea original más lo que corregiste, sin repetir las etiquetas del sistema', () => {
    const p = armarPedidoMejorado('arregla el redondeo de los totales', ['sigue fallando el redondeo', 'no, eso no es lo que pedí: a dos decimales'], 'es')
    expect(p.startsWith('arregla el redondeo de los totales')).toBe(true)
    expect(p).toContain('Ya probé esto y no sirvió')
    expect(p).toContain('- sigue fallando el redondeo')
    expect(p).toContain('- no, eso no es lo que pedí: a dos decimales')
  })
})

// ---------- Con el motor ----------

type Mundo = {
  toasts: string[]
  preguntas: string[]
  etiquetas: string[][]
  contextos: (readonly string[] | undefined)[]
  entrados: string[]
  fills: string[]
  comandos: string[]
}

function mundo(on: On, o: { tokens?: number; respuesta?: (etiquetas: string[]) => string } = {}): Mundo {
  const m: Mundo = { toasts: [], preguntas: [], etiquetas: [], contextos: [], entrados: [], fills: [], comandos: [] }
  // Se lee en cada pedido: una prueba puede cambiarlo (por ejemplo, tras /clear).
  const tokens = (): number => o.tokens ?? 30_000
  mock.store(on)
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
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: tokens(), window: 1_000_000, percent: 10 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => {
    m.entrados.push(e.text)
    m.contextos.push(e.context)
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
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: tokens() - 1_000, cache_creation_input_tokens: 998, model: e.model },
    }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    if (!q.question.startsWith('Toki: este mensaje')) m.preguntas.push(q.question)
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

const ARRANQUE = 'sigue con lo que veníamos haciendo'

describe('entrevista con el motor', () => {
  test('auto: el pedido grande avisa, Claude recibe la instrucción como contexto y tu texto no cambia', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROYECTO)
    expect(m.entrados).toEqual([PROYECTO])
    const contexto = m.contextos[0]?.join('\n') ?? ''
    expect(contexto).toContain('AskUserQuestion')
    expect(contexto).toContain('(Recomendado)')
    expect(contexto).toContain(RUTA_SPEC)
    expect(m.toasts).toContain(x.aviso)
    expect(m.preguntas.length).toBe(0)
    const r = (await $.command.run({ command: 'toki-entrevista', args: '' } as never)) as { text: string }
    expect(r.text).toContain('Con entrevista: 1 pedido')
  })

  test('un mensaje corto, un "dale" o una tarea mecánica no llevan nada', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils')
    await mensaje($, 't1', 'dale')
    expect(m.contextos.every(c => c === undefined)).toBe(true)
    expect(m.toasts.includes(x.aviso)).toBe(false)
  })

  test('"sin preguntas" la salta; a la tercera seguida Toki se calla por la sesión', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', `${PROYECTO}, sin preguntas`)
    await mensaje($, 't1', `${ARQUITECTURA}, sin preguntas`)
    expect(m.toasts.includes(x.callada)).toBe(false)
    await mensaje($, 't2', `crea un sistema de inventario para mi tienda con alertas de stock bajo, sin preguntas`)
    expect(m.toasts.includes(x.callada)).toBe(true)
    // Ya callado: ni siquiera sin la frase.
    await mensaje($, 't3', PROYECTO)
    expect(m.contextos.every(c => c === undefined)).toBe(true)
    // Y con el comando se reactiva.
    await $.command.run({ command: 'toki-entrevista', args: 'auto' } as never)
    await mensaje($, 't4', 'crea una aplicación de reservas para un gimnasio con pagos mensuales y clases grupales')
    expect(m.contextos[m.contextos.length - 1]?.join('\n')).toContain('AskUserQuestion')
  })

  test('preguntar: te consulta antes; "Enviar así" la salta y "Sí" la activa', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    let respuesta = x.opcionesPregunta.no
    const m = mundo(on, { respuesta: () => respuesta })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.command.run({ command: 'toki-entrevista', args: 'preguntar' } as never)
    await mensaje($, 't0', PROYECTO)
    expect(m.preguntas[0]).toContain('Cuesta ~1-2k tokens')
    expect(m.contextos[0]).toBe(undefined)
    respuesta = x.opcionesPregunta.si
    await mensaje($, 't1', ARQUITECTURA)
    expect(m.contextos[1]?.join('\n')).toContain('AskUserQuestion')
    expect(m.toasts.includes(x.aviso)).toBe(false)
  })

  test('/toki-entrevista no la apaga, también los consejos', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const r = (await $.command.run({ command: 'toki-entrevista', args: 'no' } as never)) as { text: string }
    expect(r.text).toContain('apagada')
    await mensaje($, 't0', PROYECTO)
    await mensaje($, 't1', 'arregla el error del redondeo cuando el total tiene tres decimales')
    expect(m.contextos.every(c => c === undefined)).toBe(true)
    expect(m.toasts.length).toBe(0)
  })

  test('sin nadie que responda (claude -p) no entrevista ni da consejos', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', PROYECTO)
    expect(m.contextos.every(c => c === undefined)).toBe(true)
    expect(m.toasts.length).toBe(0)
  })

  test('un consejo para pedir mejor, y cada tipo solo un par de veces', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    expect(m.toasts.filter(t => t === x.consejos.ubicar).length).toBe(1)
    await mensaje($, 't1', 'arregla el error del redondeo cuando el total tiene tres decimales')
    await mensaje($, 't2', 'arregla el error de la paginación cuando hay más de cien pacientes')
    expect(m.toasts.filter(t => t === x.consejos.ubicar).length).toBe(2)
    // Ya salió dos veces: toca el siguiente consejo.
    expect(m.toasts.filter(t => t === x.consejos.verificar).length).toBe(1)
  })

  test('cambio de tema con 150k de contexto: ofrece empezar en limpio y devuelve tu mensaje', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { tokens: 150_000, respuesta: ls => ls.find(l => l.startsWith('Empezar en limpio')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    const r = await mensaje($, 't1', ARQUITECTURA)
    expect(m.preguntas[0]).toContain('otro tema')
    expect(m.preguntas[0]).toContain('150')
    expect(r).toEqual({ drop: expect.stringContaining('empezando en limpio') })
    await reloj.advance(200)
    expect(m.comandos).toEqual(['clear'])
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await reloj.advance(500)
    expect(m.fills.some(f => f.startsWith(ARQUITECTURA))).toBe(true)
  })

  test('empezar en limpio por cambio de tema, con el caché vivo: desde el segundo pedido se cuenta lo que ya no se relee', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const o = { tokens: 150_000, respuesta: (ls: string[]) => ls.find(l => l.startsWith('Empezar en limpio')) ?? '' }
    const m = mundo(on, o)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    await mensaje($, 't1', ARQUITECTURA)
    await reloj.advance(200)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await reloj.advance(500)
    o.tokens = 25_000
    await mensaje($, 't2', ARQUITECTURA)
    // El primero aún escribe la conversación nueva en el caché: no se cuenta.
    let toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).not.toContain('Empezar en limpio')
    o.tokens = 27_000
    await reloj.advance(10_000)
    await mensaje($, 't3', 'empieza por el módulo de sincronización')
    const usd = valorLectura(125_000, 'opus')
    toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).toContain(`  Empezar en limpio: ${cifraUsd(usd)} (~125.0k tokens de la conversación de antes que Claude ya no releyó ni reescribió)\n`)
    expect(m.toasts).toContain(`Empezar en limpio ya ahorró ${cifraUsd(usd)}: cada mensaje deja de releer ~125.0k tokens de la conversación de antes.`)
  })

  test('cambio de tema con poco contexto: no pregunta, solo entrevista', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { tokens: 40_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'agrega un botón de exportar a CSV en la tabla de pacientes')
    await mensaje($, 't1', ARQUITECTURA)
    expect(m.preguntas.length).toBe(0)
    expect(m.contextos[1]?.join('\n')).toContain('AskUserQuestion')
  })

  test('dos correcciones sobre lo mismo: pedido mejorado en una conversación limpia', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { tokens: 120_000, respuesta: ls => ls.find(l => l.startsWith('Empezar en limpio')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'arregla el error de redondeo en el cálculo de totales de la factura')
    await mensaje($, 't1', 'sigue fallando el redondeo')
    expect(m.preguntas.length).toBe(0)
    const r = await mensaje($, 't2', 'no, eso no es lo que pedí: el redondeo debe ser a dos decimales')
    expect(m.preguntas[0]).toContain('corregiste dos veces')
    expect(r).toEqual({ drop: expect.stringContaining('empezando en limpio') })
    await reloj.advance(200)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await reloj.advance(500)
    const devuelto = m.fills.find(f => f.startsWith('arregla el error de redondeo'))
    expect(devuelto).toContain('Ya probé esto y no sirvió')
    expect(devuelto).toContain('- sigue fallando el redondeo')
    expect(devuelto).toContain('- no, eso no es lo que pedí')
  })

  test('cuenta las correcciones que siguen a los pedidos con y sin entrevista', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROYECTO)
    await mensaje($, 't1', 'sigue fallando el recordatorio por WhatsApp')
    const r = (await $.command.run({ command: 'toki-entrevista', args: '' } as never)) as { text: string }
    expect(r.text).toContain('Con entrevista: 1 pedido, correcciones después: 1 (100 %)')
    expect(r.text).toContain('Sin entrevista: 0 pedidos')
    expect(r.text).toContain('muy pocos pedidos todavía')
  })
})
