import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { compactar, formatearTokens, LIMITES_CUIDADO } from '../hooks/compresor'
import {
  anotarOportunidad,
  APRENDIZAJE,
  aprendidas,
  familiaDeComando,
  leerAprendizaje,
  leerExtras,
  leerOportunidades,
  mejoresOportunidades,
  nivelDe,
  normalizarFamilia,
  textosFamilias,
  trasAbrir,
  trasCompactar,
  trasLeerEntera,
} from '../hooks/familias'
import type { Aprendizaje, Oportunidades } from '../hooks/familias'
import { textos } from '../hooks/idioma'
import { fecha } from '../hooks/semana'

// Toki aprende de las copias que Claude abre, por familia de comando, y cuenta las salidas largas
// que nunca pasaron por él.

const DIA = 86_400_000
const AHORA = Date.UTC(2026, 10, 5, 15)
const x = textosFamilias.es

function letras(i: number): string {
  return String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
}

/** 400 tests que pasan, cada línea distinta (no se agrupan como parecidas); con `error`, uno falla. */
function salidaLarga(error?: number): string {
  const lineas = ['> app@1.0.0 test', '> vitest run']
  for (let i = 0; i < 400; i++) lineas.push(i === error ? `  ✗ caso-${letras(i)} falló: expected 3, received 4` : `  ✓ caso-${letras(i)} calcula el total de la factura`)
  lineas.push('Tests  400 passed (400)')
  return lineas.join('\n')
}

describe('la familia de un comando', () => {
  test('el programa y su subcomando, sin carpeta, variables, lanzador ni lo que Claude agrega al final', () => {
    const casos: [string, string][] = [
      ['npm test', 'npm test'],
      ['cd app && npm test 2>&1; echo "EXIT=$?"', 'npm test'],
      ['CI=1 npx jest --ci', 'jest'],
      ['npx -y -p typescript@5.6.3 tsc -p tsconfig.json --noEmit', 'tsc'],
      ['pnpm dlx vitest run', 'vitest run'],
      ['npm run build', 'npm run build'],
      ['python -m pytest -x tests/', 'pytest'],
      ['uv run pytest -q', 'pytest'],
      ['python3 manage.py test', 'manage.py test'],
      ['bash -c "make all"', 'bash -c'],
      ['./gradlew build --info', 'gradlew build'],
      ['timeout 120 cargo test', 'cargo test'],
      ['sudo apt-get install -y jq', 'apt-get install'],
      ['docker compose up -d', 'docker compose up'],
      ['terraform plan -out=plan.bin', 'terraform plan'],
      ['kubectl get pods -A | tee pods.txt', 'kubectl get'],
      ['go test ./...', 'go test'],
      ['Get-ChildItem -Recurse', 'get-childitem'],
      ['node --max-old-space-size=4096 scripts/build.mjs', 'build.mjs'],
    ]
    for (const [comando, familia] of casos) expect([comando, familiaDeComando(comando)]).toEqual([comando, familia])
  })
})

