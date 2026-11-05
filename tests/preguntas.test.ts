import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { RUTA_SPEC } from '../hooks/entrevista'
import { estaVacia, instruccionesDeCompactacion, notaPostCompactacion, vacio } from '../hooks/memoria'
import { nivelHeuristico } from '../hooks/modelo'
import {
  comprobacionesDe,
  contarRespuesta,
  criterioDeSpec,
  esLaTarea,
  esRaizDeProyecto,
  estaCallada,
  leerEstadoPreguntas,
  opcionesDonde,
  opcionesFallos,
  opcionesListo,
  partirTareas,
  pideDonde,
  pideListo,
  textosPreguntas,
} from '../hooks/preguntas'

// Preguntas justo a tiempo: primero lo puro, después cada pregunta con el motor.

const x = textosPreguntas.es

function lectura(texto: string): { texto: string; nivel: ReturnType<typeof nivelHeuristico>['nivel']; motivo: string } {
  const l = nivelHeuristico(texto)
  return { texto, nivel: l.nivel, motivo: l.motivo }
}

const LOGIN = 'arregla el error que hace que el login falle cuando el nombre del usuario lleva tildes'
const REDONDEO = 'arregla el redondeo en src/facturas/total.ts cuando el total tiene tres decimales'
const TRES = [
  'En la app de facturas:',
  '1. Arregla el redondeo de los totales cuando hay tres decimales',
  '2. Agrega un botón para exportar las facturas a CSV',
  '3. Actualiza el README con los pasos de instalación',
  '',
  'Al final corre las pruebas.',
].join('\n')

describe('callarse tras rechazos (puro)', () => {
  test('dos «no» seguidos la callan una vez; un sí en medio reinicia la cuenta', () => {
    let r = contarRespuesta({}, 'donde', false)
    expect(r.seCallo).toBe(false)
    r = contarRespuesta(r.estado, 'donde', true)
    r = contarRespuesta(r.estado, 'donde', false)
    expect(r.seCallo).toBe(false)
    r = contarRespuesta(r.estado, 'donde', false)
    expect(r.seCallo).toBe(true)
    expect(estaCallada(r.estado, 'donde')).toBe(true)
    expect(estaCallada(r.estado, 'listo')).toBe(false)
    // Ya callada: otro «no» no se anuncia de nuevo.
    expect(contarRespuesta(r.estado, 'donde', false).seCallo).toBe(false)
  })

  test('lo guardado se lee aunque venga roto', () => {
    expect(leerEstadoPreguntas(undefined)).toEqual({})
    expect(leerEstadoPreguntas('x')).toEqual({})
    expect(leerEstadoPreguntas({ donde: { rechazos: 2, callada: true }, listo: 'x', goal: { rechazos: -3 }, otra: {} })).toEqual({ donde: { rechazos: 2, callada: true }, goal: { rechazos: 0 } })
  })
})

describe('cuándo preguntar (puro)', () => {
  test('(a) dónde: algo nuevo que cambiar o averiguar, sin decir dónde', () => {
    expect(pideDonde({ ...lectura(LOGIN), nueva: true })).toBe(true)
    expect(pideDonde({ ...lectura('investiga por qué falla el botón de pagar cuando el carrito tiene más de diez productos'), nueva: true })).toBe(true)
    // Con el archivo, en medio de la misma tarea, una corrección o algo corto: no.
    expect(pideDonde({ ...lectura(REDONDEO), nueva: true })).toBe(false)
    expect(pideDonde({ ...lectura(LOGIN), nueva: false })).toBe(false)
    expect(pideDonde({ ...lectura('sigue fallando el login cuando el nombre del usuario lleva tildes'), nueva: true })).toBe(false)
    expect(pideDonde({ ...lectura('arregla el login'), nueva: true })).toBe(false)
    // Un proyecto nuevo no tiene dónde buscar.
    expect(pideDonde({ ...lectura('quiero construir una app para gestionar las citas de mi clínica con recordatorios'), nueva: true })).toBe(false)
  })

  test('(b) cómo sabremos que quedó: un cambio que no dice cómo comprobarlo', () => {
    expect(pideListo(lectura(REDONDEO))).toBe(true)
    expect(pideListo(lectura(`${REDONDEO} y corre los tests para comprobar que pasan`))).toBe(false)
    expect(pideListo(lectura('dale'))).toBe(false)
    expect(pideListo(lectura('no, eso no es lo que pedí: el redondeo debe ser a dos decimales siempre'))).toBe(false)
  })

  test('la raíz de un proyecto, no tu carpeta personal', () => {
    expect(esRaizDeProyecto(['.git', 'src'])).toBe(true)
    expect(esRaizDeProyecto(['Cargo.toml', 'src'])).toBe(true)
    expect(esRaizDeProyecto(['Facturas.sln'])).toBe(true)
    expect(esRaizDeProyecto(['Documents', 'Downloads', 'Desktop'])).toBe(false)
  })
})

