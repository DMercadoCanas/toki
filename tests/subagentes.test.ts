import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  DIAS_PRUEBA,
  fueraTtl,
  juntarDias,
  leerEstadoTtl,
  medirPaso,
  PEDIDOS_MINIMOS,
  revisarTtl,
  textoTtl,
  total,
  veredicto,
  versionConTtl,
} from '../hooks/subagentes'
import type { DiasTtl, EstadoTtl, Medida } from '../hooks/subagentes'

// La caché de los subagentes: Toki mide en cada pedido de subagente lo que la caché de 1 hora
// ahorraría (lo que 5 minutos deja vencer) y lo que cuesta de más (cada escritura a 2× en vez
// de 1.25×). Con 200 pedidos en 30 días y un ahorro de 1.15× la prima la propone; puesta, a los
// 14 días la quita si no paga. Primero lo puro, después con el motor.

const MIN = 60_000
const DIA = 86_400_000
const AHORA = 400 * DIA + 12 * 3_600_000
const HOY = String(Math.floor(AHORA / DIA))
const SONNET = 'claude-sonnet-5-5'
/** Sonnet: escribir a 5 min cuesta 2.5 por millón, a 1 h 4, leer 0.1. */
const AHORRO_SONNET = 2.4 / 1_000_000
const PRIMA_SONNET = 1.5 / 1_000_000

/** Igual salvo redondeo. */
function cerca(a: number, b: number, eps = 1e-9): void {
  expect(Math.abs(a - b)).toBeLessThan(eps)
}

function medidaCerca(m: Medida | undefined, esperada: Medida): void {
  expect(m?.pedidos).toBe(esperada.pedidos)
  cerca(m?.ahorro ?? -1, esperada.ahorro)
  cerca(m?.prima ?? -1, esperada.prima)
}

/** Días con lo medido a 5 minutos (`c`) o con la de Toki (`l`), hace `hace` días. */
function dias(...filas: { hace: number; c?: Medida; l?: Medida }[]): DiasTtl {
  return Object.fromEntries(filas.map(f => [String(Math.floor(AHORA / DIA) - f.hace), { ...(f.c ? { c: f.c } : {}), ...(f.l ? { l: f.l } : {}) }]))
}

