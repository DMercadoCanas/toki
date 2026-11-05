import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { tokensAprox } from '../hooks/compresor'
import {
  comandoScript,
  contarScript,
  contenidoScript,
  marcarGuardado,
  MAX_AVISOS_SCRIPT,
  MIN_SCRIPT,
  nombreScript,
  pareceSecreto,
  rutaScript,
  scriptCorrido,
  SCRIPTS_VACIO,
  txScripts,
} from '../hooks/scripts'
import type { Scripts } from '../hooks/scripts'

// Scripts repetidos: el mismo comando largo por segunda vez queda guardado y Claude lo repite con `source`.

const SCRIPT = `python3 - <<'EOF'
import json, pathlib
datos = json.loads(pathlib.Path('reporte.json').read_text())
total = sum(f['monto'] for f in datos['facturas'] if f['estado'] == 'pagada')
pendientes = [f['id'] for f in datos['facturas'] if f['estado'] != 'pagada']
print(f'total pagado: {total:.2f}')
print(f'pendientes: {len(pendientes)}', *pendientes[:10], sep='\\n  ')
EOF`

/** Otro script largo: la misma idea con otro archivo. */
function otro(i: number): string {
  return SCRIPT.replace('reporte.json', `reporte-${i}.json`)
}

const CON_CLAVE = `curl -s -H "Authorization: Bearer abc123" https://api.ejemplo.com/v1/facturas?estado=pendiente | python3 -c '${'import json,sys; d=json.load(sys.stdin); print(len(d["facturas"]))'.repeat(4)}'`

const x = txScripts('es')

