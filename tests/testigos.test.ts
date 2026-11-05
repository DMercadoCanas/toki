import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { textosEntrevista } from '../hooks/entrevista'
import { textosGenerados } from '../hooks/generados'
import { avisoMapa, RUTA_MAPA } from '../hooks/mapa'
import { fecha } from '../hooks/semana'
import {
  anotarTarea,
  CADA,
  comparar,
  DIAS_RONDA,
  elegir,
  INTERVENCIONES,
  leerTestigos,
  lineaCierre,
  reanudar,
  tCritico,
  TESTIGOS_MINIMOS,
  textoTestigos,
  txTestigos,
  vence,
  veredicto,
} from '../hooks/testigos'
import type { Cierre, Grupo, Ronda, Testigos } from '../hooks/testigos'

// Testigos de cada ayuda: 1 de cada tantas tareas va sin ella y Toki compara. Primero lo puro, después con el motor.

const DIA = 86_400_000
const AHORA = Date.UTC(2026, 10, 5, 15)
const x = txTestigos('es')

/** Un brazo con estas tareas: lo que costó cada una y cuántas veces la corregiste. */
function grupo(usd: number[], corr: number[] = usd.map(() => 0)): Grupo {
  const suma = (v: number[]): number => v.reduce((a, b) => a + b, 0)
  return { tareas: usd.length, usd: suma(usd), usd2: suma(usd.map(u => u * u)), corr: suma(corr), corr2: suma(corr.map(c => c * c)) }
}

/** `n` tareas alrededor de `media`: la mitad un poco más caras y la otra mitad un poco menos. */
function tareas(n: number, media: number, salto = 0.01): number[] {
  return Array.from({ length: n }, (_, k) => media + (k % 2 === 0 ? salto : -salto))
}

function ronda(con: Grupo, testigos: Grupo, extra: Partial<Ronda> = {}): Ronda {
  return { desde: AHORA - 10 * DIA, elegibles: con.tareas + testigos.tareas, con, testigos, ...extra }
}

function cierre(r: { cierre?: Cierre }): Cierre {
  if (r.cierre === undefined) throw new Error('la ronda no cerró')
  return r.cierre
}

describe('elegir los testigos', () => {
  test('a 1 de cada CADA tareas elegibles le toca ir sin la ayuda: de a 10 compactar, de a 4 las demás', () => {
    expect(CADA).toEqual({ compactacion: 10, generados: 4, mapa: 4, explore: 4, entrevista: 4 })
    const testigos = (i: 'compactacion' | 'generados', n: number): { t: Testigos; cuales: number[] } => {
      let t: Testigos = {}
      const cuales: number[] = []
      for (let k = 0; k < n; k++) {
        const r = elegir(t, i, AHORA, true)
        expect(r.medido).toBe(true)
        if (r.ayuda === 'testigo') cuales.push(k)
        t = r.testigos
      }
      return { t, cuales }
    }
    const compactar = testigos('compactacion', 20)
    expect(compactar.cuales).toEqual([9, 19])
    expect(compactar.t.compactacion).toEqual({ desde: AHORA, elegibles: 20, con: grupo([]), testigos: grupo([]) })
    expect(testigos('generados', 8).cuales).toEqual([3, 7])
  })

  test('fuera de una tarea la ayuda va sin contar; con la ronda cerrada, también; en pausa no va', () => {
    expect(elegir({}, 'mapa', AHORA, false)).toEqual({ testigos: {}, ayuda: 'si', medido: false })
    const cerrada = ronda(grupo([1]), grupo([1]), { cerrada: AHORA - DIA })
    expect(elegir({ mapa: cerrada }, 'mapa', AHORA, true)).toEqual({ testigos: { mapa: cerrada }, ayuda: 'si', medido: false })
    const pausada = { ...cerrada, pausada: true }
    expect(elegir({ mapa: pausada }, 'mapa', AHORA, true)).toEqual({ testigos: { mapa: pausada }, ayuda: 'pausa', medido: false })
    expect(elegir({ mapa: pausada }, 'mapa', AHORA, false).ayuda).toBe('pausa')
  })
})