describe('caché de los subagentes (puro)', () => {
  test('lo guardado se lee con cuidado: lo que no se entiende no cuenta', () => {
    expect(leerEstadoTtl(undefined)).toEqual({ dias: {} })
    expect(leerEstadoTtl('sí')).toEqual({ dias: {} })
    const raro = { dias: { ayer: { c: { pedidos: 1, ahorro: 0, prima: 0 } }, '5': { c: { pedidos: 0, ahorro: 1, prima: 1 }, l: 'x' } }, activa: 'hoy', quitada: { ms: 1, motivo: 'porque' }, avisada: null }
    expect(leerEstadoTtl(raro)).toEqual({ dias: {} })
    const bueno = { dias: { '5': { c: { pedidos: 3, ahorro: 0.1, prima: 0.2 } } }, activa: 7, quitada: { ms: 2, motivo: 'no-paga', neto: -1 }, avisada: 3 }
    expect(leerEstadoTtl(bueno)).toEqual(bueno)
  })

  test('un subagente que vuelve tras 10 minutos reescribió lo que 1 hora habría leído', () => {
    const r = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 0, escrito: 32_000, propia: { ms: AHORA - 10 * MIN, tokens: 30_000 }, regimen: 'c' })
    expect(r.releidos).toBe(30_000)
    medidaCerca(r.medida, { pedidos: 1, ahorro: 30_000 * AHORRO_SONNET, prima: 2_000 * PRIMA_SONNET })
  })

  test('dentro de 5 minutos, o pasada 1 hora, 1 hora no ahorra nada y cobra la prima de todo lo escrito', () => {
    const vivo = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 30_000, escrito: 2_000, propia: { ms: AHORA - 2 * MIN, tokens: 30_000 }, regimen: 'c' })
    expect(vivo.releidos).toBe(0)
    medidaCerca(vivo.medida, { pedidos: 1, ahorro: 0, prima: 2_000 * PRIMA_SONNET })
    const viejo = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 0, escrito: 32_000, propia: { ms: AHORA - 61 * MIN, tokens: 30_000 }, regimen: 'c' })
    expect(viejo.releidos).toBe(0)
    medidaCerca(viejo.medida, { pedidos: 1, ahorro: 0, prima: 32_000 * PRIMA_SONNET })
  })

  test('un fallo del caché con la capa viva no es culpa de los 5 minutos: no cuenta', () => {
    const r = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 0, escrito: 32_000, propia: { ms: AHORA - 2 * MIN, tokens: 30_000 }, regimen: 'c' })
    expect(r.releidos).toBe(0)
  })

  test('otro del mismo tipo 15 minutos después: el comienzo común se habría leído; si uno lo tocó hace poco, ya se leyó', () => {
    const otro = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 0, escrito: 20_500, comun: { ms: AHORA - 15 * MIN, tokens: 20_000 }, regimen: 'c' })
    expect(otro.releidos).toBe(20_000)
    const tibio = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 20_000, escrito: 500, comun: { ms: AHORA - 2 * MIN, tokens: 20_000 }, regimen: 'c' })
    expect(tibio.releidos).toBe(0)
    // Su propia conversación venció, pero el comienzo común seguía vivo: solo cuenta el resto.
    const mitad = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 20_000, escrito: 12_000, propia: { ms: AHORA - 10 * MIN, tokens: 30_000 }, comun: { ms: AHORA - MIN, tokens: 20_000 }, regimen: 'c' })
    expect(mitad.releidos).toBe(10_000)
  })

  test('con la de 1 hora puesta: lo leído que 5 minutos habría dejado vencer, y la prima de todo lo escrito', () => {
    const r = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 30_000, escrito: 2_000, propia: { ms: AHORA - 10 * MIN, tokens: 30_000 }, regimen: 'l' })
    expect(r.releidos).toBe(30_000)
    medidaCerca(r.medida, { pedidos: 1, ahorro: 30_000 * AHORRO_SONNET, prima: 2_000 * PRIMA_SONNET })
    const vivo = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 30_000, escrito: 2_000, propia: { ms: AHORA - 2 * MIN, tokens: 30_000 }, regimen: 'l' })
    expect(vivo.releidos).toBe(0)
    // Lo leído que ninguna capa de 5 a 60 minutos explica no se le acredita.
    const raro = medirPaso({ familia: 'sonnet', ms: AHORA, leido: 30_000, escrito: 2_000, propia: { ms: AHORA - 90 * MIN, tokens: 30_000 }, regimen: 'l' })
    expect(raro.releidos).toBe(0)
  })

  test('el veredicto pide 200 pedidos en 30 días, un ahorro de 1.15× la prima y un neto que valga', () => {
    expect(PEDIDOS_MINIMOS).toBe(200)
    const pocos = dias({ hace: 1, c: { pedidos: 199, ahorro: 10, prima: 1 } })
    expect(veredicto(pocos, AHORA).tipo).toBe('faltan')
    // Lo de hace 30 días o más no cuenta.
    expect(veredicto({ ...pocos, ...dias({ hace: 30, c: { pedidos: 50, ahorro: 10, prima: 1 } }) }, AHORA).tipo).toBe('faltan')
    expect(veredicto({ ...pocos, ...dias({ hace: 29, c: { pedidos: 1, ahorro: 0, prima: 0 } }) }, AHORA).tipo).toBe('conviene')
    expect(veredicto(dias({ hace: 0, c: { pedidos: 250, ahorro: 1.15, prima: 1 } }), AHORA).tipo).toBe('no-conviene')
    expect(veredicto(dias({ hace: 0, c: { pedidos: 250, ahorro: 1.16, prima: 0.6 } }), AHORA).tipo).toBe('conviene')
    expect(veredicto(dias({ hace: 0, c: { pedidos: 250, ahorro: 1.1, prima: 1 } }), AHORA).tipo).toBe('no-conviene')
    // Centavos: no vale el cambio.
    expect(veredicto(dias({ hace: 0, c: { pedidos: 250, ahorro: 0.4, prima: 0.01 } }), AHORA).tipo).toBe('no-conviene')
    // Lo medido con la de Toki no entra en el veredicto.
    expect(veredicto(dias({ hace: 0, l: { pedidos: 250, ahorro: 5, prima: 1 } }), AHORA).tipo).toBe('faltan')
  })

  test('lo guardado y lo nuevo se suman por día; lo de más de 45 días se olvida', () => {
    const guardado = dias({ hace: 1, c: { pedidos: 2, ahorro: 0.5, prima: 0.25 } }, { hace: 46, c: { pedidos: 9, ahorro: 9, prima: 9 } })
    const nuevo = dias({ hace: 1, c: { pedidos: 1, ahorro: 0.25, prima: 0.25 }, l: { pedidos: 1, ahorro: 1, prima: 0 } })
    const juntos = juntarDias(guardado, nuevo, AHORA)
    expect(Object.keys(juntos)).toEqual([String(Math.floor(AHORA / DIA) - 1)])
    expect(total(juntos, 'c', AHORA)).toEqual({ pedidos: 3, ahorro: 0.75, prima: 0.5 })
    expect(total(juntos, 'l', AHORA)).toEqual({ pedidos: 1, ahorro: 1, prima: 0 })
  })

  test('puesta por Toki: a los 14 días, con 200 pedidos y neto negativo, se quita; antes, o pagando, se queda', () => {
    const mala: Medida = { pedidos: 250, ahorro: 1, prima: 2 }
    const recien: EstadoTtl = { dias: dias({ hace: 0, l: mala }), activa: AHORA - (DIAS_PRUEBA * DIA - 1) }
    expect(revisarTtl(recien, AHORA, true)).toEqual({ estado: recien, quitar: false, avisar: false })
    const cumplida: EstadoTtl = { dias: dias({ hace: 0, l: mala }), activa: AHORA - DIAS_PRUEBA * DIA }
    expect(revisarTtl(cumplida, AHORA, true)).toEqual({ estado: { dias: cumplida.dias, quitada: { ms: AHORA, motivo: 'no-paga', neto: -1 } }, quitar: true, avisar: false })
    const pocos: EstadoTtl = { ...cumplida, dias: dias({ hace: 0, l: { ...mala, pedidos: 199 } }) }
    expect(revisarTtl(pocos, AHORA, true).quitar).toBe(false)
    const paga: EstadoTtl = { ...cumplida, dias: dias({ hace: 0, l: { pedidos: 250, ahorro: 2, prima: 1 } }) }
    expect(revisarTtl(paga, AHORA, true).quitar).toBe(false)
    // Lo medido con la de Toki antes de esta activación no cuenta.
    const antes: EstadoTtl = { dias: dias({ hace: 20, l: mala }, { hace: 0, l: { pedidos: 10, ahorro: 0, prima: 0.1 } }), activa: AHORA - 15 * DIA }
    expect(revisarTtl(antes, AHORA, true).quitar).toBe(false)
  })

  test('sin poner: si conviene avisa una vez, con alguien mirando, y nunca si ya la quitaron', () => {
    const conviene: EstadoTtl = { dias: dias({ hace: 0, c: { pedidos: 250, ahorro: 3, prima: 1 } }) }
    expect(revisarTtl(conviene, AHORA, true)).toEqual({ estado: { ...conviene, avisada: AHORA }, quitar: false, avisar: true })
    expect(revisarTtl(conviene, AHORA, false)).toEqual({ estado: conviene, quitar: false, avisar: false })
    expect(revisarTtl({ ...conviene, avisada: 1 }, AHORA, true).avisar).toBe(false)
    expect(revisarTtl({ ...conviene, quitada: { ms: 1, motivo: 'restaurar' } }, AHORA, true).avisar).toBe(false)
  })

  test('lo tuyo gana: la versión, el proveedor, tu ajuste, tu variable o las de la caché de todo', () => {
    const base = { version: '2.1.316', puestaPorToki: false, otras: [], proveedor: false }
    expect(fueraTtl(base)).toBeUndefined()
    expect(versionConTtl('2.1.243')).toBe(true)
    expect(versionConTtl('2.1.280-dev.20260920.t101500.sha1a2b3c4')).toBe(true)
    expect(versionConTtl('3.0.0')).toBe(true)
    expect(fueraTtl({ ...base, version: '2.1.242' })).toEqual({ motivo: 'version' })
    expect(fueraTtl({ ...base, version: undefined })).toEqual({ motivo: 'version' })
    expect(fueraTtl({ ...base, proveedor: true })).toEqual({ motivo: 'proveedor' })
    expect(fueraTtl({ ...base, ajuste: '5m' })).toEqual({ motivo: 'tuya', nombre: 'subagentPromptCacheTtl' })
    expect(fueraTtl({ ...base, variable: '1h' })).toEqual({ motivo: 'tuya', nombre: 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL' })
    expect(fueraTtl({ ...base, variable: '1h', puestaPorToki: true })).toBeUndefined()
    expect(fueraTtl({ ...base, otras: [{ nombre: 'FORCE_PROMPT_CACHING_5M', valor: '1' }] })).toEqual({ motivo: 'tuya', nombre: 'FORCE_PROMPT_CACHING_5M' })
    expect(fueraTtl({ ...base, otras: [{ nombre: 'ENABLE_PROMPT_CACHING_1H', valor: '0' }] })).toBeUndefined()
  })

  test('la sección de /toki-dieta: faltan datos, conviene, no conviene, puesta, quitada y tuya', () => {
    const o = { ahora: AHORA }
    expect(textoTtl({ dias: {} }, o)).toEqual([])
    expect(textoTtl({ dias: dias({ hace: 0, c: { pedidos: 37, ahorro: 0.1, prima: 0.1 } }) }, o)).toEqual([
      'Caché de los subagentes:',
      '  5 minutos, la de Claude Code.',
      '  Toki decide con 200 pedidos de subagentes en 30 días: lleva 37.',
    ])
    expect(textoTtl({ dias: dias({ hace: 0, c: { pedidos: 412, ahorro: 3.2, prima: 1.1 } }) }, o)).toEqual([
      'Caché de los subagentes:',
      '  5 minutos, la de Claude Code.',
      '  En 30 días, 412 pedidos: con 1 hora habrían ahorrado ~$3.20 en reescrituras y pagado ~$1.10 más al escribir (neto ~$2.10).',
      '  /toki-dieta subagentes la pone en 1 hora; Toki la quita si en 14 días no paga.',
    ])
    expect(textoTtl({ dias: dias({ hace: 0, c: { pedidos: 412, ahorro: 0.4, prima: 1.1 } }) }, o)[2]).toBe(
      '  En 30 días, 412 pedidos: con 1 hora habrían ahorrado ~$0.40 en reescrituras y pagado ~$1.10 más al escribir: no conviene.',
    )
    expect(textoTtl({ dias: dias({ hace: 0, l: { pedidos: 250, ahorro: 1, prima: 2 } }), activa: AHORA - 5 * DIA }, o)).toEqual([
      'Caché de los subagentes:',
      '  1 hora, puesta por Toki hace 5 días.',
      '  Desde entonces, 250 pedidos: ahorró ~$1.00 en reescrituras y pagó ~$2.00 más al escribir (neto −$1.00).',
      '  Toki decide en 9 días si se queda.',
      '  /toki-dieta restaurar la vuelve a 5 minutos.',
    ])
    const quitada = textoTtl({ dias: {}, quitada: { ms: AHORA - DIA, motivo: 'no-paga', neto: -0.8 } }, o)
    expect(quitada[2]).toMatch(/^ {2}Toki quitó la de 1 hora el \d+ \S+: costó ~\$0\.80 más de lo que ahorró\.$/)
    expect(textoTtl({ dias: {} }, { ...o, fuera: { motivo: 'tuya', nombre: 'subagentPromptCacheTtl' } })).toEqual([
      'Caché de los subagentes:',
      '  La fija tu configuración (subagentPromptCacheTtl): Toki no la toca.',
    ])
    expect(textoTtl({ dias: dias({ hace: 0, c: { pedidos: 412, ahorro: 3.2, prima: 1.1 } }) }, { ...o, fuera: { motivo: 'version' } })).toEqual([])
    expect(textoTtl({ dias: dias({ hace: 0, c: { pedidos: 412, ahorro: 3.2, prima: 1.1 } }) }, { ...o, idioma: 'en' })[2]).toBe(
      '  In 30 days, 412 requests: with 1 hour they would have saved ~$3.20 in rewrites and paid ~$1.10 more to write (net ~$2.10).',
    )
  })
})