describe('las opciones (puro)', () => {
  test('(a) las carpetas que más pesan, primero las que nombras', () => {
    const carpetas = [
      { ruta: 'src', peso: 40 },
      { ruta: 'tests', peso: 12 },
      { ruta: 'docs', peso: 3 },
      { ruta: 'scripts', peso: 5 },
    ]
    expect(opcionesDonde(carpetas, LOGIN)).toEqual(['src/', 'tests/', 'scripts/'])
    expect(opcionesDonde(carpetas, 'actualiza la guía de instalación que está en docs')).toEqual(['docs/', 'src/', 'tests/'])
    const adentro = [
      { ruta: 'src/ui', peso: 30 },
      { ruta: 'src/auth', peso: 20 },
      { ruta: 'src/pagos', peso: 8 },
    ]
    expect(opcionesDonde(adentro, 'el cobro con tarjeta falla en la parte de pagos')[0]).toBe('src/pagos/')
  })

  test('(b) lo que el proyecto ya sabe correr, según sus archivos', () => {
    const pkg = JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .', build: 'vite build', dev: 'vite' } })
    expect(comprobacionesDe(['package.json', 'pnpm-lock.yaml'], n => (n === 'package.json' ? pkg : undefined))).toEqual(['pnpm test', 'pnpm run lint', 'pnpm run build'])
    // El test de relleno de npm init no cuenta.
    const init = JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
    expect(comprobacionesDe(['package.json'], n => (n === 'package.json' ? init : undefined))).toEqual([])
    const archivos: Record<string, string> = { Makefile: 'build:\n\tgo build\ntest:\n\tgo test ./...\nVAR := 1\n', 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-q"\n' }
    expect(comprobacionesDe(['Makefile', 'pyproject.toml', 'Cargo.toml', 'go.mod'], n => archivos[n])).toEqual(['make test', 'pytest', 'cargo test', 'go test ./...'])
    // Sin esos archivos no se inventa nada.
    expect(comprobacionesDe(['README.md', 'src'], () => undefined)).toEqual([])
  })

  test('(b) hasta tres, la primera recomendada', () => {
    expect(opcionesListo(['pnpm test', 'pnpm run lint', 'pnpm run build', 'pnpm run check'], x)).toEqual([
      { etiqueta: 'Que pase pnpm test (Recomendado)', criterio: 'que pase `pnpm test`' },
      { etiqueta: 'Que pase pnpm run lint', criterio: 'que pase `pnpm run lint`' },
      { etiqueta: 'Que pase pnpm run build', criterio: 'que pase `pnpm run build`' },
    ])
  })

  test('(c) con mucho contexto, empezar en limpio primero; sin la tarea, no hay pedido mejorado', () => {
    expect(opcionesFallos(120_000, true)).toEqual(['limpio', 'causa', 'seguir'])
    expect(opcionesFallos(20_000, true)).toEqual(['causa', 'limpio', 'seguir'])
    expect(opcionesFallos(120_000, false)).toEqual(['causa', 'seguir'])
  })
})

describe('separar tareas (puro)', () => {
  test('tres tareas con su verbo: cada una con lo de antes y lo de después de la lista', () => {
    const t = partirTareas(TRES)
    expect(t?.map(p => p.tarea)).toEqual([
      'Arregla el redondeo de los totales cuando hay tres decimales',
      'Agrega un botón para exportar las facturas a CSV',
      'Actualiza el README con los pasos de instalación',
    ])
    expect(t?.[1]?.mensaje).toBe('En la app de facturas:\nAgrega un botón para exportar las facturas a CSV\nAl final corre las pruebas.')
  })

  test('el detalle de una tarea va con ella; en inglés también', () => {
    const conDetalle = ['- arregla el login con tildes', '  - pasa en Safari', '- agrega el modo oscuro al panel', '- Pagos: documenta la API nueva de cobros'].join('\n')
    const t = partirTareas(conDetalle)
    expect(t?.[0]?.tarea).toBe('arregla el login con tildes pasa en Safari')
    expect(t).toHaveLength(3)
    const en = ['- fix the rounding of totals with three decimals', '- add a button to export invoices as CSV', '- update the README with the install steps'].join('\n')
    expect(partirTareas(en)).toHaveLength(3)
  })

  test('requisitos de una sola cosa, dos tareas, un proyecto nuevo o avisos de la app: no se parte', () => {
    expect(partirTareas(['Crea una API de citas con:', '- autenticación con token', '- paginación de 20 en 20', '- respuestas en JSON'].join('\n'))).toBeUndefined()
    expect(partirTareas('- arregla el login con tildes\n- agrega el modo oscuro al panel')).toBeUndefined()
    const nuevo = ['Quiero construir una app para mi clínica:', '- crea el registro de pacientes con su historial', '- agrega recordatorios de citas por correo', '- genera un reporte mensual de ingresos'].join('\n')
    expect(partirTareas(nuevo)).toBeUndefined()
    expect(partirTareas(`<task-notification>listo</task-notification>\n${TRES}`)).toBeUndefined()
  })

  test('la tarea que Toki dejó en el cuadro se reconoce aunque la retoques', () => {
    const tarea = 'Agrega un botón para exportar las facturas a CSV'
    expect(esLaTarea('En la app de facturas: Agrega un botón para exportar las facturas a CSV Al final corre las pruebas.', tarea)).toBe(true)
    expect(esLaTarea('agrega un botón para exportar las facturas a csv y a excel', tarea)).toBe(true)
    expect(esLaTarea('el botón no aparece', tarea)).toBe(false)
  })
})

describe('el criterio de listo del spec (puro)', () => {
  test('la línea «Listo cuando», «Done when» o los puntos bajo un título así', () => {
    expect(criterioDeSpec('# Pedido\nExportar facturas a CSV.\nListo cuando: el CSV abre en Excel con tildes y pasan las pruebas.')).toBe('el CSV abre en Excel con tildes y pasan las pruebas.')
    expect(criterioDeSpec('- **Done when:** `npm test` passes and the export button shows up')).toBe('`npm test` passes and the export button shows up')
    expect(criterioDeSpec('## Criterios de aceptación\n\n- El botón exporta a CSV\n- Las tildes se ven bien\n\n## Notas\n- nada')).toBe('El botón exporta a CSV; Las tildes se ven bien')
    expect(criterioDeSpec('# Pedido\nSolo el resumen, sin criterio.')).toBeUndefined()
    expect(criterioDeSpec(`Listo cuando: ${'x'.repeat(400)}`)?.length).toBe(300)
  })
})

describe('lo que va a la compactación (puro)', () => {
  test('el criterio y lo que pediste no olvidar van al resumen y a la nota; el énfasis, solo al resumen', () => {
    const p = { ...vacio(0), tareaActual: 'exporta las facturas a CSV', listo: 'que pase `pnpm test`', fijado: ['nunca toques la carpeta legacy'], enfasis: ['reglas' as const] }
    const ins = instruccionesDeCompactacion(p, 'es')
    expect(ins).toContain('Cómo se sabrá que quedó: que pase `pnpm test`')
    expect(ins).toContain('Lo que la persona pidió no olvidar: «nunca toques la carpeta legacy»')
    expect(ins).toContain('al pie de la letra')
    const nota = notaPostCompactacion(p, 'es')
    expect(nota).toContain('Listo cuando: que pase `pnpm test`')
    expect(nota).toContain('No olvidar (lo pidió la persona): nunca toques la carpeta legacy')
    expect(nota).not.toContain('al pie de la letra')
    expect(estaVacia({ ...vacio(0), fijado: ['x'] })).toBe(false)
  })
})

// ---------- Con el motor ----------

type Mundo = {
  toasts: string[]
  preguntas: string[]
  etiquetas: string[][]
  /** El contexto de cada mensaje que llegó a Claude, unido ('' sin contexto). */
  contextos: string[]
  entrados: string[]
  fills: string[]
  comandos: { command: string; args: string }[]
  /** Las instrucciones de cada compactación. */
  instrucciones: (string | undefined)[]
  diagnostico: string[]
  /** Lo que hay en el cuadro de texto. */
  cuadro: string
}

/** Las entradas de cada carpeta ('' es la raíz); las carpetas terminan en '/'. */
type Arbol = Record<string, string[]>

const PROYECTO: Arbol = {
  '': ['.git/', 'src/', 'tests/', 'docs/', 'node_modules/', 'README.md'],
  src: ['auth/', 'pagos/', 'ui/', 'index.ts', 'app.ts'],
  tests: ['auth.test.ts', 'pagos.test.ts', 'ui.test.ts'],
  docs: ['guia.md'],
  node_modules: Array.from({ length: 50 }, (_, i) => `paquete${i}/`),
}

/** El motor resuelve las rutas contra la carpeta donde corren las pruebas: se reconocen por cómo terminan (sin clave, la raíz). */
function claveDe(ruta: unknown, claves: readonly string[]): string | undefined {
  const r = String(ruta ?? '').replace(/\\/g, '/').replace(/\/$/, '')
  return claves.filter(k => k !== '' && (r === k || r.endsWith(`/${k}`))).sort((a, b) => b.length - a.length)[0]
}

/** Las preguntas de la ruta (con qué modelo va un mensaje, el plan en Sonnet) no son de estas pruebas. */
const DE_LA_RUTA = /^Toki: (?:este mensaje|el plan está listo)/

/**
 * `respuesta`: lo que eliges ante cada pregunta de Toki (por defecto, la primera opción);
 * undefined la cierra sin responder.
 */
function mundo(on: On, o: { arbol?: Arbol; archivos?: Record<string, string>; tokens?: number; ventana?: number; respuesta?: (etiquetas: string[], pregunta: string) => string | undefined } = {}): Mundo {
  const m: Mundo = { toasts: [], preguntas: [], etiquetas: [], contextos: [], entrados: [], fills: [], comandos: [], instrucciones: [], diagnostico: [], cuadro: '' }
  const tokens = (): number => o.tokens ?? 30_000
  mock.store(on, { avisoSinSeccionDado: true })
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    if (e.path.endsWith('diagnostico.txt')) m.diagnostico.push((e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, ''))
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const k = claveDe(e.path, Object.keys(o.archivos ?? {}))
    const texto = k === undefined ? undefined : o.archivos?.[k]
    return texto === undefined ? { deny: 'no existe' } : { value: texto }
  })
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', ($, e) => {
    const nombres = o.arbol?.[claveDe(e.path, Object.keys(o.arbol ?? {})) ?? ''] ?? []
    return { value: nombres.map(n => ({ name: n.replace(/\/$/, ''), kind: n.endsWith('/') ? ('dir' as const) : ('file' as const), size: 10, mtimeMs: 0, isLink: false })) }
  })
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
  on('command.run', ($, e) => {
    m.comandos.push({ command: e.command, args: e.args })
    return { text: '' } as never
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: tokens(), window: o.ventana ?? 1_000_000, percent: 10 }, rateLimits: [] } }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.compact', ($, e) => {
    m.instrucciones.push(e.instructions)
    return { messages: [{ role: 'user', text: 'Resumen de lo anterior.', toolUses: [] }], tokensBefore: 200_000, tokensAfter: 20_000 } as never
  })
  on('prompt.submit', ($, e) => {
    m.entrados.push(e.text)
    m.contextos.push((e.context ?? []).join('\n'))
    m.cuadro = ''
    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: m.cuadro, cursor: 0 } }) as never)
  on('prompt.fill', ($, e) => {
    m.fills.push(e.text)
    m.cuadro = e.text
    return { isFilled: true } as never
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
  on('tool.call', ($, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ok' } as never
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    const ls = q.options.map(op => op.label)
    if (DE_LA_RUTA.test(q.question)) return { result: { questions: [], answers: { [q.question]: ls[0] ?? '' } } } as never
    m.preguntas.push(q.question)
    m.etiquetas.push(ls)
    const elegida = o.respuesta === undefined ? ls[0] : o.respuesta(ls, q.question)
    if (elegida === undefined) return { deny: 'cerrada' }
    return { result: { questions: [], answers: { [q.question]: elegida } } } as never
  })
  on('agent.spawn', ($, e) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  return m
}

type Motor = Parameters<TestBody>[0]

/** Manda un mensaje como lo haría la persona; si Toki lo frena, no hay turno. */
async function mensaje($: Motor, turnId: string, texto: string, o: { durante?: () => Promise<unknown>; respuesta?: string } = {}): Promise<unknown> {
  const r = await $.prompt.submit({ text: texto, wait: false, origin: { kind: 'composer' } } as never)
  if (r !== null && typeof r === 'object' && 'drop' in r) return r
  await $.turn.start({ text: texto, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos.
  }
  await stream.result
  await o.durante?.()
  await $.turn.complete({ answer: o.respuesta ?? 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })
  return r
}

/** Una compactación de la conversación (deja al menos un mensaje). */
function compactar($: Motor, trigger: 'manual' | 'auto', instructions?: string): Promise<unknown> {
  return $.session.compact({ trigger, ...(instructions !== undefined ? { instructions } : {}), messages: [{ role: 'user', text: 'Lo de antes.', toolUses: [] }] } as never)
}

async function limpiar($: Motor, m: Mundo): Promise<void> {
  m.cuadro = ''
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
}

describe('(a) dónde buscar, con el motor', () => {
  test('una tarea nueva sin dónde: las carpetas del proyecto, y Claude recibe la que elegiste', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: PROYECTO, respuesta: ls => ls.find(l => l === 'src/') })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', LOGIN)
    expect(m.preguntas).toEqual([x.donde.pregunta])
    // Sin node_modules ni ocultas; las que más pesan primero.
    expect(m.etiquetas[0]).toEqual(['src/', 'tests/', 'docs/', x.donde.buscaClaude])
    expect(m.contextos[0]).toContain(x.donde.nota('src/'))
    expect(m.entrados[0]).toBe(LOGIN)
    // Preguntó: no hay consejo encima.
    expect(m.toasts.some(t => t.startsWith('Tip de Toki'))).toBe(false)
    expect(m.diagnostico).toContain('pregunta donde: sí')
  })

  test('fuera de un proyecto, o con pocas carpetas, no pregunta: queda el consejo', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: { '': ['Documents/', 'Downloads/', 'Desktop/', 'Music/'] } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', LOGIN)
    expect(m.preguntas).toEqual([])
    expect(m.toasts.some(t => t.startsWith('Tip de Toki: nombra el archivo'))).toBe(true)
  })

  test('todo en src/: pregunta por las carpetas de adentro', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: { '': ['.git/', 'src/', 'package.json'], src: ['auth/', 'pagos/', 'ui/', 'main.ts'], 'src/auth': ['a.ts', 'b.ts'], 'src/pagos': ['p.ts'], 'src/ui': ['x.tsx', 'y.tsx', 'z.tsx'] } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', LOGIN)
    // «login» no nombra ninguna: van por peso.
    expect(m.etiquetas[0]).toEqual(['src/ui/', 'src/auth/', 'src/pagos/', x.donde.buscaClaude])
  })

  test('dos «que Claude lo busque» seguidos: se calla, lo dice, y tampoco vuelve como consejo', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: PROYECTO, respuesta: () => x.donde.buscaClaude })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', LOGIN)
    await limpiar($, m)
    await mensaje($, 't1', 'arregla el error que hace que el pago falle cuando la tarjeta del usuario es extranjera')
    expect(m.preguntas).toHaveLength(2)
    expect(m.toasts).toContain(x.callada(x.nombre.donde))
    await limpiar($, m)
    await mensaje($, 't2', 'arregla el error que hace que el registro falle cuando el correo del usuario lleva mayúsculas')
    expect(m.preguntas).toHaveLength(2)
    expect(m.toasts.some(t => t.startsWith('Tip de Toki: nombra el archivo'))).toBe(false)
    // /toki-entrevista lo muestra, y con auto vuelve.
    const estado = ((await $.command.run({ command: 'toki-entrevista', args: '' } as never)) as { text: string }).text
    expect(estado).toContain(`calladas: ${x.nombre.donde}`)
    await $.command.run({ command: 'toki-entrevista', args: 'auto' } as never)
    await limpiar($, m)
    await mensaje($, 't3', LOGIN)
    expect(m.preguntas).toHaveLength(3)
  })

  test('cerrar la pregunta cuenta como un no, y tu mensaje sigue igual', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: PROYECTO, respuesta: () => undefined })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', LOGIN)
    expect(m.entrados).toEqual([LOGIN])
    expect(m.contextos[0]).toBe('')
    expect(m.diagnostico).toContain('pregunta donde: no')
  })
})