describe('anotar lo que costó cada tarea', () => {
  test('cada tarea suma a su brazo lo que costó, sus correcciones y sus cuadrados; sin ronda no suma', () => {
    expect(anotarTarea({}, 'explore', 'con', { usd: 1, correcciones: 1 }, AHORA)).toEqual({ testigos: {} })
    let t: Testigos = { explore: ronda(grupo([]), grupo([])) }
    t = anotarTarea(t, 'explore', 'con', { usd: 0.5, correcciones: 2 }, AHORA).testigos
    t = anotarTarea(t, 'explore', 'con', { usd: 0.25, correcciones: 0 }, AHORA).testigos
    t = anotarTarea(t, 'explore', 'testigo', { usd: 0.125, correcciones: 1 }, AHORA).testigos
    // Lo negativo o roto cuenta como cero.
    t = anotarTarea(t, 'explore', 'testigo', { usd: -3, correcciones: Number.NaN }, AHORA).testigos
    expect(t.explore?.con).toEqual({ tareas: 2, usd: 0.75, usd2: 0.3125, corr: 2, corr2: 4 })
    expect(t.explore?.testigos).toEqual({ tareas: 2, usd: 0.125, usd2: 0.015625, corr: 1, corr2: 1 })
    expect(t.explore?.cerrada).toBeUndefined()
  })

  test('con el testigo número 30 la ronda cierra; si la ayuda salió más cara, queda en pausa y ya no suma', () => {
    // Con la ayuda las tareas cuestan ~$0.50; sin ella, ~$0.20.
    const r = anotarTarea({ mapa: ronda(grupo(tareas(60, 0.5)), grupo(tareas(29, 0.2))) }, 'mapa', 'testigo', { usd: 0.2, correcciones: 0 }, AHORA)
    expect(r.testigos.mapa).toMatchObject({ cerrada: AHORA, pausada: true })
    expect(r.testigos.mapa?.testigos.tareas).toBe(30)
    expect(cierre(r).pausada).toBe(true)
    expect(veredicto(cierre(r).comparacion)).toBe('cuesta')
    expect(anotarTarea(r.testigos, 'mapa', 'testigo', { usd: 9, correcciones: 0 }, AHORA + 1).testigos).toEqual(r.testigos)
  })

  test('si ahorra o todavía no se nota, cierra sin pausa; si la corriges más con ella, se pausa', () => {
    const ahorra = anotarTarea({ explore: ronda(grupo(tareas(60, 0.2)), grupo(tareas(29, 0.5))) }, 'explore', 'testigo', { usd: 0.5, correcciones: 0 }, AHORA)
    expect(veredicto(cierre(ahorra).comparacion)).toBe('ahorra')
    expect(cierre(ahorra).pausada).toBe(false)
    expect(ahorra.testigos.explore?.cerrada).toBe(AHORA)
    expect(ahorra.testigos.explore?.pausada).toBeUndefined()
    const igual = anotarTarea({ explore: ronda(grupo(tareas(60, 0.3, 0.2)), grupo(tareas(29, 0.3, 0.2))) }, 'explore', 'testigo', { usd: 0.3, correcciones: 0 }, AHORA)
    expect(veredicto(cierre(igual).comparacion)).toBe('igual')
    expect(cierre(igual).pausada).toBe(false)
    // Cuesta lo mismo, pero con la entrevista la corriges dos veces más por tarea.
    const corrige = anotarTarea(
      { entrevista: ronda(grupo(tareas(60, 0.3), tareas(60, 2, 1)), grupo(tareas(29, 0.3), tareas(29, 0, 0))) },
      'entrevista',
      'testigo',
      { usd: 0.3, correcciones: 0 },
      AHORA,
    )
    expect(veredicto(cierre(corrige).comparacion)).toBe('igual')
    expect(cierre(corrige).pausada).toBe(true)
    expect(corrige.testigos.entrevista?.pausada).toBe(true)
  })
})

