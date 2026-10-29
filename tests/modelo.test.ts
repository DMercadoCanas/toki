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
  decidirRuta,
  deltaRuteo,
  esfuerzoDeFabrica,
  esfuerzoGuardado,
  etiquetas,
  familiaDe,
  hermano,
  leerEsfuerzo,
  leerModo,
  limpiarPrompt,
  modeloCanonico,
  modeloSubagente,
  nivelHeuristico,
  PEDIDOS_PARA_SUBIR,
  proponer,
  terminaEnPregunta,
  textosRuta,
  usaEsfuerzoHeredado,
} from '../hooks/modelo'
import type { EstadoRuta } from '../hooks/modelo'
import { CADA_TESTIGO, factorCalibrado, TESTIGOS_META } from '../hooks/ahorro'
import { claveDia } from '../hooks/historial'

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

  test('una orden corta que cambia código no es trivial', () => {
    for (const t of ['corrige lo de las líneas', 'agrega el campo cups', 'implementa lo del pago parcial', 'quita el botón crear', 'pon no_create en la vista', 'ahora hazlo para salud también', 'make it work for health too']) {
      expect(nivelHeuristico(t, 'normal').nivel).toBe('normal')
    }
    // Lo corto sin orden de cambio sigue siendo poca cosa.
    expect(nivelHeuristico('listo, sube los cambios').nivel).toBe('trivial')
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
    /** Las variables de entorno (`CLAUDE_CODE_EFFORT_LEVEL`…); se pueden cambiar durante la prueba. */
    entorno?: Record<string, string>
    /** Tu configuración por fuente (`user`, `project`…), como la guarda Claude Code; se puede cambiar durante la prueba. */
    ajustes?: Record<string, Record<string, unknown>>
    /** Otro hook frena el mensaje (devuelve `drop`). */
    descartar?: (texto: string) => boolean
    /** Tu modelo (el de `/model`); por defecto Opus 5.5. */
    modelo?: string
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
  on('env.get', ($, e) => ({ value: opciones.entorno?.[e.name] }))
  // Sin `ajustes`, leer la configuración falla (como en el motor de pruebas) y Toki usa lo de fábrica.
  const ajustes = opciones.ajustes
  if (ajustes !== undefined) on('settings.read', ($, e) => ({ value: ajustes[e.source ?? 'user'] ?? {} }) as never)
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
  on('session.model', () => ({ value: opciones.modelo ?? 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 30_000, window: 200_000, percent: 15 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => (opciones.descartar?.(e.text) === true ? { drop: 'frenado por otro hook' } : { text: e.text }))
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
  // /effort del motor: lo que guarda en tu configuración lo pone cada prueba en `ajustes`.
  on('command.run', { command: 'effort' }, () => ({ text: '' }) as never)
  return { vistos, toasts }
}

type Motor = Parameters<TestBody>[0]

async function mensaje($: Motor, turnId: string, texto: string, pedidos = 2, respuesta = 'Listo.', esfuerzo = 'medium', modelo = 'claude-opus-5-5'): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await correr($, turnId, texto, pedidos, respuesta, esfuerzo, modelo)
}

/** El turno de un mensaje ya enviado: sus pedidos al modelo (con el esfuerzo de la sesión) y el final. */
async function correr($: Motor, turnId: string, texto: string, pedidos = 2, respuesta = 'Listo.', esfuerzo = 'medium', modelo = 'claude-opus-5-5'): Promise<void> {
  await $.turn.start({ text: texto, turnId })
  for (let i = 0; i < pedidos; i++) {
    const stream = $.turn.step({ turnId, index: i, model: modelo, effort: esfuerzo, messageCount: 10 + i } as never)
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
    // Real: 30k escritos en Sonnet ($0.075) y el pedido de siempre. Sin Toki, Opus leía esos 30k
    // del caché y respondía en medio: salida ×1.18 (sin testigos, la mitad de lo que dice la tabla, ×1/0.73).
    expect(diag).toContain(' · 2 pedidos · entrada 4 · salida 400 · caché escrito 30998 · leído 29000 · $0.0844 · sin Toki $0.0263 · ')
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

// ---------- Una sola cifra: lo ahorrado en dólares ----------

const BANDA = {
  plugin: 'toki',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const PANEL = {
  plugin: 'toki',
  component: 'Pane',
  requestId: 'toki-panel',
  props: { title: 'Toki', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const cerca = (a: unknown, b: number) => Math.abs(Number(a) - b) < 1e-9

describe('una sola cifra en dólares con el motor', () => {
  test('la barra dice lo ahorrado en dólares con el −%, y "Sonnet ✓" porque lo dijo la API', { options: { sonnetPrimero: true } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1)
    await mensaje($, 't1', COLUMNA, 1)
    await mensaje($, 't2', FILTRO, 1)
    // El aviso del cambio dura 12 s; después queda el modelo en la barra.
    await reloj.advance(13_000)
    const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    // Cada mensaje: $0.0074 en Sonnet contra $0.0148 en Opus. Tres: ~$0.02 ahorrados, la mitad de lo que habría costado.
    expect(await banda.find({ type: 'Text', text: '· ahorrado' })).toBeDefined()
    expect(await banda.find({ type: 'Text', text: /^~\$0\.02 −50 %$/ })).toBeDefined()
    expect(await banda.find({ type: 'Text', text: /^Sonnet ✓ · por Toki$/ })).toBeDefined()
    // Ni relecturas ni "por modelo" sueltos: el desglose está en /toki.
    expect(await banda.find({ type: 'Text', text: /relecturas|por modelo/ })).toBeUndefined()
    await banda.unmount()

    const toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).toContain('Toki · ~$0.02 ahorrados en esta sesión (−50 %) · hoy ~$0.02 · semana ~$0.02 · histórico ~$0.02\n')
    expect(toki).toContain('De dónde sale el ahorro de esta sesión:\n  Modelo y esfuerzo: ~$0.02 (cada pedido contra tu modelo y tu esfuerzo)\n  Esta sesión costó ~$0.02; sin Toki habría costado ~$0.04.\n')
    expect(toki).toContain('✓ Respondió Sonnet: lo dice la API en cada pedido, no es una suposición de Toki.')

    const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    expect(await panel.find({ type: 'Text', text: 'De dónde sale el ahorro de esta sesión' })).toBeDefined()
    expect(await panel.find({ type: 'Text', text: 'Esta sesión costó ~$0.02; sin Toki habría costado ~$0.04.' })).toBeDefined()
    expect(await panel.find({ type: 'Text', text: /^~\$0\.02 −50 %$/ })).toBeDefined()
    await panel.unmount()

    // La tarjeta de la semana, con la misma cifra.
    const semana = ((await $.command.run({ command: 'toki-semana', args: '' } as never)) as { text: string }).text
    expect(semana).toContain('Te ahorré ~$0.02 a precio de API, un 50 % menos que sin Toki')
  })

  test('si en neto costó de más, la barra y /toki lo dicen tal cual', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    let primero = true
    mundo(on, {
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
    await reloj.advance(13_000)
    const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    expect(await banda.find({ type: 'Text', text: '· costó de más' })).toBeDefined()
    expect(await banda.find({ type: 'Text', text: /^~\$0\.06$/ })).toBeDefined()
    expect(await banda.find({ type: 'Text', text: '· ahorrado' })).toBeUndefined()
    await banda.unmount()
    const toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).toContain('Toki · esta sesión Toki costó ~$0.06 de más · hoy −$0.06 · semana −$0.06 · histórico −$0.06\n')
    expect(toki).toContain('  Modelo y esfuerzo: −$0.06 (costó de más por más esfuerzo o al reescribir el caché)\n')
    expect(toki).toContain('  Esta sesión costó ~$0.10; sin Toki habría costado ~$0.04.\n')
    expect(toki.includes('ahorró $0.00')).toBe(false)
  })

  test('lo ahorrado antes de 0.17 pasa a dólares una sola vez, a precio de Sonnet, y se dice', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const ayer = claveDia(1_000_000 - 86_400_000)
    const guardado = new Map<string, unknown>([
      ['tokensAhorradosTotal', 100_000],
      ['historialDiario', { [ayer]: 100_000 }],
      ['relecturasEvitadasTotal', 1_000_000],
      ['logros', ['primero', 'diez', 'cien']],
    ])
    mundo(on, { guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // 100k recortados: no escribirlos en el caché de Sonnet ($2.50/M). 1M sin releer: $0.10/M.
    expect(cerca(guardado.get('ahorroUsdTotal'), 0.35)).toBe(true)
    expect(cerca(guardado.get('ahorroUsdEstimado'), 0.35)).toBe(true)
    expect(guardado.get('ahorroUsdSembrado')).toBe(true)
    // Por día solo van los recortes: las relecturas nunca se guardaron por día.
    const dias = guardado.get('historialDiarioUsd') as Record<string, number>
    expect(Object.keys(dias)).toEqual([ayer])
    expect(cerca(dias[ayer], 0.25)).toBe(true)
    // El saludo ya lo dice en dólares.
    const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    expect(await banda.find({ type: 'Text', text: '¡Hola de nuevo! Llevamos ~$0.35 ahorrados juntos.' })).toBeDefined()
    await banda.unmount()
    const toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).toContain(' · semana ~$0.25 · histórico ~$0.35\n')
    expect(toki).toContain('Incluye ~$0.35 de antes de la versión 0.17, estimados a precio de Sonnet (solo recortes y relecturas).')
    // Una sola vez: la sesión siguiente no lo vuelve a sumar.
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(cerca(guardado.get('ahorroUsdTotal'), 0.35)).toBe(true)
  })
})

// ---------- El esfuerzo con que pide Claude Code ----------

const FABLE = 'claude-fable-5-1'

/** Las líneas que Toki anotó en .claude/toki/diagnostico.txt, sin la hora, cuando terminan de escribirse. */
async function diagnostico(reloj: ReturnType<typeof mock.clock>, archivos: Map<string, string>): Promise<string[]> {
  await reloj.settle()
  return (archivos.get('.claude/toki/diagnostico.txt') ?? '')
    .trimEnd()
    .split('\n')
    .map(l => l.replace(/^\S+ /, ''))
}

/** De cada mensaje, con qué esfuerzo Toki supuso que iba: lo que dice la línea `ruta:` antes de la flecha. */
function supuestos(diag: string[]): string[] {
  return diag.filter(l => l.startsWith('ruta: ')).map(l => /^ruta: \S+ \([^)]*\) (\S+) →/.exec(l)?.[1] ?? l)
}

describe('el esfuerzo con que pide Claude Code', () => {
  test('el nombre con que guarda el esfuerzo de un modelo', () => {
    expect(modeloCanonico('claude-opus-5-5[1m]')).toBe(OPUS)
    expect(modeloCanonico('claude-opus-5-5-20261001')).toBe(OPUS)
    expect(modeloCanonico('us.anthropic.claude-opus-5-5-v1:0')).toBe(OPUS)
    expect(modeloCanonico('arn:aws:bedrock:us-east-1:123:inference-profile/global.anthropic.claude-opus-5-5-v1:0')).toBe(OPUS)
    expect(modeloCanonico('claude-sonnet-5-5@20261001')).toBe(SONNET)
    expect(modeloCanonico('Claude-Opus-5-5-latest')).toBe(OPUS)
  })

  test('lo de fábrica, los niveles que acepta y a qué modelos les vale el effortLevel de arriba', () => {
    expect(esfuerzoDeFabrica(OPUS)).toBe('medium')
    expect(esfuerzoDeFabrica('claude-opus-5-5[1m]')).toBe('medium')
    expect(esfuerzoDeFabrica('claude-opus-4-7')).toBe('xhigh')
    expect(esfuerzoDeFabrica(FABLE)).toBe('high')
    expect(usaEsfuerzoHeredado(OPUS)).toBe(false)
    expect(usaEsfuerzoHeredado(SONNET)).toBe(false)
    expect(usaEsfuerzoHeredado(FABLE)).toBe(true)
    expect(usaEsfuerzoHeredado('claude-opus-4-7-20260301')).toBe(true)
    expect(usaEsfuerzoHeredado('gpt-x')).toBe(true)
    expect(leerEsfuerzo('med')).toBe('medium')
    expect(leerEsfuerzo('MAX')).toBe('max')
    expect(leerEsfuerzo('auto')).toBe(undefined)
    expect(leerEsfuerzo(3)).toBe(undefined)
    // `max` vale solo para la sesión: no se guarda.
    expect(esfuerzoGuardado('max')).toBe(undefined)
    expect(esfuerzoGuardado('xhigh')).toBe('xhigh')
  })

  test('la misma regla al planear y al corregir el plan', () => {
    const base = { modelo: OPUS, contexto: 35_000, ttl1h: true, permitirModelo: true, cacheFrio: true, reescribe: 20_000 }
    const estado: EstadoRuta = { modo: 'preguntar', silenciado: false, interactivo: true, enAhorro: false }
    // Bajar lo que va alto: se aplica solo.
    const alto = proponer({ ...base, nivel: 'normal', esfuerzo: 'xhigh' })
    expect(decidirRuta(alto, estado)).toMatchObject({ modo: 'auto', decision: 'auto', como: 'auto', elegida: { modelo: OPUS, esfuerzo: 'medium' } })
    // Subir cuesta más: pregunta. Sin nadie que responda (o al corregir, ya sin preguntar), no sube.
    const bajo = proponer({ ...base, nivel: 'normal', esfuerzo: 'low' })
    expect(decidirRuta(bajo, estado)).toMatchObject({ modo: 'preguntar', decision: 'preguntar' })
    expect(decidirRuta(bajo, { ...estado, interactivo: false })).toMatchObject({ modo: 'nada', decision: 'callado' })
    // Lo que elegiste antes para ese nivel se repite sin preguntar.
    expect(decidirRuta(bajo, { ...estado, recordada: 'calidad' })).toMatchObject({ modo: 'auto', como: 'recordado', elegida: { modelo: OPUS, esfuerzo: 'high' } })
    // Lo que deshiciste no vuelve solo.
    expect(decidirRuta(alto, { ...estado, deshecha: { modelo: OPUS, esfuerzo: 'medium' } })).toMatchObject({ modo: 'nada', decision: 'deshecho' })
    // Modo ahorro: la opción barata, sin preguntar.
    expect(decidirRuta(bajo, { ...estado, enAhorro: true })).toMatchObject({ modo: 'auto', elegida: { tipo: 'ahorro' } })
    // Sin nada más en juego, lo mismo que decidirInterfaz.
    for (const p of [alto, bajo]) {
      for (const modo of ['preguntar', 'siempre', 'automatico', 'no'] as const) expect(decidirRuta(p, { ...estado, modo }).modo).toBe(decidirInterfaz(modo, p, false))
    }
  })

  test('la sesión va en muy alto y Toki supuso medio: el primer pedido lo dice y el plan se corrige antes de salir', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const guardado = new Map<string, unknown>()
    const preguntas: string[] = []
    const { vistos } = mundo(on, { archivos, guardado, preguntas })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Al planear, con medio, lo normal ya iba así.
    await mensaje($, 't0', BOTON, 2, 'Listo.', 'xhigh')
    expect(vistos.filter(v => v.turnId === 't0').map(v => v.effort)).toEqual(['medium', 'medium'])
    expect(preguntas.length).toBe(0)
    const diag = await diagnostico(reloj, archivos)
    expect(diag).toContain('ruta: normal (tarea-normal) claude-opus-5-5/medium → claude-opus-5-5/medium igual [ya-va-asi]')
    expect(diag.some(l => /^ruta corregida: esfuerzo xhigh, Toki supuso medium → claude-opus-5-5\/medium −\d+ ?%$/.test(l))).toBe(true)
    expect(diag).toContain('pedido: claude-opus-5-5/xhigh → claude-opus-5-5/medium')
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toMatch(/Último mensaje: normal \(tarea normal\) · Opus · muy alto → Opus · medio \(−\d+ ?%\) · aplicado/)
    expect(estado).toMatch(/• normal \(tarea normal\) → Opus · medio \(−\d+ ?%\)/)
    // Nadie lo fijó: es el por defecto de tu cuenta. Se recuerda para la próxima sesión.
    expect(guardado.get('esfuerzoPorDefecto')).toEqual({ [OPUS]: 'xhigh' })
    // El siguiente ya se planea con el esfuerzo de verdad: nada que corregir.
    await mensaje($, 't1', COLUMNA, 1, 'Listo.', 'xhigh')
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('medium')
    const diag2 = await diagnostico(reloj, archivos)
    expect(diag2.filter(l => l.startsWith('ruta corregida')).length).toBe(1)
    expect(supuestos(diag2)).toEqual(['claude-opus-5-5/medium', 'claude-opus-5-5/xhigh'])
  })

  test('va en bajo: lo normal no se sube sin preguntar, y el siguiente sí pregunta', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const preguntas: string[] = []
    const { vistos } = mundo(on, { archivos, preguntas, respuesta: ls => ls[ls.length - 1] ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 2, 'Listo.', 'low')
    expect(vistos.filter(v => v.turnId === 't0').map(v => v.effort)).toEqual(['low', 'low'])
    expect(preguntas.length).toBe(0)
    const diag = await diagnostico(reloj, archivos)
    expect(diag).toContain('ruta corregida: esfuerzo low, Toki supuso medium → claude-opus-5-5/low sin cambio')
    expect(diag.some(l => l.startsWith('pedido:'))).toBe(false)
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toMatch(/Último mensaje: normal \(tarea normal\) · Opus · bajo → Opus · medio \(\+\d+ ?%\) · sin cambio \(no lo aplico sin preguntar\)/)
    expect(estado).toContain('Aún no hubo cambios de modelo o esfuerzo.')
    await mensaje($, 't1', COLUMNA, 1, 'Listo.', 'low')
    expect(preguntas.length).toBe(1)
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('low')
  })

  test('lo que elegiste en la pregunta vale aunque el esfuerzo de verdad sea otro', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const preguntas: string[] = []
    const { vistos } = mundo(on, { archivos, preguntas, respuesta: ls => ls.find(l => l.includes('— equilibrio')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROFUNDO, 2, 'Listo.', 'high')
    expect(preguntas.length).toBe(1)
    expect(vistos.filter(v => v.turnId === 't0').map(v => v.effort)).toEqual(['xhigh', 'xhigh'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag.some(l => /^ruta corregida: esfuerzo high, Toki supuso medium → claude-opus-5-5\/xhigh \+\d+ ?%$/.test(l))).toBe(true)
  })

  test('"dejar como está" deja el esfuerzo de verdad, no el que Toki supuso', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const preguntas: string[] = []
    const { vistos } = mundo(on, { archivos, preguntas, respuesta: ls => ls.find(l => l.startsWith('Dejar como está')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROFUNDO, 2, 'Listo.', 'high')
    expect(preguntas.length).toBe(1)
    expect(vistos.filter(v => v.turnId === 't0').map(v => v.effort)).toEqual(['high', 'high'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag).toContain('ruta corregida: esfuerzo high, Toki supuso medium → claude-opus-5-5/high sin cambio')
    expect(diag.some(l => l.startsWith('pedido:'))).toBe(false)
  })

  test('en automático, lo simple pasa a Sonnet igual; el historial dice desde dónde bajó de verdad', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const { vistos, toasts } = mundo(on, { archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', 2, 'Listo.', 'xhigh')
    expect(vistos.filter(v => v.turnId === 't0')).toEqual([
      { turnId: 't0', model: SONNET, effort: 'low' },
      { turnId: 't0', model: SONNET, effort: 'low' },
    ])
    const diag = await diagnostico(reloj, archivos)
    expect(diag.some(l => /^ruta corregida: esfuerzo xhigh, Toki supuso medium → claude-sonnet-5-5\/low −\d+ ?%$/.test(l))).toBe(true)
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toContain('Último mensaje: simple (tarea mecánica) · Opus · muy alto → Sonnet · bajo')
    // Una sola entrada: la del plan, corregida.
    expect(estado.split('\n').filter(l => l.trim().startsWith('•')).length).toBe(1)
    // Un solo aviso con sonido; el texto, el corregido.
    expect(toasts.filter(t => t.includes('Sonnet')).length).toBeLessThanOrEqual(1)
  })

  test('/effort: lo que elijas vale desde el próximo mensaje; max (que no se guarda) también, aunque sea antes del primero', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const ajustes: Record<string, Record<string, unknown>> = {}
    const { vistos } = mundo(on, { archivos, ajustes, respuesta: ls => ls[ls.length - 1] ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await $.command.run({ command: 'effort', args: 'max' } as never)
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'max')
    // Como Claude Code: /effort low lo guarda para tu modelo en tu configuración.
    ajustes.user = { modelSettings: { [OPUS]: { effortLevel: 'low' } } }
    await $.command.run({ command: 'effort', args: 'low' } as never)
    await mensaje($, 't1', COLUMNA, 1, 'Listo.', 'low')
    // auto: Claude Code lo borra y vuelve al por defecto.
    delete ajustes.user
    await $.command.run({ command: 'effort', args: 'auto' } as never)
    await mensaje($, 't2', FILTRO, 1)
    expect(vistos.map(v => v.effort)).toEqual(['medium', 'low', 'medium'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag.filter(l => l.startsWith('ruta corregida'))).toEqual([])
    expect(supuestos(diag)).toEqual(['claude-opus-5-5/max', 'claude-opus-5-5/low', 'claude-opus-5-5/medium'])
  })

  test('tu configuración, como la junta Claude Code: el nombre exacto gana y lo del proyecto pisa lo tuyo', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const ajustes: Record<string, Record<string, unknown>> = {
      user: { effortLevel: 'low', modelSettings: { 'claude-opus-5-5-20261001': { effortLevel: 'low' }, [OPUS]: { effortLevel: 'xhigh' } } },
    }
    mundo(on, { archivos, ajustes })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'xhigh')
    // El effortLevel de arriba de tu configuración personal no vale para los 5.5.
    ajustes.user = { effortLevel: 'high' }
    await mensaje($, 't1', COLUMNA, 1)
    // Lo del proyecto, también el de arriba, pisa lo que fijaste para el modelo en tu configuración.
    ajustes.user = { modelSettings: { [OPUS]: { effortLevel: 'xhigh' } } }
    ajustes.project = { effortLevel: 'high' }
    await mensaje($, 't2', FILTRO, 1, 'Listo.', 'high')
    // Y lo de la empresa, sobre todo.
    ajustes.policy = { modelSettings: { [OPUS]: { effortLevel: 'low' } } }
    await mensaje($, 't3', BOTON, 1, 'Listo.', 'low')
    const diag = await diagnostico(reloj, archivos)
    expect(diag.filter(l => l.startsWith('ruta corregida'))).toEqual([])
    expect(supuestos(diag)).toEqual(['claude-opus-5-5/xhigh', 'claude-opus-5-5/medium', 'claude-opus-5-5/high', 'claude-opus-5-5/low'])
  })

  test('en un modelo de antes (Fable 5.1) sí vale el effortLevel de arriba de tu configuración personal', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const ajustes: Record<string, Record<string, unknown>> = { user: { effortLevel: 'low' } }
    mundo(on, { archivos, ajustes, modelo: FABLE, respuesta: ls => ls[ls.length - 1] ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'low', FABLE)
    delete ajustes.user
    await mensaje($, 't1', COLUMNA, 1, 'Listo.', 'high', FABLE)
    const diag = await diagnostico(reloj, archivos)
    expect(diag.filter(l => l.startsWith('ruta corregida'))).toEqual([])
    expect(supuestos(diag)).toEqual(['claude-fable-5-1/low', 'claude-fable-5-1/high'])
  })

  test('CLAUDE_CODE_EFFORT_LEVEL manda sobre todo; con auto, lo de fábrica aunque tu configuración diga otro', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const entorno: Record<string, string> = { CLAUDE_CODE_EFFORT_LEVEL: 'HIGH' }
    const ajustes: Record<string, Record<string, unknown>> = { user: { modelSettings: { [OPUS]: { effortLevel: 'low' } } } }
    const { vistos } = mundo(on, { archivos, entorno, ajustes })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'high')
    // Con la variable puesta, /effort no cambia lo que se pide.
    await $.command.run({ command: 'effort', args: 'max' } as never)
    await mensaje($, 't1', COLUMNA, 1, 'Listo.', 'high')
    entorno.CLAUDE_CODE_EFFORT_LEVEL = 'auto'
    await mensaje($, 't2', FILTRO, 1)
    expect(vistos.map(v => v.effort)).toEqual(['medium', 'medium', 'medium'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag.filter(l => l.startsWith('ruta corregida'))).toEqual([])
    expect(supuestos(diag)).toEqual(['claude-opus-5-5/high', 'claude-opus-5-5/high', 'claude-opus-5-5/medium'])
  })

  test('el por defecto de tu cuenta se recuerda entre sesiones, y se olvida si vuelve al de fábrica', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    // Uno de otra versión dejó un `max`: no es un por defecto y no se carga.
    const guardado = new Map<string, unknown>([['esfuerzoPorDefecto', { [OPUS]: 'high', [SONNET]: 'max' }]])
    const { vistos } = mundo(on, { archivos, guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 2, 'Listo.', 'high')
    // Supuso alto desde el comienzo: lo bajó al planear, sin corregir nada.
    expect(vistos.filter(v => v.turnId === 't0').map(v => v.effort)).toEqual(['medium', 'medium'])
    const diag = await diagnostico(reloj, archivos)
    expect(supuestos(diag)).toEqual(['claude-opus-5-5/high'])
    expect(diag.some(l => l.startsWith('ruta corregida'))).toBe(false)
    expect(guardado.get('esfuerzoPorDefecto')).toEqual({ [OPUS]: 'high', [SONNET]: 'max' })
    // Otra sesión: tu cuenta volvió a medio (el de fábrica).
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't1', COLUMNA, 2, 'Listo.', 'medium')
    expect(vistos.filter(v => v.turnId === 't1').map(v => v.effort)).toEqual(['medium', 'medium'])
    const diag2 = await diagnostico(reloj, archivos)
    expect(diag2).toContain('ruta corregida: esfuerzo medium, Toki supuso high → claude-opus-5-5/medium sin cambio')
    expect(guardado.get('esfuerzoPorDefecto')).toEqual({})
    // El cambio que se había aplicado al planear ya no está: nada cambió.
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toContain('Último mensaje: normal (tarea normal) · Opus · medio → Opus · medio (igual) · ya iba así')
  })

  test('si otro hook frena tu mensaje, lo que Toki planeó para él no queda para el siguiente', { options: { recomendarModelo: 'automatico' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const { vistos } = mundo(on, { descartar: t => t.startsWith('renombra') })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Lo simple pasaría a Sonnet en bajo: Toki lo aplica al planear, y otro hook frena el mensaje.
    const r = await $.prompt.submit({ text: 'renombra la variable foo a bar en utils', wait: false, origin: { kind: 'composer' } } as never)
    expect(r).toEqual({ drop: 'frenado por otro hook' })
    await mensaje($, 't1', COLUMNA, 2)
    expect(vistos).toEqual([
      { turnId: 't1', model: OPUS, effort: 'medium' },
      { turnId: 't1', model: OPUS, effort: 'medium' },
    ])
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toContain('Aún no hubo cambios de modelo o esfuerzo.')
    expect(estado.includes('Sonnet por Toki')).toBe(false)
  })
})

describe('la red de seguridad del esfuerzo', () => {
  test(`lo que Toki bajó de esfuerzo y pasa de ${PEDIDOS_PARA_SUBIR} pedidos sigue con tu esfuerzo, y el "dale" de después ya no baja`, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const { vistos, toasts } = mundo(on, { archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', PEDIDOS_PARA_SUBIR + 2, 'Listo.', 'high')
    const t0 = vistos.filter(v => v.turnId === 't0').map(v => v.effort)
    expect(t0).toEqual([...Array<string>(PEDIDOS_PARA_SUBIR).fill('low'), 'high', 'high'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag).toContain(`esfuerzo restaurado: low → high (${PEDIDOS_PARA_SUBIR} pedidos)`)
    expect(toasts.some(t => t.includes('más largo de lo que parecía') && t.includes('alto'))).toBe(true)
    // Ya no era simple: seguir con la misma tarea no vuelve a bajo.
    await mensaje($, 't1', 'dale', 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't1')?.effort).not.toBe('low')
  })

  test('un mensaje corto que Toki no bajó no se toca, por largo que sea', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const { vistos } = mundo(on, { archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', PEDIDOS_PARA_SUBIR + 2, 'Listo.', 'low')
    expect(vistos.filter(v => v.turnId === 't0').every(v => v.effort === 'low')).toBe(true)
    expect((await diagnostico(reloj, archivos)).some(l => l.startsWith('esfuerzo restaurado'))).toBe(false)
  })

  test('una corrección no va en simple aunque lo anterior lo fuera: cuenta como atascado', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const { vistos } = mundo(on, { archivos })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't0')?.effort).toBe('low')
    await mensaje($, 't1', 'no era eso', 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't1')?.effort).not.toBe('low')
    const diag = await diagnostico(reloj, archivos)
    expect(diag.some(l => l.startsWith('ruta: normal (seguimiento, atascado)') && l.endsWith('· corrige el anterior'))).toBe(true)
  })
})

describe('calibrar lo que ahorra bajar el esfuerzo', () => {
  const RENOMBRA = 'renombra la variable foo a bar en utils'
  const CLAVE = 'claude-opus-5-5|trivial|high>low'

  test(`1 de cada ${CADA_TESTIGO} mensajes que Toki baja de esfuerzo va con el tuyo, de testigo; lo medido se guarda y se ve en /toki-modelo`, async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const guardado = new Map<string, unknown>()
    const { vistos } = mundo(on, { archivos, guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    // Algo normal primero: la conversación queda en el caché de Opus y lo simple solo baja el esfuerzo.
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'high')
    for (let i = 1; i <= CADA_TESTIGO; i++) await mensaje($, `t${i}`, RENOMBRA, 1, 'Listo.', 'high')
    const simples = vistos.filter(v => v.turnId !== 't0')
    expect(simples.every(v => v.model === 'claude-opus-5-5')).toBe(true)
    expect(simples.map(v => v.effort)).toEqual([...Array<string>(CADA_TESTIGO - 1).fill('low'), 'high'])
    const diag = await diagnostico(reloj, archivos)
    expect(diag.filter(l => l.startsWith('ruta: ') && l.includes('[testigo')).length).toBe(1)
    expect((guardado.get('calibracionEsfuerzo') as Record<string, unknown>)[CLAVE]).toEqual({
      candidatos: CADA_TESTIGO,
      bajados: { mensajes: CADA_TESTIGO - 1, pedidos: CADA_TESTIGO - 1, salida: (CADA_TESTIGO - 1) * 200 },
      testigos: { mensajes: 1, pedidos: 1, salida: 200 },
    })
    const estado = ((await $.command.run({ command: 'toki-modelo', args: '' } as never)) as { text: string }).text
    expect(estado).toContain('· sin cambio (testigo: mide cuánto ahorra bajar el esfuerzo)')
    expect(estado).toContain(`1 de cada ${CADA_TESTIGO} mensajes va con tu esfuerzo, de testigo, hasta juntar ${TESTIGOS_META}`)
    // Aquí bajar el esfuerzo no cambió la salida (el motor de prueba siempre escribe 200): el factor baja hacia 1.
    expect(estado).toContain('• Opus · simple, alto → bajo: ×1.17 · medido ×1.00 con 1 testigo y 9 bajados · pedidos por mensaje: 1.0 con tu esfuerzo, 1.0 bajado')
  })

  test('lo medido vale entre sesiones, y lo que Toki cuenta como ahorrado ya usa el factor calibrado', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const archivos = new Map<string, string>()
    const guardado = new Map<string, unknown>([['calibracionEsfuerzo', { [CLAVE]: { candidatos: 9, bajados: { mensajes: 9, pedidos: 9, salida: 1_800 }, testigos: { mensajes: 0, pedidos: 0, salida: 0 } } }]])
    // t2 escribe mucho: así se distingue el factor calibrado de la mitad de la tabla.
    const { vistos } = mundo(on, { archivos, guardado, uso: e => (e.turnId === 't2' ? { output_tokens: 20_000 } : {}) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'high')
    // El décimo candidato, aunque sea el primero de esta sesión: testigo.
    await mensaje($, 't1', RENOMBRA, 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't1')?.effort).toBe('high')
    await mensaje($, 't2', RENOMBRA, 1, 'Listo.', 'high')
    expect(vistos.find(v => v.turnId === 't2')?.effort).toBe('low')
    const celda = { candidatos: 10, bajados: { mensajes: 9, pedidos: 9, salida: 1_800 }, testigos: { mensajes: 1, pedidos: 1, salida: 200 } }
    expect((guardado.get('calibracionEsfuerzo') as Record<string, unknown>)[CLAVE]).toEqual({ ...celda, candidatos: 11, bajados: { mensajes: 10, pedidos: 10, salida: 21_800 } })
    // t2: la salida que no se escribió, con el factor de un testigo que escribió lo mismo (×1.17; no ×1.18, la mitad de la tabla, ni ×1/0.73), a $20 el millón.
    const uso = (await diagnostico(reloj, archivos)).filter(l => l.startsWith('uso: trivial claude-opus-5-5/low')).pop() ?? ''
    const [, real, sin] = /· \$([\d.]+) · sin Toki \$([\d.]+) ·/.exec(uso) ?? []
    const esperado = (20_000 * (factorCalibrado('high', 'low', celda) - 1) * 20) / 1_000_000
    expect(Math.abs(Number(sin) - Number(real) - esperado)).toBeLessThan(0.00015)
  })

  test('lo que bajas tú cuando Toki pregunta no cuenta: ni candidato ni testigo', { options: { recomendarModelo: 'siempre' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const guardado = new Map<string, unknown>()
    const preguntas: string[] = []
    const { vistos } = mundo(on, { guardado, preguntas, respuesta: ls => ls.find(l => l.includes('Opus') && l.includes('· bajo —')) ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'high')
    for (let i = 1; i <= CADA_TESTIGO; i++) await mensaje($, `t${i}`, RENOMBRA, 1, 'Listo.', 'high')
    expect(preguntas.length).toBeGreaterThanOrEqual(CADA_TESTIGO)
    expect(vistos.filter(v => v.turnId !== 't0').map(v => v.effort)).toEqual(Array<string>(CADA_TESTIGO).fill('low'))
    // t0 sí cuenta: Toki lo bajó solo al ver que ibas en alto. Lo simple, que bajaste tú, no.
    expect(Object.keys(guardado.get('calibracionEsfuerzo') ?? {})).toEqual(['claude-opus-5-5|normal|high>medium'])
  })
})

describe('costo por tarea resuelta', () => {
  test('una tarea va de un pedido nuevo al siguiente: lo que costó y sus correcciones van a la semana', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const guardado = new Map<string, unknown>()
    mundo(on, { guardado })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', BOTON, 1, 'Listo.', 'high')
    await mensaje($, 't1', 'no, eso no funciona, sigue fallando', 1, 'Listo.', 'high')
    await mensaje($, 't2', 'dale', 1, 'Listo.', 'high')
    await mensaje($, 't3', COLUMNA, 1, 'Listo.', 'high')
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    const semanas = Object.values((guardado.get('semanas') ?? {}) as Record<string, { tareas: number; tareasUsd: number; tareasCorr: number; gastoUsd: number }>)
    expect(semanas.length).toBe(1)
    const [s] = semanas
    expect(s?.tareas).toBe(2)
    expect(s?.tareasCorr).toBe(1)
    expect(s?.tareasUsd).toBeGreaterThan(0)
    expect(Math.abs((s?.tareasUsd ?? 0) - (s?.gastoUsd ?? 0))).toBeLessThan(1e-9)
  })
})