type Mundo = {
  guardado: Map<string, unknown>
  /** Las variables del proceso de Claude Code. */
  env: Map<string, string>
  /** Cada cambio de variable que pidió Toki (undefined: la quitó). */
  puestas: { nombre: string; valor: string | undefined }[]
  toasts: string[]
  logs: string[]
  preguntas: { pregunta: string; opciones: string[] }[]
  /** Lo que Toki anotó en el diagnóstico sobre los subagentes, sin la hora. */
  diagnostico: string[]
}

type Uso = { leido: number; escrito: number }

/**
 * Lo que hay debajo de los plugins: la versión, tu configuración (`ajustes`), las variables,
 * la app mirando y, para cada pedido de subagente, cuánto leyó y escribió del caché (`uso`).
 * `elegir` responde las preguntas con algunas de sus opciones.
 */
function mundo(
  on: On,
  o: { guardado?: Record<string, unknown>; version?: string; ajustes?: Record<string, unknown>; env?: Record<string, string>; uso?: (agente: string) => Uso; elegir?: (opciones: string[]) => string } = {},
): Mundo {
  const m: Mundo = { guardado: new Map(Object.entries(o.guardado ?? {})), env: new Map(Object.entries(o.env ?? {})), puestas: [], toasts: [], logs: [], preguntas: [], diagnostico: [] }
  let agentes = 0
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
  on('session.version', () => ({ value: { version: o.version ?? '2.1.316' } }) as never)
  on('settings.read', () => ({ value: o.ajustes ?? {} }) as never)
  on('env.get', ($, e) => ({ value: m.env.get(e.name) }))
  on('env.set', ($, e) => {
    m.puestas.push({ nombre: e.name, valor: e.value })
    if (e.value === undefined) m.env.delete(e.name)
    else m.env.set(e.name, e.value)
    return { value: {} }
  })
  on('config.list', () => ({ value: [] }) as never)
  on('config.set', ($, e) => ({ value: e.value }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    const linea = (e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, '')
    if (e.path.endsWith('diagnostico.txt') && linea.startsWith('subagentes:')) m.diagnostico.push(linea)
    return { value: undefined }
  })
  on('fs.read', () => ({ deny: 'no existe' }))
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.toast', ($, e) => {
    m.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    m.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'prueba' } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    const opciones = q.options.map(p => p.label)
    m.preguntas.push({ pregunta: q.question, opciones })
    return { result: { questions: [], answers: { [q.question]: o.elegir?.(opciones) ?? opciones[0] ?? '' } } } as never
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: ['desktop'] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 30_000, window: 200_000, percent: 15 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [] }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: `a${++agentes}` }))
  on('turn.step', async function* ($, e) {
    const u = e.agentId !== undefined ? (o.uso?.(e.agentId) ?? { leido: 0, escrito: 0 }) : { leido: 29_000, escrito: 998 }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: u.leido, cache_creation_input_tokens: u.escrito, model: e.model },
    }
  })
  return m
}