describe('comparar', () => {
  test('desde 10 testigos: la diferencia de medias con el intervalo de Welch', () => {
    const con = [0.4, 0.5, 0.6, 0.45, 0.55, 0.5]
    const sin = [0.2, 0.3, 0.25, 0.35, 0.15, 0.3, 0.2, 0.25, 0.3]
    expect(comparar(ronda(grupo(con), grupo(sin))).extra).toBeUndefined()
    const sin10 = [...sin, 0.25]
    const c = comparar(ronda(grupo(con), grupo(sin10)))
    const media = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length
    const varianza = (v: number[]): number => v.reduce((a, b) => a + (b - media(v)) ** 2, 0) / (v.length - 1)
    const va = varianza(con) / con.length
    const vb = varianza(sin10) / sin10.length
    const gl = (va + vb) ** 2 / (va ** 2 / (con.length - 1) + vb ** 2 / (sin10.length - 1))
    const margen = tCritico(gl) * Math.sqrt(va + vb)
    const d = media(con) - media(sin10)
    expect(c.con).toEqual({ tareas: 6, usd: media(con), correcciones: 0 })
    expect(Math.abs((c.extra?.media ?? 0) - d)).toBeLessThan(1e-12)
    expect(Math.abs((c.extra?.bajo ?? 0) - (d - margen))).toBeLessThan(1e-9)
    expect(Math.abs((c.extra?.alto ?? 0) - (d + margen))).toBeLessThan(1e-9)
    expect(veredicto(c)).toBe('cuesta')
    // Sin ninguna corrección en ningún brazo: no hay diferencia que medir.
    expect(c.correcciones).toEqual({ media: 0, bajo: 0, alto: 0 })
  })

  test('el valor crítico de la t: 2.26 con 9 grados de libertad, 2.04 con 30 y 1.96 con muchos', () => {
    expect(Math.abs(tCritico(9) - 2.262)).toBeLessThan(0.005)
    expect(Math.abs(tCritico(30) - 2.042)).toBeLessThan(0.002)
    expect(Math.abs(tCritico(1e6) - 1.96)).toBeLessThan(0.001)
  })

  test('veredicto: solo si el intervalo entero cae de un lado', () => {
    const base = { con: { tareas: 30, usd: 0, correcciones: 0 }, testigos: { tareas: 10, usd: 0, correcciones: 0 } }
    expect(veredicto(base)).toBe('midiendo')
    expect(veredicto({ ...base, extra: { media: -0.2, bajo: -0.3, alto: -0.1 } })).toBe('ahorra')
    expect(veredicto({ ...base, extra: { media: 0.2, bajo: 0.1, alto: 0.3 } })).toBe('cuesta')
    expect(veredicto({ ...base, extra: { media: 0.05, bajo: -0.1, alto: 0.2 } })).toBe('igual')
  })
})

describe('lo guardado', () => {
  test('se valida, y una ronda cerrada vence a los 90 días: se mide de nuevo', () => {
    const buena = ronda(grupo([0.5, 0.25]), grupo([0.125]))
    expect(leerTestigos(undefined, AHORA)).toEqual({})
    expect(leerTestigos('x', AHORA)).toEqual({})
    expect(leerTestigos({ compactacion: buena, mapa: { ...buena, con: { tareas: -1 } }, otra: buena }, AHORA)).toEqual({ compactacion: buena })
    // Una pausa sin cierre no vale.
    expect(leerTestigos({ explore: { ...buena, pausada: true } }, AHORA)).toEqual({ explore: buena })
    const cerrada = { ...buena, cerrada: AHORA - (DIAS_RONDA - 1) * DIA, pausada: true }
    expect(leerTestigos({ explore: cerrada }, AHORA)).toEqual({ explore: cerrada })
    expect(vence(cerrada)).toBe(AHORA + DIA)
    expect(leerTestigos({ explore: cerrada }, AHORA + DIA)).toEqual({})
  })

  test('reanudar quita las rondas en pausa, y nada más', () => {
    const pausada = ronda(grupo([1]), grupo([1]), { cerrada: AHORA, pausada: true })
    const cerrada = ronda(grupo([1]), grupo([1]), { cerrada: AHORA })
    const abierta = ronda(grupo([1]), grupo([1]))
    expect(reanudar({ generados: pausada, mapa: cerrada, explore: abierta, compactacion: pausada })).toEqual({ testigos: { mapa: cerrada, explore: abierta }, reanudadas: ['compactacion', 'generados'] })
    expect(reanudar({ mapa: cerrada })).toEqual({ testigos: { mapa: cerrada }, reanudadas: [] })
  })
})