const PKG = JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' } })
const CON_PRUEBAS: Arbol = { '': ['.git/', 'src/', 'package.json', 'pnpm-lock.yaml'], src: ['facturas/'] }

describe('(b) cómo sabremos que quedó, con el motor', () => {
  test('lo que el proyecto sabe correr, la primera recomendada; Claude recibe el criterio una vez por tarea', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: CON_PRUEBAS, archivos: { 'package.json': PKG } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', REDONDEO)
    expect(m.preguntas).toEqual([x.listo.pregunta])
    expect(m.etiquetas[0]).toEqual(['Que pase pnpm test (Recomendado)', 'Que pase pnpm run lint', x.listo.yo])
    expect(m.contextos[0]).toContain(x.listo.nota('que pase `pnpm test`'))
    // Otro mensaje de la misma tarea: no pregunta de nuevo, ni da el consejo de verificar.
    await mensaje($, 't1', 'también arregla el redondeo de los impuestos en src/facturas/total.ts con tres decimales')
    expect(m.preguntas).toHaveLength(1)
    expect(m.toasts.some(t => t.startsWith('Tip de Toki: dile cómo comprobar'))).toBe(false)
  })

  test('lo que escribes es el criterio, y la compactación lo conserva', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: CON_PRUEBAS, archivos: { 'package.json': PKG }, respuesta: () => 'el total de 10,555 debe dar 10,56' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', REDONDEO)
    expect(m.contextos[0]).toContain(x.listo.nota('el total de 10,555 debe dar 10,56'))
    await compactar($, 'auto')
    expect(m.instrucciones[0]).toContain('Cómo se sabrá que quedó: el total de 10,555 debe dar 10,56')
  })

  test('sin nada que correr, el consejo de siempre', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: { '': ['.git/', 'src/'] } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', REDONDEO)
    expect(m.preguntas).toEqual([])
    expect(m.toasts.some(t => t.startsWith('Tip de Toki: dile cómo comprobar'))).toBe(true)
  })
})