describe('scripts repetidos', () => {
  test('cuenta solo los largos; a la segunda vez igual toca guardarlo, una vez por compactación', () => {
    expect(SCRIPT.length).toBeGreaterThanOrEqual(MIN_SCRIPT)
    const corto = contarScript(SCRIPTS_VACIO, 'npm test', 0)
    expect(corto).toEqual({ s: SCRIPTS_VACIO, veces: 0, toca: false, yaAvisado: false })
    const uno = contarScript(SCRIPTS_VACIO, SCRIPT, 0)
    expect(uno.veces).toBe(1)
    expect(uno.toca).toBe(false)
    // Con espacios alrededor es el mismo comando.
    const dos = contarScript(uno.s, `  ${SCRIPT}\n`, 0)
    expect(dos.veces).toBe(2)
    expect(dos.toca).toBe(true)
    const guardado = marcarGuardado(dos.s, SCRIPT, 0)
    expect(guardado.avisos).toBe(1)
    expect(guardado.guardados).toEqual({ [nombreScript(SCRIPT)]: SCRIPT.length })
    const tres = contarScript(guardado, SCRIPT, 0)
    expect(tres.toca).toBe(false)
    expect(tres.yaAvisado).toBe(true)
    // Tras compactar, el aviso pudo quedar fuera del resumen: se puede dar otra vez.
    const tras = contarScript(tres.s, SCRIPT, 1)
    expect(tras.toca).toBe(true)
    expect(tras.yaAvisado).toBe(false)
    expect(tras.veces).toBe(4)
  })

  test('como mucho MAX_AVISOS_SCRIPT avisos por conversación, y no recuerda comandos sin límite', () => {
    let s: Scripts = SCRIPTS_VACIO
    for (let i = 0; i < MAX_AVISOS_SCRIPT; i++) s = marcarGuardado(contarScript(contarScript(s, otro(i), 0).s, otro(i), 0).s, otro(i), 0)
    expect(s.avisos).toBe(MAX_AVISOS_SCRIPT)
    const otraVez = contarScript(contarScript(s, otro(99), 0).s, otro(99), 0)
    expect(otraVez.veces).toBe(2)
    expect(otraVez.toca).toBe(false)
    let muchos: Scripts = SCRIPTS_VACIO
    for (let i = 0; i < 100; i++) muchos = contarScript(muchos, otro(i), 0).s
    expect(Object.keys(muchos.veces).length).toBeLessThanOrEqual(60)
    expect(contarScript(muchos, otro(99), 0).veces).toBe(2)
  })

  test('un comando que parece llevar una credencial no se guarda', () => {
    expect(CON_CLAVE.length).toBeGreaterThanOrEqual(MIN_SCRIPT)
    expect(contarScript(contarScript(SCRIPTS_VACIO, CON_CLAVE, 0).s, CON_CLAVE, 0).toca).toBe(false)
    for (const si of ['export API_KEY=abc', 'password: hunter2', "token = 'abc'", `git push https://ghp_${'a'.repeat(30)}@github.com/x/y`, 'AKIAABCDEFGHIJKLMNOP', 'sk-proj-abcdefghijklmnopqrstu', '-----BEGIN RSA PRIVATE KEY-----']) {
      expect(pareceSecreto(si)).toBe(true)
    }
    for (const no of [SCRIPT, 'tokens = contar(texto)', 'grep -rn "token" src/', 'print(secretos_encontrados)']) expect(pareceSecreto(no)).toBe(false)
  })

  test('el archivo: nombre por huella, contenido tal cual y cómo correrlo con source', () => {
    expect(nombreScript(SCRIPT)).toMatch(/^script-[0-9a-f]{8}\.sh$/)
    expect(nombreScript(` ${SCRIPT} `)).toBe(nombreScript(SCRIPT))
    expect(nombreScript(otro(1))).not.toBe(nombreScript(SCRIPT))
    expect(rutaScript(SCRIPT)).toBe(`.claude/toki/scripts/${nombreScript(SCRIPT)}`)
    expect(contenidoScript(`\n${SCRIPT}\n\n`)).toBe(`${SCRIPT}\n`)
    expect(comandoScript('/proyecto/.claude/toki/scripts/script-0a1b2c3d.sh')).toBe('source /proyecto/.claude/toki/scripts/script-0a1b2c3d.sh')
    expect(comandoScript('/Mis Proyectos/.claude/toki/scripts/script-0a1b2c3d.sh')).toBe("source '/Mis Proyectos/.claude/toki/scripts/script-0a1b2c3d.sh'")
    expect(comandoScript("/it's/.claude/toki/scripts/script-0a1b2c3d.sh")).toBe("source '/it'\\''s/.claude/toki/scripts/script-0a1b2c3d.sh'")
    expect(comandoScript('C:\\Users\\ana\\app\\.claude\\toki\\scripts\\script-0a1b2c3d.sh')).toBe('source C:/Users/ana/app/.claude/toki/scripts/script-0a1b2c3d.sh')
  })

  test('reconoce cuando Claude corre un script guardado, y nada más', () => {
    const nombre = 'script-0a1b2c3d.sh'
    expect(scriptCorrido(`source /proyecto/.claude/toki/scripts/${nombre}`)).toBe(nombre)
    expect(scriptCorrido(`. '/Mis Proyectos/.claude/toki/scripts/${nombre}'`)).toBe(nombre)
    expect(scriptCorrido(`bash .claude/toki/scripts/${nombre}`)).toBe(nombre)
    expect(scriptCorrido(`cat .claude/toki/scripts/${nombre}`)).toBeUndefined()
    expect(scriptCorrido('source ~/.zshrc')).toBeUndefined()
    expect(scriptCorrido(`source /proyecto/.claude/toki/scripts/${nombre} && rm -rf dist`)).toBeUndefined()
  })

  test('el aviso, en los dos idiomas', () => {
    const correr = 'source /proyecto/.claude/toki/scripts/script-0a1b2c3d.sh'
    expect(x.aviso(2, 400, correr)).toBe(
      `[Toki] Este mismo comando (~100 tokens) ya corrió igual 2 veces. Toki lo guardó tal cual: para repetirlo, corre \`${correr}\` (mismo shell, mismo efecto) en vez de escribirlo entero; para cambiarlo, edita ese archivo.`,
    )
    expect(txScripts('en').aviso(3, 400, correr)).toBe(
      `[Toki] This exact command (~100 tokens) has now run 3 times unchanged. Toki saved it as is: to run it again, use \`${correr}\` (same shell, same effect) instead of writing it out in full; to change it, edit that file.`,
    )
    expect(Object.keys(txScripts('en')).sort()).toEqual(Object.keys(x).sort())
  })
})

// ---------- Con el motor ----------

type Motor = Parameters<TestBody>[0]
type Disco = { archivos: Map<string, string>; diagnostico: string[]; reloj: ReturnType<typeof mock.clock> }

const CARPETA = '/proyecto'
const CORRER = comandoScript(`${CARPETA}/${rutaScript(SCRIPT)}`)

/** El disco, la carpeta del proyecto, los permisos (`permiso`, por comando) y un Bash que siempre responde corto. */
function preparar(on: On, o: { permiso?: (comando: string) => 'allow' | 'ask' | 'deny'; archivos?: Record<string, string> } = {}): Disco {
  const reloj = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const d: Disco = { archivos: new Map(Object.entries(o.archivos ?? {})), diagnostico: [], reloj }
  // El motor resuelve las rutas: una relativa sembrada por la prueba vale desde cualquier carpeta.
  const buscar = (ruta: string): string | undefined => d.archivos.get(ruta) ?? [...d.archivos].find(([k]) => !k.startsWith('/') && ruta.endsWith(`/${k}`))?.[1]
  on('fs.exists', ($, e) => ({ value: buscar(e.path) !== undefined }))
  on('fs.write', ($, e) => {
    d.archivos.set(e.path, e.text)
    if (e.path.endsWith('diagnostico.txt')) d.diagnostico.push((e.text.trimEnd().split('\n').pop() ?? '').replace(/^\S+ /, ''))
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const texto = buscar(e.path)
    return texto === undefined ? { deny: 'no existe' } : { value: texto }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: CARPETA }))
  on('tool.check', ($, e) => ({ decision: o.permiso?.(String((e as { input?: { command?: string } }).input?.command)) ?? ('allow' as const) }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'total pagado: 1200.00', stderr: '', interrupted: false } }))
  return d
}