describe('textos', () => {
  test('/toki-por-que: con pocos testigos, cuántos lleva; desde 10, las medias y lo que se sabe', () => {
    expect(textoTestigos({})).toEqual([])
    expect(textoTestigos({ mapa: ronda(grupo([]), grupo([])) })).toEqual([])
    const pocos: Testigos = { generados: ronda(grupo([0.5, 0.4, 0.3]), grupo([0.2])) }
    expect(textoTestigos(pocos)).toEqual([x.titulo, `  ${x.nombre.generados}: ${x.pocos(1, 3, 4)}`])
    expect(x.pocos(1, 3, 4)).toBe(`1 testigo y 3 tareas con ella (1 de cada 4 va sin ella); compara desde ${TESTIGOS_MINIMOS} testigos.`)
    const ahorra = textoTestigos({ compactacion: ronda(grupo(tareas(40, 0.3)), grupo(tareas(10, 0.5))) })
    expect(ahorra[1]).toBe('  Compactar salidas: con ella $0.30 por tarea y 0.0 correcciones; sin ella $0.50 y 0.0 (10 testigos).')
    expect(ahorra[2]).toMatch(/^ {4}Ahorra \$0\.20 por tarea \(entre \$0\.\d\d y \$0\.\d\d\)\.$/)
    const hasta = fecha(AHORA + DIAS_RONDA * DIA, 'es')
    const pausada = textoTestigos({ mapa: ronda(grupo(tareas(40, 0.5)), grupo(tareas(30, 0.2)), { cerrada: AHORA, pausada: true }) })
    expect(pausada[1]).toBe(`  Nota del mapa: en pausa hasta el ${hasta}; con ella $0.50 por tarea y 0.0 correcciones; sin ella $0.20 y 0.0 (30 testigos).`)
    expect(pausada[2]).toMatch(/^ {4}Cuesta \$0\.30 más por tarea \(entre \$0\.\d\d y \$0\.\d\d\)\. \/toki-por-que reanudar la vuelve a usar\.$/)
    const igual = textoTestigos({ explore: ronda(grupo(tareas(40, 0.3, 0.2)), grupo(tareas(30, 0.3, 0.2), tareas(30, 1)), { cerrada: AHORA }) })
    expect(igual[2]?.startsWith('    Aún no se nota la diferencia: $0.00 por tarea, entre −$0.')).toBe(true)
    expect(igual[2]?.endsWith(`Con ella la corriges menos. Toki vuelve a medir el ${hasta}.`)).toBe(true)
  })

  test('en inglés, y los textos existen en los dos idiomas', () => {
    const en = txTestigos('en')
    expect(textoTestigos({ generados: ronda(grupo([0.5, 0.4, 0.3]), grupo([0.2])) }, { idioma: 'en' })).toEqual([
      en.titulo,
      '  Holding back generated files: 1 control and 3 tasks with it (1 in 4 goes without it); compares from 10 controls on.',
    ])
    expect(Object.keys(en).sort()).toEqual(Object.keys(x).sort())
    for (const i of INTERVENCIONES) {
      expect(x.nombre[i].length).toBeGreaterThan(0)
      expect(en.nombre[i].length).toBeGreaterThan(0)
    }
    expect(x.reanudadas(['A', 'B'])).toBe('Listo: Toki vuelve a usar «A» y «B», y las mide de nuevo con testigos.')
    expect(en.reanudadas(['A'])).toBe('Done: Toki uses “A” again, and measures it anew with controls.')
  })

  test('la línea del diagnóstico al cerrar una ronda', () => {
    const r = anotarTarea({ mapa: ronda(grupo(tareas(60, 0.5)), grupo(tareas(29, 0.2))) }, 'mapa', 'testigo', { usd: 0.2, correcciones: 0 }, AHORA)
    const linea = lineaCierre('mapa', cierre(r), AHORA)
    expect(linea.startsWith('testigos: ronda de mapa cerrada (cuesta, +$0.30 por tarea [+$0.')).toBe(true)
    expect(linea.endsWith(`correcciones 0.0 contra 0.0); en pausa hasta el ${fecha(AHORA + DIAS_RONDA * DIA, 'es')}`)).toBe(true)
  })
})

