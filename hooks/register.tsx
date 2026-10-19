// ahorro-tokens: el acompañante de ahorro de tokens para Claude Code.
// Todo corre dentro de Claude Code como mod: cero instrucciones fijas en el
// contexto, cero dependencias, y si algo falla, Claude sigue trabajando normal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Sesion } from '../types'
import { AVISO_BUCLE, registrar } from './bucles'
import {
  compactar,
  encabezado,
  envolver,
  esCompactable,
  formatearTokens,
  separarComando,
  tokensAprox,
} from './compresor'
import {
  AVISO_MAPA,
  CARPETAS_IGNORADAS,
  LIMITES_MAPA,
  RUTA_MAPA,
  construirMapa,
  esBusqueda,
  extraerFicha,
  lenguaje,
} from './mapa'
import type { FichaArchivo } from './mapa'

type $ = EngineInterface

const SESION_VACIA: Sesion = { tokensAhorrados: 0, compactaciones: 0, bucles: 0, ultimaActividad: 0 }
const sesion = atom({ plugin: 'ahorro-tokens', key: 'sesion' } as const, SESION_VACIA)
const oculto = atom({ plugin: 'ahorro-tokens', key: 'oculto' } as const, false)
const fallos = atom({ plugin: 'ahorro-tokens', key: 'fallos' } as const, {})
const avisoMapaDado = atom({ plugin: 'ahorro-tokens', key: 'avisoMapaDado' } as const, false)

const CARPETA = '.claude/ahorro-tokens'
const PANEL = 'ahorro-reporte'
const CLAVE_TOTAL = 'tokensAhorradosTotal'
const CLAVE_RANURA = 'ranuraArchivo'
const RANURAS = 40
const UMBRAL_CONTEXTO = 70
const HORAS_MAPA_VIGENTE = 24

// ---------- Utilidades ----------

async function asegurarCarpeta($: $): Promise<void> {
  // La carpeta se ignora a sí misma en git: nada de esto ensucia el repositorio.
  if (!(await $.fs.exists(`${CARPETA}/.gitignore`))) await $.fs.write(`${CARPETA}/.gitignore`, '*\n')
}

/** Reserva una de 40 ranuras rotativas para guardar salidas sin llenar el disco. */
async function reservarRuta($: $): Promise<string> {
  await asegurarCarpeta($)
  const n = Number((await $.store.get(CLAVE_RANURA)) ?? 0)
  await $.store.set(CLAVE_RANURA, (n + 1) % RANURAS)
  return `${CARPETA}/salidas/salida-${String(n).padStart(2, '0')}.txt`
}

/** Guarda la salida original. */
async function archivar($: $, contenido: string): Promise<string | undefined> {
  try {
    const ruta = await reservarRuta($)
    await $.fs.write(ruta, contenido)
    return ruta
  } catch {
    return undefined // Sin original guardado, no se compacta: nunca se pierde información.
  }
}

type Captura = { comando: string; ruta: string; absoluta: string }

/**
 * Prepara la copia completa de la salida mientras el comando corre.
 * Solo en bash o zsh, y solo si el comando envuelto no pediría un permiso nuevo.
 */
async function planearCaptura($: $, comando: string): Promise<Captura | undefined> {
  try {
    const shell = (await $.env.get('SHELL')) ?? ''
    if (!/(^|\/)(bash|zsh)$/.test(shell)) return undefined
    const partes = separarComando(comando)
    if (partes === undefined) return undefined
    const ruta = await reservarRuta($)
    const absoluta = `${(await $.session.cwd()).replace(/\/$/, '')}/${ruta}`
    const envuelto = envolver(partes.prefijo, partes.cuerpo, absoluta)
    const permiso = await $.tool.check({ tool: 'Bash', input: { command: envuelto } })
    if (permiso.decision !== 'allow') return undefined
    await $.fs.write(ruta, '')
    return { comando: envuelto, ruta, absoluta }
  } catch {
    return undefined
  }
}

async function sumarAhorro($: $, caracteres: number): Promise<void> {
  const tokens = tokensAprox(caracteres)
  await update($, sesion, s => ({ ...s, tokensAhorrados: s.tokensAhorrados + tokens, compactaciones: s.compactaciones + 1 }))
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  await $.store.set(CLAVE_TOTAL, total + tokens)
}