async function bash($: Motor, comando: string): Promise<readonly string[] | undefined> {
  return (await $.tool.call({ tool: 'Bash', command: comando } as never)).context
}

/** El script guardado, si lo hay. */
function guardado(d: Disco, comando = SCRIPT): string | undefined {
  return [...d.archivos].find(([k]) => k.endsWith(rutaScript(comando)))?.[1]
}

/** El diagnóstico se escribe en fila, sin esperar: se deja terminar lo pendiente. */
async function diagnostico(d: Disco): Promise<string[]> {
  await d.reloj.settle()
  return d.diagnostico
}

const OPCIONES = { options: { idioma: 'es', recomendarModelo: 'no' } }

describe('scripts repetidos con el motor', () => {
  test('a la segunda vez igual Toki lo guarda y le dice a Claude cómo repetirlo; después anota si lo usó', OPCIONES, async ($, on) => {
    const d = preparar(on)
    expect(await bash($, SCRIPT)).toBeUndefined()
    expect(guardado(d)).toBeUndefined()
    expect(await bash($, SCRIPT)).toEqual([x.aviso(2, SCRIPT.length, CORRER)])
    expect(guardado(d)).toBe(contenidoScript(SCRIPT))
    expect([...d.archivos].find(([k]) => k.endsWith('.claude/toki/.gitignore'))?.[1]).toBe('*\n')
    // Si lo vuelve a escribir entero, no hay otro aviso: queda anotado.
    expect(await bash($, SCRIPT)).toBeUndefined()
    expect(await bash($, CORRER)).toBeUndefined()
    const nombre = nombreScript(SCRIPT)
    expect(await diagnostico(d)).toEqual([
      `scripts: Toki guardó ${nombre} (${SCRIPT.length} caracteres, corrió igual 2 veces)`,
      `scripts: Claude volvió a escribir entero ${nombre} (${SCRIPT.length} caracteres)`,
      `scripts: Claude corrió ${nombre} desde su archivo (~${tokensAprox(SCRIPT.length - CORRER.length)} tokens menos que escribirlo)`,
    ])
  })

  test('si source no recibe el mismo permiso que el comando, no guarda nada (nunca pide un permiso nuevo)', OPCIONES, async ($, on) => {
    const d = preparar(on, { permiso: c => (c.startsWith('source ') ? 'ask' : 'allow') })
    await bash($, SCRIPT)
    expect(await bash($, SCRIPT)).toBeUndefined()
    expect(guardado(d)).toBeUndefined()
    expect(await diagnostico(d)).toEqual([`scripts: ${nombreScript(SCRIPT)} no se guardó: source pide otro permiso (original=allow, source=ask)`])
  })

  test('un comando con una credencial no llega al disco', OPCIONES, async ($, on) => {
    const d = preparar(on)
    await bash($, CON_CLAVE)
    expect(await bash($, CON_CLAVE)).toBeUndefined()
    expect(guardado(d, CON_CLAVE)).toBeUndefined()
  })

  test('con la opción apagada, nada', { options: { idioma: 'es', recomendarModelo: 'no', guardarScripts: false } }, async ($, on) => {
    const d = preparar(on)
    await bash($, SCRIPT)
    expect(await bash($, SCRIPT)).toBeUndefined()
    expect(guardado(d)).toBeUndefined()
  })

  test('si ya hay un archivo con ese nombre y otro contenido, no lo pisa ni avisa', OPCIONES, async ($, on) => {
    const d = preparar(on, { archivos: { [rutaScript(SCRIPT)]: 'echo editado a mano\n' } })
    await bash($, SCRIPT)
    expect(await bash($, SCRIPT)).toBeUndefined()
    expect(guardado(d)).toBe('echo editado a mano\n')
  })

  test('en un subagente no cuenta: el aviso es para el hilo principal', OPCIONES, async ($, on) => {
    const d = preparar(on)
    for (let i = 0; i < 3; i++) expect((await $.tool.call({ tool: 'Bash', command: SCRIPT, agentId: 'a1' } as never)).context).toBeUndefined()
    expect(guardado(d)).toBeUndefined()
  })
})