type Motor = Parameters<TestBody>[0]

/** Un pedido de un subagente. */
async function pedido($: Motor, agente: string, index: number): Promise<void> {
  const stream = $.turn.step({ turnId: `t-${agente}`, index, model: SONNET, effort: 'medium', messageCount: 2 + index, agentId: agente } as never)
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
}

/** Un mensaje tuyo entero, con un pedido. */
async function mensaje($: Motor, turnId: string): Promise<void> {
  const texto = 'explícame cómo funciona agendar en src/turnos.ts'
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  const usage = { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: 29_000, cache_creation_input_tokens: 998, model: 'claude-opus-5-5' }
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const, usage } as never)
}

async function dieta($: Motor, args = ''): Promise<string> {
  return ((await $.command.run({ command: 'toki-dieta', args } as never)) as { text: string }).text
}

async function lanzar($: Motor, tipo: string): Promise<string> {
  const r = (await $.agent.spawn({ prompt: 'busca dónde se valida el correo', subagentType: tipo, parentModel: 'claude-opus-5-5', model: SONNET } as never)) as { agentId: string }
  return r.agentId
}

const SIN_RUTEO = { options: { recomendarModelo: 'no' } }
const VARIABLE = 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL'
const CONVIENE = { cacheSubagentes: { dias: { [HOY]: { c: { pedidos: 250, ahorro: 3, prima: 1 } } } } }