describe('lo que Toki aprende de cada familia', () => {
  test('abrir la copia pide más contexto; leerla entera dos veces con más contexto la deja entera un mes', () => {
    let a: Aprendizaje = trasCompactar({}, 'npm test', AHORA).aprendizaje
    expect(nivelDe(a, 'npm test')).toBe(0)
    const abre = trasAbrir(a, 'npm test', AHORA)
    expect(abre.nivel).toBe(1)
    a = abre.aprendizaje
    // Una copia compactada antes, sin más contexto, no cuenta para dejarla entera.
    expect(trasLeerEntera(a, 'npm test', 0, AHORA).aprendizaje).toEqual(a)
    a = trasLeerEntera(a, 'npm test', 1, AHORA).aprendizaje
    expect(nivelDe(a, 'npm test')).toBe(1)
    const deja = trasLeerEntera(a, 'npm test', 1, AHORA + DIA)
    expect(deja.nivel).toBe(2)
    expect(deja.aprendizaje['npm test']).toMatchObject({ nivel: 2, compactadas: 1, abiertas: 1, desde: AHORA + DIA })
    // Un mes después vuelve a probarse, con más contexto.
    expect(nivelDe(leerAprendizaje(deja.aprendizaje, AHORA + 30 * DIA), 'npm test')).toBe(2)
    expect(nivelDe(leerAprendizaje(deja.aprendizaje, AHORA + 31 * DIA), 'npm test')).toBe(1)
  })

  test('quince compactaciones seguidas sin abrir la copia la devuelven a lo normal; abrirla reinicia la cuenta', () => {
    let a = trasAbrir({}, 'cargo build', AHORA).aprendizaje
    for (let i = 0; i < APRENDIZAJE.limpiasParaVolver - 2; i++) a = trasCompactar(a, 'cargo build', AHORA).aprendizaje
    a = trasAbrir(a, 'cargo build', AHORA).aprendizaje
    for (let i = 0; i < APRENDIZAJE.limpiasParaVolver - 1; i++) a = trasCompactar(a, 'cargo build', AHORA).aprendizaje
    expect(nivelDe(a, 'cargo build')).toBe(1)
    const vuelve = trasCompactar(a, 'cargo build', AHORA)
    expect(vuelve.nivel).toBe(0)
    expect(nivelDe(vuelve.aprendizaje, 'cargo build')).toBe(0)
  })

  test('lo guardado se valida, y recuerda a lo más cien familias: las aprendidas primero', () => {
    expect(leerAprendizaje('basura', AHORA)).toEqual({})
    expect(leerAprendizaje({ x: { nivel: 7, compactadas: -1 } }, AHORA)).toEqual({ x: { nivel: 0, compactadas: 0, abiertas: 0, enteras: 0, limpias: 0, desde: 0, ultima: 0 } })
    let a = trasAbrir({}, 'vieja', AHORA - DIA).aprendizaje
    for (let i = 0; i < APRENDIZAJE.maxFamilias + 5; i++) a = trasCompactar(a, `f${i}`, AHORA + i).aprendizaje
    expect(Object.keys(a)).toHaveLength(APRENDIZAJE.maxFamilias)
    expect(nivelDe(a, 'vieja')).toBe(1)
    expect(a['f0']).toBe(undefined)
    expect(a[`f${APRENDIZAJE.maxFamilias + 4}`]).toBeDefined()
    expect(aprendidas(a).map(([f]) => f)).toEqual(['vieja'])
  })

  test('con más contexto, la compactación guarda más cabeza, cola y alrededor de cada error, y sigue ahorrando', () => {
    const salida = salidaLarga(200)
    const normal = compactar(salida)
    const conCuidado = compactar(salida, 'es', LIMITES_CUIDADO)
    if (normal === null || conCuidado === null) throw new Error('debía compactar')
    expect(normal.texto).toContain('falló: expected 3, received 4')
    expect(normal.texto).not.toContain(`caso-${letras(30)} `)
    expect(normal.texto).not.toContain(`caso-${letras(212)} `)
    expect(conCuidado.texto).toContain(`caso-${letras(30)} `)
    expect(conCuidado.texto).toContain(`caso-${letras(212)} `)
    expect(conCuidado.caracteresDespues).toBeGreaterThan(normal.caracteresDespues * 2)
    expect(conCuidado.caracteresDespues < salida.length * 0.7).toBe(true)
  })
})

describe('oportunidades', () => {
  test('cuentan por familia un mes; se proponen las vistas dos veces que suman lo bastante, sin las que ya compactas', () => {
    let o: Oportunidades = anotarOportunidad({}, 'terraform plan', 3000, AHORA)
    // Una vez no basta.
    expect(mejoresOportunidades(o, [])).toEqual([])
    o = anotarOportunidad(o, 'terraform plan', 1500, AHORA + DIA)
    o = anotarOportunidad(o, 'kubectl get', 800, AHORA)
    o = anotarOportunidad(o, 'kubectl get', 700, AHORA)
    expect(mejoresOportunidades(o, [])).toEqual([['terraform plan', { veces: 2, tokens: 4500, desde: AHORA, ultima: AHORA + DIA }]])
    expect(mejoresOportunidades(o, ['terraform plan'])).toEqual([])
    // Pasado un mes, la familia empieza de nuevo; lo que no se ve hace un mes se olvida.
    expect(anotarOportunidad(o, 'terraform plan', 100, AHORA + 31 * DIA)['terraform plan']).toEqual({ veces: 1, tokens: 100, desde: AHORA + 31 * DIA, ultima: AHORA + 31 * DIA })
    expect(Object.keys(leerOportunidades(o, AHORA + 29 * DIA)).sort()).toEqual(['kubectl get', 'terraform plan'])
    expect(leerOportunidades(o, AHORA + 30 * DIA)).toEqual({})
    expect(leerOportunidades([1, 2], AHORA)).toEqual({})
  })

  test('«Compactar también»: separadas por coma, sin repetir y como las guarda Toki', () => {
    expect(leerExtras(' Terraform  Plan, kubectl get,,terraform plan ')).toEqual(['terraform plan', 'kubectl get'])
    expect(leerExtras(undefined)).toEqual([])
    expect(normalizarFamilia('  NPM   test ')).toBe('npm test')
  })

  test('los textos existen en los dos idiomas', () => {
    expect(Object.keys(textosFamilias.en).sort()).toEqual(Object.keys(textosFamilias.es).sort())
  })
})