async function conAvisoMapa($: $, herramienta: string, comando: string | undefined, ran: ToolCallResult): Promise<ToolCallResult> {
  if (ran.deny !== undefined || ran.isError === true || !esBusqueda(herramienta, comando)) return ran
  if (await read($, avisoMapaDado)) return ran
  if (!(await $.fs.exists(RUTA_MAPA).catch(() => false))) return ran
  await update($, avisoMapaDado, () => true)
  return { ...ran, context: [...(ran.context ?? []), AVISO_MAPA] }
}

// ---------- Mapa del proyecto ----------

async function generarMapa($: $): Promise<{ archivos: number; truncado: boolean }> {
  const fichas: FichaArchivo[] = []
  const pendientes: string[] = ['']
  let truncado = false
  while (pendientes.length > 0 && !truncado) {
    const carpeta = pendientes.shift() ?? ''
    let entradas
    try {
      entradas = carpeta === '' ? await $.fs.list() : await $.fs.list(carpeta)
    } catch {
      continue
    }
    for (const entrada of [...entradas].sort((a, b) => a.name.localeCompare(b.name))) {
      const ruta = carpeta === '' ? entrada.name : `${carpeta}/${entrada.name}`
      if (entrada.kind === 'dir') {
        if (!CARPETAS_IGNORADAS.has(entrada.name) && !entrada.name.startsWith('.')) pendientes.push(ruta)
        continue
      }
      if (entrada.kind !== 'file' || entrada.size > LIMITES_MAPA.maxBytes || lenguaje(ruta) === undefined) continue
      if (fichas.length >= LIMITES_MAPA.maxArchivos) {
        truncado = true
        break
      }
      try {
        const ficha = extraerFicha(ruta, await $.fs.read(ruta))
        if (ficha !== undefined) fichas.push(ficha)
      } catch {
        // Archivo ilegible: se omite.
      }
    }
  }
  if (fichas.length === 0) return { archivos: 0, truncado }
  await asegurarCarpeta($)
  const fecha = new Date(await $.clock.now()).toISOString().slice(0, 16).replace('T', ' ')
  await $.fs.write(RUTA_MAPA, construirMapa(fichas, fecha, truncado))
  return { archivos: fichas.length, truncado }
}

async function mapaAutomatico($: $): Promise<void> {
  try {
    if (!(await $.fs.exists('.git'))) return // Solo en proyectos, nunca en la carpeta personal.
    if (await $.fs.exists(RUTA_MAPA)) {
      const { mtimeMs } = await $.fs.stat(RUTA_MAPA)
      if ((await $.clock.now()) - mtimeMs < HORAS_MAPA_VIGENTE * 3_600_000) return
    }
    await generarMapa($)
  } catch {
    // El mapa es una ayuda: si falla, no estorba.
  }
}

// ---------- Reporte ----------

async function reporte($: $): Promise<string[]> {
  const s = await read($, sesion)
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  const lineas = [
    `Esta sesión: ~${formatearTokens(s.tokensAhorrados)} tokens ahorrados · ${s.compactaciones} salidas compactadas · ${s.bucles} bucles detectados`,
    `Desde que instalaste ahorro-tokens: ~${formatearTokens(total)} tokens ahorrados (estimado)`,
  ]

  const sugerencias: string[] = []
  try {
    const uso = await $.session.usage({ breakdown: 'summary' })
    const pct = uso.context.percent
    const desglose = uso.context.breakdown
    lineas.push(
      `Contexto: ${pct === undefined ? 'sin datos aún' : `${pct}% usado`} (ventana de ${formatearTokens(uso.context.window)} tokens)` +
        (uso.cost !== undefined && uso.rateLimits.length === 0 ? ` · costo de la sesión: $${uso.cost.usd.toFixed(2)}` : ''),
    )
    if (desglose !== undefined) {
      const usados = desglose.categories
        .filter(c => c.kind === 'used' && c.tokens > 0)
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 5)
      if (usados.length > 0) {
        lineas.push('', 'Qué ocupa tu contexto ahora:')
        for (const c of usados) lineas.push(`  ${c.name}: ~${formatearTokens(c.tokens)}`)
      }
      const memoria = desglose.memoryFiles.reduce((suma, f) => suma + f.tokens, 0)
      if (memoria > 5000) {
        sugerencias.push(
          `Tus archivos de memoria (CLAUDE.md y similares) pesan ~${formatearTokens(memoria)} tokens en cada mensaje. Mueve los flujos específicos a skills y deja el CLAUDE.md por debajo de 200 líneas.`,
        )
      }
      const mcp = desglose.mcpTools.filter(t => t.isLoaded).reduce((suma, t) => suma + t.tokens, 0)
      if (mcp > 10_000) {
        sugerencias.push(`Las herramientas MCP ocupan ~${formatearTokens(mcp)} tokens. Desactiva en /mcp los servidores que no estés usando.`)
      }
    }
    if (pct !== undefined && pct >= 50) {
      sugerencias.push('El contexto pasa de la mitad. Si terminaste una tarea, /compact en esta pausa; si vas a cambiar de tema, /clear.')
    }
  } catch {
    lineas.push('Contexto: sin datos en este momento.')
  }

  if (!(await $.fs.exists(RUTA_MAPA).catch(() => false))) {
    sugerencias.push('Aún no hay mapa del proyecto. Créalo con /ahorro-mapa para que Claude se oriente sin leer archivos a ciegas.')
  }
  sugerencias.push('Para respuestas más cortas sin perder lo técnico: /output-style → ahorro-tokens:conciso.')

  lineas.push('', 'Sugerencias:')
  for (const sugerencia of sugerencias) lineas.push(`  • ${sugerencia}`)
  return lineas
}