function estado(m: Mundo): EstadoTtl {
  return leerEstadoTtl(m.guardado.get('cacheSubagentes'))
}

describe('caché de los subagentes con el motor', () => {
  test('mide cada pedido de subagente: la pausa larga y el del mismo tipo que vuelve; un subagente sin tipo no comparte', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const usos: Record<string, Uso[]> = { a1: [{ leido: 0, escrito: 20_000 }, { leido: 0, escrito: 21_000 }], a2: [{ leido: 0, escrito: 20_500 }], otro: [{ leido: 0, escrito: 20_000 }] }
    const m = mundo(on, { uso: agente => usos[agente]?.shift() ?? { leido: 0, escrito: 0 } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const a1 = await lanzar($, 'Explore')
    await pedido($, a1, 0)
    await reloj.advance(10 * MIN)
    await pedido($, a1, 1)
    await reloj.advance(15 * MIN)
    const a2 = await lanzar($, 'Explore')
    expect([a1, a2]).toEqual(['a1', 'a2'])
    await pedido($, a2, 0)
    // Sin agent.spawn no se sabe su tipo: no comparte el comienzo con nadie.
    await pedido($, 'otro', 0)
    expect(m.guardado.get('cacheSubagentes')).toBeUndefined()
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    const c = estado(m).dias[HOY]?.c
    medidaCerca(c, { pedidos: 4, ahorro: 40_000 * AHORRO_SONNET, prima: (20_000 + 1_000 + 500 + 20_000) * PRIMA_SONNET })
    expect(m.puestas).toEqual([])
  })

  test('cuando conviene avisa una vez, tras un mensaje; /toki-dieta lo cuenta y pregunta si la pone', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: CONVIENE, elegir: opciones => opciones[0] ?? '' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.toasts.filter(t => t.includes('caché de 1 hora'))).toEqual([])
    await mensaje($, 't0')
    await mensaje($, 't1')
    expect(m.toasts.filter(t => t.includes('caché de 1 hora'))).toEqual(['Toki: con caché de 1 hora tus subagentes habrían ahorrado ~$2.00 en 30 días. Míralo en /toki-dieta.'])
    expect(estado(m).avisada).toBe(AHORA)
    expect(m.diagnostico).toEqual(['subagentes: conviene la caché de 1 h (250 pedidos, ahorro ~$3.00, prima ~$1.00)'])
    const texto = await dieta($)
    expect(texto).toContain(
      [
        'Caché de los subagentes:',
        '  5 minutos, la de Claude Code.',
        '  En 30 días, 250 pedidos: con 1 hora habrían ahorrado ~$3.00 en reescrituras y pagado ~$1.00 más al escribir (neto ~$2.00).',
        '  /toki-dieta subagentes la pone en 1 hora; Toki la quita si en 14 días no paga.',
      ].join('\n'),
    )
    await reloj.advance(1_000)
    expect(m.preguntas).toEqual([{ pregunta: '¿Lo arreglo ahora, de forma reversible?', opciones: ['Caché de 1 h para subagentes', 'Ahora no'] }])
    await reloj.advance(100)
    expect(m.puestas).toEqual([{ nombre: VARIABLE, valor: '1h' }])
    expect(estado(m).activa).toBeGreaterThanOrEqual(AHORA + 1_000)
    expect(m.logs.some(l => l.startsWith('Listo: tus subagentes usan caché de 1 hora desde ahora'))).toBe(true)
  })

  test('puesta, el pedido de subagente se cobra a 1 hora y sin Toki habría reescrito lo que ella dejó leer', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const usos: Uso[] = [
      { leido: 0, escrito: 20_000 },
      { leido: 20_000, escrito: 1_000 },
    ]
    const m = mundo(on, { uso: () => usos.shift() ?? { leido: 0, escrito: 0 } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(await dieta($, 'subagentes')).toBe(
      'Listo: tus subagentes usan caché de 1 hora desde ahora, en todas tus sesiones con Toki. Toki la sigue midiendo y la vuelve a 5 minutos si en 14 días no paga; /toki-dieta restaurar lo hace ya.',
    )
    expect(await dieta($, 'subagentes')).toBe('Tus subagentes ya usan caché de 1 hora. /toki-dieta restaurar la vuelve a 5 minutos.')
    const a1 = await lanzar($, 'general-purpose')
    await pedido($, a1, 0)
    await reloj.advance(10 * MIN)
    await pedido($, a1, 1)
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    medidaCerca(estado(m).dias[HOY]?.l, { pedidos: 2, ahorro: 20_000 * AHORRO_SONNET, prima: 21_000 * PRIMA_SONNET })
    // A 1 hora el primero costó $0.03 más; el segundo leyó 20k que sin Toki se habrían reescrito.
    cerca(Number(m.guardado.get('ahorroUsdTotal')), 0.0165, 1e-6)
  })

  test('al empezar otro proceso, si la activaste y paga, la vuelve a poner', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const buena = mundo(on, { guardado: { cacheSubagentes: { dias: { [HOY]: { l: { pedidos: 250, ahorro: 2, prima: 1 } } }, activa: AHORA - 20 * DIA } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(buena.puestas).toEqual([{ nombre: VARIABLE, valor: '1h' }])
    expect(estado(buena).activa).toBe(AHORA - 20 * DIA)
  })

  test('tras recargar el plugin, sin session.start, desde tu siguiente mensaje sigue midiendo con la de 1 hora', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const usos: Uso[] = [
      { leido: 0, escrito: 20_000 },
      { leido: 20_000, escrito: 1_000 },
    ]
    const m = mundo(on, { guardado: { cacheSubagentes: { dias: {}, activa: AHORA - DIA } }, env: { [VARIABLE]: '1h' }, uso: () => usos.shift() ?? { leido: 0, escrito: 0 } })
    await mensaje($, 't0')
    const a1 = await lanzar($, 'Explore')
    await pedido($, a1, 0)
    await reloj.advance(10 * MIN)
    await pedido($, a1, 1)
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    medidaCerca(estado(m).dias[HOY]?.l, { pedidos: 2, ahorro: 20_000 * AHORRO_SONNET, prima: 21_000 * PRIMA_SONNET })
    expect(m.env.get(VARIABLE)).toBe('1h')
  })

  test('a los 14 días, con 200 pedidos y neto negativo, no la pone: la quita y avisa', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { cacheSubagentes: { dias: { [HOY]: { l: { pedidos: 250, ahorro: 1, prima: 1.8 } } }, activa: AHORA - 15 * DIA } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.puestas).toEqual([])
    expect(estado(m).activa).toBeUndefined()
    expect(estado(m).quitada?.motivo).toBe('no-paga')
    cerca(estado(m).quitada?.neto ?? 0, -0.8)
    expect(m.toasts).toContain('Toki volvió a 5 minutos la caché de tus subagentes: en 14 días costó ~$0.80 más de lo que ahorró.')
    expect(m.diagnostico).toEqual(['subagentes: caché de 1 h quitada, costó ~$0.80 más de lo que ahorró'])
    expect(await dieta($)).toContain('Toki quitó la de 1 hora el')
  })

  test('/toki-dieta restaurar la vuelve a 5 minutos', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await dieta($, 'subagentes')
    expect(m.env.get(VARIABLE)).toBe('1h')
    expect(await dieta($, 'restaurar')).toBe('La caché de tus subagentes vuelve a 5 minutos desde ahora.')
    expect(m.env.has(VARIABLE)).toBe(false)
    expect(estado(m).quitada).toEqual({ ms: AHORA, motivo: 'restaurar' })
    expect(await dieta($, 'restaurar')).toBe('Nada que restaurar: Toki no tiene MCP bajo demanda, respaldos de memoria ni caché de 1 hora en los subagentes.')
  })

  test('si la fijas tú, Toki no la toca ni la mide, y suelta la suya', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { cacheSubagentes: { dias: {}, activa: AHORA - DIA } }, ajustes: { subagentPromptCacheTtl: '5m' }, uso: () => ({ leido: 0, escrito: 20_000 }) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(m.puestas).toEqual([])
    expect(estado(m).quitada?.motivo).toBe('tuya')
    expect(m.diagnostico).toEqual(['subagentes: la caché la fija subagentPromptCacheTtl; Toki suelta la suya'])
    await pedido($, 'a9', 0)
    await reloj.advance(10 * MIN)
    await pedido($, 'a9', 1)
    await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
    expect(estado(m).dias).toEqual({})
    expect(await dieta($, 'subagentes')).toBe('La fija tu configuración (subagentPromptCacheTtl): Toki no la toca.')
    expect(await dieta($)).toContain('Caché de los subagentes:\n  La fija tu configuración (subagentPromptCacheTtl): Toki no la toca.')
    expect(m.puestas).toEqual([])
  })

  test('si la fija tu variable, Toki no la pone', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const tuya = mundo(on, { env: { [VARIABLE]: '5m' } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(await dieta($, 'subagentes')).toBe(`La fija tu configuración (${VARIABLE}): Toki no la toca.`)
    expect(tuya.puestas).toEqual([])
  })

  test('con una versión vieja de Claude Code dice desde cuál se puede', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { version: '2.1.200' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(await dieta($, 'subagentes')).toBe('Esta versión de Claude Code no deja elegir la caché de los subagentes (desde la 2.1.243).')
    expect(m.puestas).toEqual([])
  })

  test('con Bedrock no cambia la caché de los subagentes', SIN_RUTEO, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { env: { CLAUDE_CODE_USE_BEDROCK: '1' } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    expect(await dieta($, 'subagentes')).toBe('Con Bedrock, Vertex o Foundry Toki no cambia la caché de los subagentes.')
    expect(m.puestas).toEqual([])
  })
})