// ---------- Con el motor ----------

type Mundo = {
  guardado: Map<string, unknown>
  archivos: Map<string, string>
  toasts: string[]
  /** Lo que Toki agregó a cada mensaje tuyo como contexto. */
  contextos: (readonly string[] | undefined)[]
  /** Las líneas que Toki anotó en .claude/toki/diagnostico.txt, sin la hora. */
  diagnostico: string[]
  /** Los archivos que Claude Code leyó de verdad (con el límite, si lo hubo). */
  lecturas: string[]
  /** Lo que dio cada corrida de un comando, sin Toki. */
  salidas: string[]
}

type Motor = Parameters<TestBody>[0]

function letras(i: number): string {
  return String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
}

/** 400 tests que pasan, cada línea distinta: Toki la compacta. Cada corrida tarda distinto (no es una salida repetida). */
function salidaLarga(corrida: number): string {
  const lineas = ['> app@1.0.0 test', '> vitest run']
  for (let i = 0; i < 400; i++) lineas.push(`  ✓ caso-${letras(i)} calcula el total de la factura`)
  lineas.push('Tests  400 passed (400)', `Duration  ${corrida}.20s`)
  return lineas.join('\n')
}

/** `contexto`: el tamaño de la conversación que dice cada pedido (Toki sugiere Explore solo en una grande). */
function mundo(on: On, o: { guardado?: Record<string, unknown>; archivos?: Record<string, string>; contexto?: number } = {}): Mundo {
  // Aquí no corre prompt.compose: el aviso de las respuestas breves por nota ya se dio.
  const m: Mundo = {
    guardado: new Map(Object.entries({ avisoSinSeccionDado: true, ...o.guardado })),
    archivos: new Map(Object.entries(o.archivos ?? {})),
    toasts: [],
    contextos: [],
    diagnostico: [],
    lecturas: [],
    salidas: [],
  }
  const contexto = o.contexto ?? 30_000
  // El motor resuelve las rutas: una relativa sembrada por la prueba vale desde cualquier carpeta.
  const archivo = (ruta: string): string | undefined => m.archivos.get(ruta) ?? [...m.archivos].find(([k]) => !k.startsWith('/') && ruta.endsWith(`/${k}`))?.[1]
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
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', ($, e) => ({ value: archivo(e.path) !== undefined }))
  on('fs.write', ($, e) => {
    m.archivos.set(e.path, e.text)
    if (e.path.endsWith('diagnostico.txt')) m.diagnostico.push((e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, ''))
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const texto = archivo(e.path)
    return texto === undefined ? { deny: 'no existe' } : { value: texto }
  })
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
  on('config.list', () => ({ value: [] }) as never)
  on('config.set', ($, e) => ({ value: e.value }))
  on('settings.read', () => ({ value: {} }) as never)
  on('session.version', () => ({ value: { version: '2.1.316' } }) as never)
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: contexto, window: 1_000_000, percent: 10 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => {
    m.contextos.push(e.context)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [] }))
  on('prompt.fill', () => ({ isFilled: true }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.classify', () => ({ value: undefined }) as never)
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 2, output_tokens: 200, cache_read_input_tokens: contexto - 1_000, cache_creation_input_tokens: 998, model: e.model },
    }
  })
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', { tool: 'Bash' }, () => {
    const stdout = salidaLarga(m.salidas.length + 1)
    m.salidas.push(stdout)
    return { result: { stdout, stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Read' }, ($, e) => {
    const entrada = e as unknown as { file_path: string; limit?: number }
    m.lecturas.push(entrada.limit === undefined ? entrada.file_path : `${entrada.file_path}:${entrada.limit}`)
    return { result: 'x'.repeat(5_000) } as never
  })
  on('tool.call', { tool: /^Grep$/ }, () => ({ result: 'x'.repeat(5_000) }) as never)
  return m
}