// ---------- Registro ----------

export const register: Register = (on, options) => {
  const compresion = options['compresion'] !== false
  const mapaAuto = options['mapaAutomatico'] !== false
  const acompanante = options['acompanante'] !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ahorro', description: 'ahorro-tokens: ver cuánto has ahorrado y qué ocupa tu contexto' })
    await $.command.register({ name: 'ahorro-mapa', description: 'ahorro-tokens: crear o actualizar el mapa del proyecto' })
    // Redibuja la franja cada minuto para que el aviso de caché frío aparezca a tiempo.
    if (acompanante) $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    if (mapaAuto) $.clock.after(3_000, () => void mapaAutomatico($))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, sesion, () => SESION_VACIA)
      await update($, fallos, () => ({}))
      await update($, avisoMapaDado, () => false)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ahora = await $.clock.now()
      await update($, sesion, s => ({ ...s, ultimaActividad: ahora }))
    }
    return next(e)
  })

  // Motor: compactar salidas ruidosas y detectar bucles.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const comando = e.command
    const compactable = compresion && esCompactable(comando)
    const captura = compactable ? await planearCaptura($, comando) : undefined
    // El modelo sigue viendo su comando original en el historial; solo cambia cómo se ejecuta.
    const ran = await next(captura ? { ...e, command: captura.comando } : e)
    if (ran.deny !== undefined) return ran
    const fallo = ran.isError === true

    const { fallos: nuevos, avisar } = registrar(await read($, fallos), comando, fallo)
    await update($, fallos, () => nuevos)
    if (avisar) await update($, sesion, s => ({ ...s, bucles: s.bucles + 1 }))
    const avisoBucle = avisar ? AVISO_BUCLE : undefined

    if (compactable) {
      // La salida completa: la copia capturada si existe, si no lo que entregó Claude Code.
      let completa: string | undefined
      if (captura !== undefined) completa = await $.fs.read(captura.ruta).catch(() => undefined)

      if (ran.isError === true) {
        const texto = ran.text ?? ''
        const salida = texto.match(/^(Exit code \d+)\n?/)
        const cuerpo = completa !== undefined && completa.length > 0 ? completa : salida ? texto.slice(salida[0].length) : texto
        const c = compactar(cuerpo)
        if (c !== null) {
          const ruta = captura?.ruta ?? (await archivar($, texto))
          if (ruta !== undefined) {
            await sumarAhorro($, Math.max(0, Math.min(texto.length, c.caracteresAntes) - c.caracteresDespues))
            return { deny: [salida?.[1], encabezado(c, ruta), c.texto, avisoBucle].filter(Boolean).join('\n') }
          }
        }
      } else {
        const r = ran.result
        const enSegundoPlano = r.backgroundTaskId !== undefined || r.interrupted || r.isImage === true
        if (!enSegundoPlano) {
          // Con captura, stdout y stderr vienen juntos en el orden real en que salieron.
          const fuente = completa !== undefined && completa.length > 0 ? completa : r.stdout
          const cOut = compactar(fuente)
          const cErr = captura === undefined && r.stderr ? compactar(r.stderr) : null
          if (cOut !== null || cErr !== null) {
            const ruta = captura?.ruta ?? (await archivar($, `=== stdout ===\n${r.stdout}\n\n=== stderr ===\n${r.stderr}`))
            if (ruta !== undefined) {
              const ahorrado =
                (cOut ? cOut.caracteresAntes - cOut.caracteresDespues : 0) + (cErr ? cErr.caracteresAntes - cErr.caracteresDespues : 0)
              await sumarAhorro($, ahorrado)
              const principal = cOut ?? cErr
              const cabecera = principal ? encabezado(principal, ruta) : ''
              return {
                result: {
                  ...r,
                  stdout: cOut ? `${cabecera}\n${cOut.texto}` : r.stdout,
                  stderr: captura !== undefined ? '' : cErr ? (cOut ? cErr.texto : `${cabecera}\n${cErr.texto}`) : r.stderr,
                  persistedOutputPath: undefined,
                  persistedOutputSize: undefined,
                },
              }
            }
          }
        }
      }
    }

    if (avisoBucle !== undefined && ran.isError === true) return { deny: `${ran.text ?? ''}\n\n${avisoBucle}` }
    return conAvisoMapa($, 'Bash', comando, ran)
  })

  on('tool.call', { tool: 'Grep' }, async ($, e, next) => conAvisoMapa($, 'Grep', undefined, await next(e)))
  on('tool.call', { tool: 'Glob' }, async ($, e, next) => conAvisoMapa($, 'Glob', undefined, await next(e)))

  // Comandos: /ahorro y /ahorro-mapa. No dejan instrucciones fijas en el contexto.
  on('command.run', { command: 'ahorro' }, async $ => {
    await update($, oculto, () => false)
    const abierto = await $.ui.open({ id: PANEL, title: 'ahorro-tokens' })
    if (abierto.isPlaced) return { text: 'Reporte de ahorro-tokens abierto en el panel.' }
    return { text: (await reporte($)).join('\n') }
  })

  on('command.run', { command: 'ahorro-mapa' }, async $ => {
    const { archivos, truncado } = await generarMapa($)
    if (archivos === 0) return { text: 'No encontré archivos de código para mapear en esta carpeta.' }
    return {
      text: `Mapa listo: ${archivos} archivos${truncado ? ' (recortado)' : ''} en ${RUTA_MAPA}. Claude lo usará antes de buscar a ciegas.`,
    }
  })

  // Acompañante: el panel del reporte y la franja sobre el prompt.
  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lineas = await reporte($)
    return (
      <Box flexDirection="column">
        {lineas.map(linea => (
          <Text>{linea === '' ? ' ' : linea}</Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!acompanante || e.props.hasSurvey || (await read($, oculto))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, sesion)
    const uso = await $.session.usage().catch(() => undefined)
    const pct = uso?.context.percent
    const ttlMinutos = (uso?.rateLimits.length ?? 0) > 0 ? 60 : 5 // Suscripción: 1 h. API: 5 min.
    const inactivo = s.ultimaActividad > 0 ? ((await $.clock.now()) - s.ultimaActividad) / 60_000 : 0
    const ocultar = <Button key="ocultar" plain label="ocultar" onPress={() => update($, oculto, () => true)} />

    if (!e.props.isWorking && pct !== undefined && pct >= UMBRAL_CONTEXTO) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="warning">
            Contexto al {pct}%: compacta en esta pausa, antes de que se haga solo a mitad de una tarea.
          </Text>
          <Button key="compactar" variant="primary" label="Compactar ahora" onPress={() => void $.session.compact({})} />
          {ocultar}
        </Box>
      )
    }
    if (!e.props.isWorking && s.ultimaActividad > 0 && inactivo >= ttlMinutos) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="warning">
            El caché se enfrió (sin actividad {Math.floor(inactivo)} min): tu próximo mensaje vuelve a procesar todo el contexto. Si cambias de tema, mejor /clear.
          </Text>
          {ocultar}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>
          ahorro-tokens · contexto {pct === undefined ? '—' : `${pct}%`} · ~{formatearTokens(s.tokensAhorrados)} tokens ahorrados · /ahorro
        </Text>
        {ocultar}
      </Box>
    )
  })
}