describe('(c) cómo seguir tras dos correcciones, con el motor', () => {
  test('con poco contexto, buscar la causa va primero y Claude recibe la nota', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'arregla el error de redondeo en el cálculo de totales de la factura')
    await mensaje($, 't1', 'sigue fallando el redondeo')
    expect(m.preguntas).toEqual([])
    const r = await mensaje($, 't2', 'no, eso no es lo que pedí: el redondeo debe ser a dos decimales')
    expect(r).not.toHaveProperty('drop')
    expect(m.preguntas[0]).toBe(x.fallos.pregunta(undefined))
    expect(m.etiquetas[0]).toEqual([x.recomendado(x.fallos.opcion.causa), x.fallos.opcion.limpio, x.fallos.opcion.seguir])
    expect(m.contextos[2]).toContain(x.fallos.nota)
  })

  test('«seguir aquí» no deja nota', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { respuesta: () => x.fallos.opcion.seguir })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'arregla el error de redondeo en el cálculo de totales de la factura')
    await mensaje($, 't1', 'sigue fallando el redondeo')
    await mensaje($, 't2', 'no, eso no es lo que pedí: el redondeo debe ser a dos decimales')
    expect(m.preguntas).toHaveLength(1)
    expect(m.contextos[2]).toBe('')
    expect(m.diagnostico).toContain('pregunta fallos: no')
  })
})