/** Un mensaje tuyo con su turno: `durante`, lo que Claude hace entre el primer pedido y el segundo. */
async function mensaje($: Motor, turnId: string, texto: string, durante?: () => Promise<unknown>): Promise<void> {
  await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: texto, turnId })
  for (const index of [0, 1]) {
    const stream = $.turn.step({ turnId, index, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 + index })
    for await (const _ of stream) {
      // Sin trozos.
    }
    await stream.result
    if (index === 0) await durante?.()
  }
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const } as never)
}

async function bash($: Motor, comando: string): Promise<string> {
  const r = await $.tool.call({ tool: 'Bash', command: comando } as never)
  return (r.result as { stdout: string }).stdout
}

async function porQue($: Motor, args = ''): Promise<string> {
  return ((await $.command.run({ command: 'toki-por-que', args } as never)) as { text: string }).text
}

async function terminar($: Motor): Promise<void> {
  await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
}

/** Lo que va de esta semana: lo gastado y lo que costaron las tareas ya cerradas. */
function semana(m: Mundo): { gastoUsd: number; tareasUsd: number } {
  const s = Object.values((m.guardado.get('semanas') ?? {}) as Record<string, { gastoUsd?: number; tareasUsd?: number }>)[0]
  return { gastoUsd: s?.gastoUsd ?? 0, tareasUsd: s?.tareasUsd ?? 0 }
}

function testigosDe(m: Mundo): Testigos {
  return leerTestigos(m.guardado.get('testigos'), AHORA)
}

/** Una ronda recién empezada a la que le toca un testigo en la próxima tarea elegible. */
function tocaTestigo(i: keyof typeof CADA): Ronda {
  return { desde: AHORA - DIA, elegibles: CADA[i] - 1, con: grupo([]), testigos: grupo([]) }
}

const OPCIONES = { options: { idioma: 'es', recomendarModelo: 'no' } }
const BOTON = 'agrega un botón de exportar a CSV en la tabla de pacientes'
const COLUMNA = 'agrega una columna con la fecha de nacimiento en la tabla de pacientes'
const CORRECCION = 'no, eso no funciona, sigue fallando'
const PROYECTO = 'quiero construir una app para gestionar las citas de mi clínica con recordatorios por WhatsApp'
const GIMNASIO = 'crea una aplicación de reservas para un gimnasio con pagos mensuales y clases grupales'