// ---------- Con el motor ----------

type Mundo = {
  guardado: Map<string, unknown>
  archivos: Map<string, string>
  toasts: string[]
  logs: string[]
  cambios: { key: string; value: unknown }[]
  preguntas: { pregunta: string; opciones: string[] }[]
  /** Cuánto devuelve la próxima lectura de una copia. */
  lectura: number
}

type Motor = Parameters<TestBody>[0]

function mundo(on: On, o: { guardado?: [string, unknown][]; superficies?: string[]; salida?: (comando: string) => string } = {}): Mundo {
  const m: Mundo = { guardado: new Map(o.guardado ?? []), archivos: new Map(), toasts: [], logs: [], cambios: [], preguntas: [], lectura: 0 }
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
  on('fs.exists', ($, e) => ({ value: m.archivos.has(e.path) }))
  on('fs.write', ($, e) => {
    m.archivos.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const texto = m.archivos.get(e.path)
    return texto === undefined ? { deny: 'no existe' } : { value: texto }
  })
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
  on('audio.play', () => ({ value: undefined }) as never)
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  on('config.list', () => ({ value: [] }) as never)
  on('config.set', ($, e) => {
    m.cambios.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: o.superficies ?? [] }) as never)
  on('tool.call', { tool: 'Bash' }, ($, e) => ({ result: { stdout: (o.salida ?? (() => salidaLarga()))(String(e.command)), stderr: '', interrupted: false } }))
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { content: 'x'.repeat(m.lectura) } } }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    const opciones = q.options.map(p => p.label)
    m.preguntas.push({ pregunta: q.question, opciones })
    return { result: { questions: [], answers: { [q.question]: opciones[0] ?? '' } } } as never
  })
  return m
}

async function bash($: Motor, comando: string): Promise<string> {
  const r = await $.tool.call({ tool: 'Bash', command: comando } as never)
  return (r.result as { stdout: string }).stdout
}

/** Claude lee `caracteres` de la copia en la ranura `n`. */
async function abrir($: Motor, m: Mundo, n: number, caracteres: number): Promise<void> {
  m.lectura = caracteres
  await $.tool.call({ tool: 'Read', file_path: `/p/.claude/toki/salidas/salida-${String(n).padStart(2, '0')}.txt` } as never)
}

async function porQue($: Motor, args = ''): Promise<string> {
  return ((await $.command.run({ command: 'toki-por-que', args } as never)) as { text: string }).text
}

const OPCIONES = { options: { idioma: 'es', recomendarModelo: 'no' } }