describe('(d) un mensaje con varias tareas, con el motor', () => {
  test('una por una: va la primera, y al terminar cada una la siguiente queda en el cuadro', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', TRES)
    expect(m.preguntas).toEqual([x.tareas.pregunta(3)])
    expect(m.etiquetas[0]).toEqual([x.recomendado(x.tareas.una), x.tareas.todas])
    expect(m.entrados[0]).toBe('En la app de facturas:\nArregla el redondeo de los totales cuando hay tres decimales\nAl final corre las pruebas.')
    expect(m.contextos[0]).toContain(x.tareas.nota(1, 3))
    await reloj.advance(600)
    expect(m.cuadro).toBe('En la app de facturas:\nAgrega un botón para exportar las facturas a CSV\nAl final corre las pruebas.')
    expect(m.toasts).toContain(x.tareas.enCuadro(2, 3))
    await mensaje($, 't1', m.cuadro)
    expect(m.contextos[1]).toContain(x.tareas.nota(2, 3))
    await reloj.advance(600)
    // La tercera, tras un /clear: el /clear borra el cuadro y Toki la devuelve.
    expect(m.toasts).toContain(x.tareas.enCuadro(3, 3))
    await limpiar($, m)
    await reloj.advance(600)
    expect(m.cuadro).toContain('Actualiza el README con los pasos de instalación')
    await mensaje($, 't2', m.cuadro)
    expect(m.contextos[2]).toContain(x.tareas.nota(3, 3))
    await reloj.advance(600)
    // No quedan más.
    expect(m.fills).toHaveLength(3)
    expect(m.cuadro).toBe('')
  })

  test('todas juntas: el mensaje va como estaba', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { respuesta: () => x.tareas.todas })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', TRES)
    expect(m.entrados[0]).toBe(TRES)
    await reloj.advance(600)
    expect(m.fills).toEqual([])
  })

  test('si mandas otra cosa dos veces, Toki deja la lista', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on)
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', TRES)
    await reloj.advance(600)
    await mensaje($, 't1', 'el redondeo sigue mal en la factura 15')
    await reloj.advance(600)
    // Sigue en el cuadro, una vez más.
    expect(m.fills).toHaveLength(2)
    await mensaje($, 't2', 'revisa también la factura 16 que salió con el mismo error')
    await reloj.advance(600)
    expect(m.fills).toHaveLength(2)
  })

  test('una sola pregunta por mensaje: con varias tareas no pregunta además dónde', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { arbol: PROYECTO, respuesta: () => x.tareas.todas })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', TRES)
    expect(m.preguntas).toEqual([x.tareas.pregunta(3)])
  })
})