describe('testigos con el motor', () => {
  test('compactar: la tarea de testigo ve la salida entera; al cerrarla, lo que costó desde ahí y sus correcciones van a la ronda', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { compactacion: tocaTestigo('compactacion') } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const salidas: string[] = []
    await mensaje($, 't0', BOTON, async () => {
      salidas.push(await bash($, 'npm test'))
      salidas.push(await bash($, 'npm test -- --run'))
    })
    // Toda la tarea va sin compactar, y se cuenta una sola vez.
    expect(salidas).toEqual(m.salidas)
    expect(testigosDe(m).compactacion?.elegibles).toBe(10)
    expect(m.diagnostico).toContain('testigos: compactacion sin tocar en esta tarea (1 de cada 10)')
    expect(await porQue($)).toContain(x.motivo.testigo(10))
    const gastoPrimero = semana(m).gastoUsd
    await mensaje($, 't1', CORRECCION)
    // La tarea siguiente cierra la de testigo: va con la ayuda.
    await mensaje($, 't2', COLUMNA, async () => {
      salidas.push(await bash($, 'npm test'))
    })
    expect(salidas[2]).toContain('[Toki] Salida compactada')
    const r = testigosDe(m).compactacion
    expect(r?.elegibles).toBe(11)
    expect(r?.testigos).toMatchObject({ tareas: 1, corr: 1 })
    expect(r?.con.tareas).toBe(0)
    // Cuenta desde que la ayuda pudo actuar: lo de antes en ese mensaje no, todo lo que siguió sí.
    const { tareasUsd } = semana(m)
    expect(r?.testigos.usd ?? 0).toBeLessThan(tareasUsd)
    expect(r?.testigos.usd ?? 0).toBeGreaterThan(tareasUsd - gastoPrimero)
    await terminar($)
    expect(testigosDe(m).compactacion?.con).toMatchObject({ tareas: 1, corr: 0 })
  })

  test('fuera de una tarea la ayuda va, sin contar', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { compactacion: tocaTestigo('compactacion') } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    expect(await bash($, 'npm test')).toContain('[Toki] Salida compactada')
    await mensaje($, 't0', 'dale', async () => {
      expect(await bash($, 'npm test')).toContain('[Toki] Salida compactada')
    })
    expect(testigosDe(m).compactacion?.elegibles).toBe(9)
  })

  test('archivos generados: en la tarea de testigo pasan enteros; en la siguiente, se frenan', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { generados: tocaTestigo('generados') } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const negadas: (string | undefined)[] = []
    const leer = async (ruta: string): Promise<void> => {
      negadas.push((await $.tool.call({ tool: 'Read', file_path: ruta } as never)).deny)
    }
    await mensaje($, 't0', BOTON, async () => {
      await leer('/p/package-lock.json')
      await leer('/p/package-lock.json')
    })
    expect(negadas).toEqual([undefined, undefined])
    expect(m.lecturas).toEqual(['/p/package-lock.json', '/p/package-lock.json'])
    expect(m.toasts).not.toContain(textosGenerados.es.toast('package-lock.json'))
    await mensaje($, 't1', COLUMNA, () => leer('/p/yarn.lock'))
    expect(negadas[2]).toContain('Toki')
    expect(m.lecturas).toHaveLength(2)
    const r = testigosDe(m).generados
    expect(r?.elegibles).toBe(5)
    expect(r?.testigos.tareas).toBe(1)
  })

  test('la nota del mapa: de testigo queda para otra tarea', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { mapa: tocaTestigo('mapa') } }, archivos: { [RUTA_MAPA]: '# Mapa' } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const notas: string[] = []
    const buscar = async (patron: string): Promise<void> => {
      notas.push(((await $.tool.call({ tool: 'Grep', pattern: patron } as never)).context ?? []).join('\n'))
    }
    await mensaje($, 't0', BOTON, () => buscar('total'))
    expect(notas).toEqual([''])
    expect(testigosDe(m).mapa?.elegibles).toBe(4)
    await mensaje($, 't1', COLUMNA, () => buscar('suma'))
    expect(notas[1]).toContain(avisoMapa('es'))
    expect(testigosDe(m).mapa?.testigos.tareas).toBe(1)
  })

  test('el aviso de delegar a Explore: de testigo no sale en toda la tarea', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { explore: tocaTestigo('explore') } }, contexto: 120_000 })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    const notas: string[] = []
    await mensaje($, 't0', BOTON, async () => {
      for (const entrada of [
        { tool: 'Grep', pattern: 'total' },
        { tool: 'Read', file_path: 'a.py' },
        { tool: 'Grep', pattern: 'suma' },
        { tool: 'Read', file_path: 'b.py' },
        { tool: 'Read', file_path: 'c.py' },
        { tool: 'Read', file_path: 'd.py' },
      ]) {
        notas.push(((await $.tool.call(entrada as never)).context ?? []).join('\n'))
      }
    })
    expect(notas.join('\n')).not.toContain('Explore')
    expect(m.diagnostico).toContain('testigos: explore sin tocar en esta tarea (1 de cada 4)')
    await terminar($)
    expect(testigosDe(m).explore).toMatchObject({ elegibles: 4, testigos: { tareas: 1 } })
  })

  test('la entrevista: de testigo el pedido grande va sin instrucción, y se mide en la tarea que abre', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { entrevista: tocaTestigo('entrevista') } } })
    const xe = textosEntrevista.es
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', PROYECTO)
    expect(m.contextos[0]?.join('\n') ?? '').not.toContain('AskUserQuestion')
    expect(m.toasts).not.toContain(xe.aviso)
    expect(m.diagnostico).toContain('testigos: entrevista sin tocar en esta tarea (1 de cada 4)')
    await mensaje($, 't1', CORRECCION)
    await mensaje($, 't2', GIMNASIO)
    expect(m.contextos[2]?.join('\n')).toContain('AskUserQuestion')
    expect(m.toasts).toContain(xe.aviso)
    expect(testigosDe(m).entrevista).toMatchObject({ elegibles: 5, testigos: { tareas: 1, corr: 1 }, con: { tareas: 0 } })
    expect(testigosDe(m).entrevista?.testigos.usd).toBeGreaterThan(0)
    await terminar($)
    expect(testigosDe(m).entrevista?.con.tareas).toBe(1)
  })

  test('un pedido grande que no abre tarea lleva la entrevista, sin contar', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, { guardado: { testigos: { entrevista: tocaTestigo('entrevista') } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Siete palabras: la entrevista lo toma por grande; la tarea pide ocho.
    await mensaje($, 't0', 'crea una app de citas con recordatorios')
    expect(m.contextos[0]?.join('\n')).toContain('AskUserQuestion')
    expect(testigosDe(m).entrevista?.elegibles).toBe(3)
  })

  test('una ronda que cierra con la ayuda peor la pausa y lo avisa; en pausa la salida va entera; reanudar la devuelve', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    // 29 testigos baratos y 100 tareas caras con la ayuda: al testigo 30, compactar sale peor.
    const ronda29: Ronda = { desde: AHORA - 30 * DIA, elegibles: 129, con: grupo(tareas(100, 0.5)), testigos: grupo(tareas(29, 0.002, 0.001)) }
    const m = mundo(on, { guardado: { testigos: { compactacion: ronda29 } } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: false })
    await mensaje($, 't0', BOTON, async () => {
      expect(await bash($, 'npm test')).toBe(m.salidas[0])
    })
    const salidas: string[] = []
    await mensaje($, 't1', COLUMNA, async () => {
      salidas.push(await bash($, 'npm test'))
    })
    const hasta = fecha(AHORA + DIAS_RONDA * DIA, 'es')
    expect(m.toasts).toContain(x.aviso(x.nombre.compactacion, hasta, 30))
    expect(m.diagnostico.some(l => l.startsWith('testigos: ronda de compactacion cerrada (cuesta, ') && l.endsWith(`en pausa hasta el ${hasta}`))).toBe(true)
    expect(testigosDe(m).compactacion).toMatchObject({ cerrada: AHORA, pausada: true, elegibles: 130 })
    // En pausa: sin compactar, y /toki-por-que dice por qué y cómo volver.
    expect(salidas).toEqual([m.salidas[1]])
    const texto = await porQue($)
    expect(texto).toContain(x.motivo.pausa)
    expect(texto).toContain(textoTestigos(testigosDe(m)).join('\n'))
    expect(texto).toContain(`  ${x.nombre.compactacion}: en pausa hasta el ${hasta}; `)
    expect(texto).toContain(x.reanudar)
    expect(await porQue($, 'reanudar')).toBe(x.reanudadas([x.nombre.compactacion]))
    // Vuelve ya, en esta misma tarea, con una ronda nueva.
    expect(await bash($, 'npm test')).toContain('[Toki] Salida compactada')
    expect(testigosDe(m).compactacion).toMatchObject({ desde: AHORA, elegibles: 1 })
    expect(await porQue($, 'reanudar')).toBe(x.nadaEnPausa)
    expect(m.diagnostico).toContain('testigos: compactacion reanudada con /toki-por-que reanudar')
  })
})