describe('aprender de las copias, con el motor', () => {
  test('Claude abrió la copia de npm test: la próxima compactación de esa familia guarda más contexto', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on)
    const primera = await bash($, 'npm test')
    expect(primera).toContain('[Toki] Salida compactada')
    expect(primera).not.toContain(`caso-${letras(30)} `)
    // Claude busca algo en la copia: con un vistazo, Toki ya aprende.
    await abrir($, m, 0, 400)
    expect(m.toasts).toContain(x.aviso[1]('npm test'))
    expect((m.guardado.get('familiasAprendidas') as Aprendizaje)['npm test']).toMatchObject({ nivel: 1, compactadas: 1, abiertas: 1 })
    const segunda = await bash($, 'cd app && npm test')
    expect(segunda).toContain('[Toki] Salida compactada')
    expect(segunda).toContain(`caso-${letras(30)} `)
    expect(segunda.length).toBeGreaterThan(primera.length * 2)
    const texto = await porQue($)
    expect(texto).toContain(x.detalleCuidado)
    expect(texto).toContain(`${x.aprendidoTitulo}\n${x.aprendida('npm test', x.conCuidado, 1, 2)}\n${x.pistaOlvidar}`)
  })

  test('si aun con más contexto Claude la lee entera dos veces, la familia va entera; olvidar la devuelve', OPCIONES, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const aprendida = { nivel: 1, compactadas: 3, abiertas: 1, enteras: 0, limpias: 0, desde: AHORA - DIA, ultima: AHORA - DIA }
    const m = mundo(on, { guardado: [['familiasAprendidas', { 'npm test': aprendida }]] })
    expect(await bash($, 'npm test -- --ci')).toContain('[Toki] Salida compactada')
    await abrir($, m, 0, 30_000)
    expect(nivelDe(m.guardado.get('familiasAprendidas') as Aprendizaje, 'npm test')).toBe(1)
    // El mismo comando ya va entero en esta sesión (lo leyó entero); otro de la familia, no.
    expect(await bash($, 'cd web && npm test')).toContain('[Toki] Salida compactada')
    await abrir($, m, 1, 30_000)
    expect(m.toasts).toContain(x.aviso[2]('npm test'))
    const entera = await bash($, 'npm test -- --run')
    expect(entera).toBe(salidaLarga())
    const texto = await porQue($)
    expect(texto).toContain(textos.es.motivos.aprendido)
    expect(texto).toContain(x.aprendida('npm test', x.entera(fecha(AHORA + 30 * DIA, 'es')), 3, 5))
    // Olvidar: la familia vuelve a compactarse.
    expect(await porQue($, 'olvidar NPM test')).toBe(x.olvidada('npm test', false))
    expect((m.guardado.get('familiasAprendidas') as Aprendizaje)['npm test']).toBe(undefined)
    expect(await bash($, 'npm test -- --bail')).toContain('[Toki] Salida compactada')
    expect(await porQue($, 'olvidar cargo build')).toBe(x.nadaQueOlvidar('cargo build'))
  })
})

describe('oportunidades, con el motor', () => {
  test('una salida larga de un comando que Toki no conoce queda anotada; /toki-por-que la lista y, con tu OK, la compacta también', OPCIONES, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, { superficies: ['app'] })
    expect(await bash($, 'terraform plan')).toBe(salidaLarga())
    expect(await bash($, 'cd infra && terraform plan -out=plan.bin')).toBe(salidaLarga())
    // Lo que Claude lee tal cual (cat) o ya filtró no cuenta; una salida corta, tampoco.
    await bash($, 'cat terraform.log')
    await bash($, 'kubectl get pods 2>&1 | head -50')
    const oportunidades = m.guardado.get('oportunidadesPerdidas') as Oportunidades
    expect(Object.keys(oportunidades)).toEqual(['terraform plan'])
    const tokens = formatearTokens(oportunidades['terraform plan']?.tokens ?? 0)
    expect(oportunidades['terraform plan']?.veces).toBe(2)
    const texto = await porQue($)
    expect(texto).toContain(`${x.oportunidadesTitulo}\n${x.oportunidad('terraform plan', 2, tokens, fecha(AHORA, 'es'))}\n${x.pistaOlvidar}`)
    // Tras el informe, con alguien mirando, la pregunta; elegirla cambia la opción después de responder.
    await reloj.advance(1_000)
    expect(m.preguntas).toEqual([{ pregunta: x.pregunta('terraform plan', tokens), opciones: [x.etiqueta('terraform plan', tokens), x.ahoraNo] }])
    expect(m.logs).toContain(x.agregadas('terraform plan'))
    await reloj.advance(100)
    expect(m.cambios).toEqual([{ key: 'toki.compactarTambien', value: 'terraform plan' }])
  })

  test('con «Compactar también», Toki compacta esa familia; olvidarla la quita de la opción', { options: { idioma: 'es', recomendarModelo: 'no', compactarTambien: 'terraform plan' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on)
    expect(await bash($, 'terraform plan')).toContain('[Toki] Salida compactada')
    expect(m.guardado.get('oportunidadesPerdidas')).toBe(undefined)
    expect(await porQue($)).toContain(`\n${x.tambien('terraform plan')}\n`)
    expect(await porQue($, 'olvidar terraform plan')).toBe(x.olvidada('terraform plan', true))
    await reloj.advance(100)
    expect(m.cambios).toEqual([{ key: 'toki.compactarTambien', value: '' }])
  })
})
