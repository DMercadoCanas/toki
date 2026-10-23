import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { textosEntrevista } from '../hooks/entrevista'

// Cómo cierra Toki el turno de un pedido con entrevista: cortado no cuenta, y las preguntas de Toki no son las de Claude.

const x = textosEntrevista.es
const PROYECTO = 'quiero construir una app para gestionar las citas de mi clínica con recordatorios por WhatsApp'

type Motor = Parameters<TestBody>[0]

/** Lo que Toki anotó en .claude/toki/diagnostico.txt sobre la entrevista, sin la hora. */
function mundo(on: On): string[] {
  const diagnostico: string[] = []
  mock.store(on)
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    const linea = (e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, '')
    if (e.path.endsWith('diagnostico.txt') && linea.startsWith('entrevista:')) diagnostico.push(linea)
    return { value: undefined }
  })
  on('fs.read', () => ({ deny: 'no existe' }))
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'prueba' } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 30_000, window: 1_000_000, percent: 3 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
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
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: 29_000, cache_creation_input_tokens: 998, model: e.model },
    }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    return { result: { questions: [], answers: { [q.question]: q.options[0]?.label ?? '' } } } as never
  })
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  return diagnostico
}

/** Un mensaje tuyo y su turno; `fin` dice cómo termina (por defecto, Claude responde). */
async function mensaje($: Motor, turnId: string, texto: string, o: { durante?: () => Promise<unknown>; fin?: 'answer' | 'aborted' | 'error' } = {}): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  await o.durante?.()
  const fin = o.fin ?? 'answer'
  await $.turn.complete({ answer: fin === 'answer' ? 'Listo.' : '', durationMs: 1000, isAborted: fin === 'aborted', turnId, reason: fin } as never)
}

async function escribe($: Motor, id: string): Promise<string> {
  const r = (await $.tool.check({ tool: 'Write', input: { file_path: '/p/app.ts', content: 'x' }, tool_use_id: id } as never)) as { decision: string; reason?: string }
  return r.decision === 'deny' ? `deny: ${r.reason ?? ''}` : r.decision
}

function pregunta($: Motor, header: string, question: string): Promise<unknown> {
  const options = [
    { label: 'Sí', description: 'Seguir' },
    { label: 'No', description: 'Parar' },
  ]
  return $.tool.call({ tool: 'AskUserQuestion', questions: [{ question, header, options, multiSelect: false }] } as never)
}

async function estado($: Motor): Promise<string> {
  return ((await $.command.run({ command: 'toki-entrevista', args: '' } as never)) as { text: string }).text
}

describe('el turno de la entrevista', () => {
  test('lo interrumpes antes de que Claude pregunte: no cuenta, y el turno siguiente no frena', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const diagnostico = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    let visto = ''
    await mensaje($, 't0', PROYECTO, { durante: async () => (visto = await escribe($, 'u1')), fin: 'aborted' })
    expect(visto).toBe(`deny: ${x.frenada}`)
    let siguiente = ''
    await mensaje($, 't1', 'dale', { durante: async () => (siguiente = await escribe($, 'u2')) })
    expect(siguiente).toBe('allow')
    await reloj.settle()
    expect(diagnostico).toEqual(['entrevista: proyecto', 'entrevista: frenó Write antes de preguntar', 'entrevista: interrumpida · frenó 1'])
    const r = await estado($)
    expect(r).toContain('Con entrevista: 0 pedidos')
    expect(r).toContain('Sin entrevista: 0 pedidos')
  })

  test('si Claude ya preguntó, interrumpirlo después igual cuenta como con entrevista', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const diagnostico = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROYECTO, { durante: () => pregunta($, 'Alcance', '¿Qué alcance tiene la primera versión?'), fin: 'aborted' })
    await reloj.settle()
    expect(diagnostico).toEqual(['entrevista: proyecto', 'entrevista: hecha'])
    expect(await estado($)).toContain('Con entrevista: 1 pedido')
  })

  test('un error corta el turno: se anota y no cuenta', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const diagnostico = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROYECTO, { fin: 'error' })
    await reloj.settle()
    expect(diagnostico).toEqual(['entrevista: proyecto', 'entrevista: turno cortado (error)'])
    expect(await estado($)).toContain('Sin entrevista: 0 pedidos')
  })

  test('una pregunta de Toki en medio del turno no es la entrevista: sigue frenando', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const diagnostico = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const vistos: string[] = []
    await mensaje($, 't0', PROYECTO, {
      durante: async () => {
        await pregunta($, 'Toki', 'Toki: ¿sigo?')
        vistos.push(await escribe($, 'u1'))
        await pregunta($, 'Alcance', '¿Qué alcance tiene la primera versión?')
        vistos.push(await escribe($, 'u2'))
      },
    })
    expect(vistos).toEqual([`deny: ${x.frenada}`, 'allow'])
    await reloj.settle()
    expect(diagnostico).toEqual(['entrevista: proyecto', 'entrevista: frenó Write antes de preguntar', 'entrevista: hecha · frenó 1'])
  })

  test('las consultas (sin id de llamada) y los subagentes no se frenan', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    const vistos: string[] = []
    await mensaje($, 't0', PROYECTO, {
      durante: async () => {
        const consulta = (await $.tool.check({ tool: 'Write', input: { file_path: '/p/app.ts', content: 'x' } })) as { decision: string }
        vistos.push(consulta.decision)
        const sub = (await $.tool.check({ tool: 'Write', input: { file_path: '/p/app.ts', content: 'x' }, tool_use_id: 'u9', agentId: 'a1' } as never)) as { decision: string }
        vistos.push(sub.decision)
      },
    })
    expect(vistos).toEqual(['allow', 'allow'])
  })
})