describe('(e) qué no olvidar al compactar, con el motor', () => {
  test('un /compact tuyo sin instrucciones pregunta; lo que escribes va al resumen, una vez por tramo', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { respuesta: (ls, q) => (q.startsWith('Antes de compactar') ? 'nunca toques la carpeta legacy' : ls[0]) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils')
    await compactar($, 'manual')
    expect(m.preguntas).toEqual([x.recordar.pregunta(undefined)])
    expect(m.etiquetas[0]).toEqual([x.recordar.nada, x.recordar.enfasis.reglas, x.recordar.enfasis.probado])
    expect(m.instrucciones[0]).toContain('«nunca toques la carpeta legacy»')
    expect(m.toasts).toContain(x.recordar.anotado)
    // Con tus propias instrucciones no pregunta; lo fijado sigue.
    await compactar($, 'manual', 'conserva los nombres de las tablas')
    expect(m.preguntas).toHaveLength(1)
    expect(m.instrucciones[1]).toContain('«nunca toques la carpeta legacy»')
  })

  test('el énfasis va solo a ese resumen', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { respuesta: (ls, q) => (q.startsWith('Antes de compactar') ? x.recordar.enfasis.reglas : ls[0]) })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils')
    await compactar($, 'manual')
    expect(m.instrucciones[0]).toContain('al pie de la letra')
    await mensaje($, 't1', 'renombra también la variable baz a qux en utils')
    await compactar($, 'auto')
    expect(m.instrucciones[1]).not.toContain('al pie de la letra')
  })

  test('cerca de donde Claude Code compacta, pregunta al terminar el turno; una vez por tramo', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { tokens: 190_000, ventana: 200_000, respuesta: () => x.recordar.nada })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    // Pedidos que Toki no baja de modelo: uno bajado trae la pregunta de calidad, y esa va primero.
    await mensaje($, 't0', LOGIN)
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([x.recordar.pregunta(95)])
    await mensaje($, 't1', 'arregla también el error que hace que el login falle cuando el apellido del usuario lleva tildes')
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([x.recordar.pregunta(95)])
  })
})

const SPEC = ['# Exportar facturas', 'Botón en la tabla de facturas que baja un CSV.', 'Listo cuando: pasan las pruebas de facturas y el CSV abre en Excel con tildes.'].join('\n')
const CRITERIO = 'pasan las pruebas de facturas y el CSV abre en Excel con tildes.'

function guardaSpec($: Motor): Promise<unknown> {
  return $.tool.call({ tool: 'Write', file_path: `/p/${RUTA_SPEC}`, content: SPEC } as never)
}

describe('el spec como /goal, con el motor', () => {
  test('Claude guardó el spec con su criterio: al terminar el turno, ¿/goal? y se pone', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { archivos: { [RUTA_SPEC]: SPEC } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', { durante: () => guardaSpec($) })
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([x.goal.pregunta(CRITERIO)])
    expect(m.comandos).toContainEqual({ command: 'goal', args: x.goal.condicion(CRITERIO) })
  })

  test('si Claude terminó preguntando, espera a que el turno termine sin pregunta', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { archivos: { [RUTA_SPEC]: SPEC }, respuesta: () => x.goal.no })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', { durante: () => guardaSpec($), respuesta: '¿Lo dejo en CSV o también en Excel?' })
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([])
    await mensaje($, 't1', 'solo CSV')
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([x.goal.pregunta(CRITERIO)])
    expect(m.comandos.some(c => c.command === 'goal')).toBe(false)
  })

  test('lo que escribes en vez de elegir queda en el cuadro, sin correr', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { archivos: { [RUTA_SPEC]: SPEC }, respuesta: () => 'pasa pnpm test y el botón se ve' })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', { durante: () => guardaSpec($) })
    await reloj.advance(1_100)
    expect(m.cuadro).toBe('/goal pasa pnpm test y el botón se ve')
    expect(m.toasts).toContain(x.goal.tuyo)
    expect(m.comandos.some(c => c.command === 'goal')).toBe(false)
  })

  test('un spec sin criterio no lleva pregunta', async ($, on) => {
    const reloj = mock.clock(on, { now: 1_000_000 })
    const m = mundo(on, { archivos: { [RUTA_SPEC]: '# Exportar facturas\nSolo el resumen.' } })
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true })
    await mensaje($, 't0', 'renombra la variable foo a bar en utils', { durante: () => guardaSpec($) })
    await reloj.advance(1_100)
    expect(m.preguntas).toEqual([])
  })
})
