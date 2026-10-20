// ahorro-tokens: el acompañante de ahorro de tokens para Claude Code.
// Todo corre dentro de Claude Code como mod: cero instrucciones fijas en el
// contexto, cero dependencias, y si algo falla, Claude sigue trabajando normal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Sesion } from '../types'
import { AVISO_BUCLE, UMBRAL_FALLOS, registrar } from './bucles'
import {
  compactar,
  encabezado,
  envolver,
  esCompactable,
  esCorta,
  formatearTokens,
  porQueNoCompactable,
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
import {
  actividadDeHerramienta,
  barra,
  colorDePorcentaje,
  cuadro,
  decidirActividad,
  formatearDuracion,
  formatearMinutos,
  frase,
  recortar,
  relojCache,
} from './mascota'
import type { Actividad } from './mascota'
import { agregarLeccion, filasGrafica, leccionCambioModelo, sumarAlDia, totalDesde } from './historial'
import type { Historial, Leccion } from './historial'
import { tokiSvg } from './toki-svg'
import {
  LIMITES_MEMORIA,
  MOTIVOS,
  extraerDecisiones,
  instruccionesDeCompactacion,
  notaPostCompactacion,
  primerError,
  recordar,
  registrarDecision,
  resumenCorto,
  vacio,
} from './memoria'
import type { Decision, PuntoDeControl } from './memoria'

/** Cambia en cada versión: así Claude Code recompila el módulo al recargar. */
export const VERSION = '0.5.0'

type $ = EngineInterface

const SESION_VACIA: Sesion = { tokensAhorrados: 0, compactaciones: 0, bucles: 0, ultimaActividad: 0, llamadas: 0 }
const sesion = atom({ plugin: 'ahorro-tokens', key: 'sesion' } as const, SESION_VACIA)
const oculto = atom({ plugin: 'ahorro-tokens', key: 'oculto' } as const, false)
const compacto = atom({ plugin: 'ahorro-tokens', key: 'compacto' } as const, false)
const detalles = atom({ plugin: 'ahorro-tokens', key: 'detalles' } as const, false)
const fallos = atom({ plugin: 'ahorro-tokens', key: 'fallos' } as const, {})
const avisoMapaDado = atom({ plugin: 'ahorro-tokens', key: 'avisoMapaDado' } as const, false)

const CARPETA = '.claude/ahorro-tokens'
const PANEL = 'ahorro-reporte'
const CLAVE_TOTAL = 'tokensAhorradosTotal'
const CLAVE_RANURA = 'ranuraArchivo'
const CLAVE_HISTORIAL = 'historialDiario'
const RANURAS = 40
/** Lo que Claude Code entrega de una salida exitosa sin ayuda: 30 KB. */
const LIMITE_CLAUDE_CODE = 30_000
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

/** Claude Code recorta la salida a 30 KB; mientras corre un comando ruidoso la dejamos llegar a 150 KB (luego se compacta). */
let comandosRuidososEnCurso = 0
let limiteOriginal: string | undefined
async function ampliarLimite($: $): Promise<void> {
  try {
    if (comandosRuidososEnCurso === 0) {
      limiteOriginal = await $.env.get('BASH_MAX_OUTPUT_LENGTH')
      await $.env.set('BASH_MAX_OUTPUT_LENGTH', '150000')
    }
    comandosRuidososEnCurso += 1
  } catch {
    // Sin permiso para tocar el entorno: seguimos con el recorte normal.
  }
}
async function restaurarLimite($: $): Promise<void> {
  try {
    comandosRuidososEnCurso = Math.max(0, comandosRuidososEnCurso - 1)
    if (comandosRuidososEnCurso === 0) await $.env.set('BASH_MAX_OUTPUT_LENGTH', limiteOriginal)
  } catch {
    // Nada.
  }
}

/**
 * Prepara la copia completa de la salida mientras el comando corre.
 * Solo en bash o zsh, y solo si el comando envuelto no pediría un permiso nuevo.
 */
async function planearCaptura($: $, comando: string): Promise<Captura | undefined> {
  try {
    const shell = (await $.env.get('SHELL')) ?? ''
    if (!/(^|\/)(bash|zsh)$/.test(shell)) {
      $.ui.log(`captura: shell no compatible: ${shell}`, { to: 'debug' })
      return undefined
    }
    const partes = separarComando(comando)
    if (partes === undefined) return undefined
    const ruta = await reservarRuta($)
    const absoluta = `${(await $.session.cwd()).replace(/\/$/, '')}/${ruta}`
    const envuelto = envolver(partes.prefijo, partes.cuerpo, absoluta)
    // Solo si envolverlo no cambia la decisión de permisos: nunca genera una pregunta nueva.
    const [original, permiso] = await Promise.all([
      $.tool.check({ tool: 'Bash', input: { command: comando } }),
      $.tool.check({ tool: 'Bash', input: { command: envuelto } }),
    ])
    $.ui.log(`captura: shell=${shell} original=${original.decision} envuelto=${permiso.decision}`, { to: 'debug' })
    if (permiso.decision === 'deny' || permiso.decision !== original.decision) return undefined
    await $.fs.write(ruta, '')
    return { comando: envuelto, ruta, absoluta }
  } catch (err) {
    $.ui.log(`captura falló: ${String(err)}`, { to: 'debug' })
    return undefined
  }
}

// Estado vivo del acompañante (se pierde al recargar; no importa, es efímero).
const vivo: {
  actividad: Actividad
  tick: number
  ultimoAhorro?: { tokens: number; comando: string }
  bucleReciente: boolean
  usoCache?: { pct?: number; tokens?: number; cincoHoras?: number; semana?: number; costo?: number; inicio: number; esSuscripcion: boolean }
  silencioPesadoHasta: number
  usoLeido: number
  lecciones: Leccion[]
  sonidos: boolean
  avisoReciente?: string
  avisoContexto?: boolean
  decisiones: Decision[]
  memoria: PuntoDeControl
  lecturas: Record<string, number>
  compactaciones: number
  nudgeConciso: boolean
  nudgeLecturas: boolean
  salidasGrandesEnTurno: number
  ultimaCompactacionVista: number
} = {
  actividad: 'tranquilo',
  tick: 0,
  bucleReciente: false,
  usoLeido: 0,
  lecciones: [],
  sonidos: true,
  decisiones: [],
  memoria: vacio(0),
  lecturas: {},
  compactaciones: 0,
  nudgeConciso: false,
  nudgeLecturas: false,
  salidasGrandesEnTurno: 0,
  ultimaCompactacionVista: 0,
  silencioPesadoHasta: 0,
}

/** Dos salidas enormes en un mismo turno: mejor delegar a un subagente. */
function registrarSalidaGrande($: $, caracteres: number): void {
  if (caracteres < 20_000) return
  vivo.salidasGrandesEnTurno += 1
  if (vivo.salidasGrandesEnTurno === 2) {
    vivo.lecciones = agregarLeccion(vivo.lecciones, {
      clave: 'subagente',
      texto: 'Hubo varias salidas enormes (tests, builds) en un mismo turno. Aunque las compacté, delegar esas corridas a un subagente (por ejemplo con model: haiku) deja la conversación principal limpia y cuesta una fracción.',
    })
    $.ui.toast('Toki: varias salidas enormes seguidas. Para esto, un subagente con Haiku sale más barato.', { timeoutMs: 7000 })
  }
}

function anotar(comando: string, resultado: Decision['resultado'], motivo: string, ahorro?: number): void {
  vivo.decisiones = registrarDecision(vivo.decisiones, { comando: recortar(comando, 60), resultado, motivo, ahorro })
}

/** Deja lista la nota que el hook SessionStart(compact) reinyecta tras compactar. */
async function guardarMemoria($: $): Promise<void> {
  try {
    await asegurarCarpeta($)
    vivo.memoria.cuando = await $.clock.now()
    await $.fs.write(`${CARPETA}/punto-de-control.json`, JSON.stringify(vivo.memoria, null, 2))
    await $.fs.write(`${CARPETA}/nota-post-compactacion.txt`, notaPostCompactacion(vivo.memoria))
  } catch {
    // Sin memoria guardada no pasa nada grave: Claude Code compacta como siempre.
  }
}

/** ¿Hubo una compactación? El hook de comando deja una marca de tiempo. */
async function detectarCompactacion($: $): Promise<void> {
  try {
    const { mtimeMs } = await $.fs.stat(`${CARPETA}/ultima-compactacion`)
    if (mtimeMs <= vivo.ultimaCompactacionVista) return
    const primeraVez = vivo.ultimaCompactacionVista === 0
    vivo.ultimaCompactacionVista = mtimeMs
    if (primeraVez && (await $.clock.now()) - mtimeMs > 60_000) return // Marca vieja de otra sesión.
    vivo.compactaciones += 1
    $.ui.toast(`Toki: se compactó el contexto y le recordé a Claude ${resumenCorto(vivo.memoria)}. Sigue donde quedó.`, { timeoutMs: 7000 })
    if (vivo.compactaciones >= 3) {
      vivo.lecciones = agregarLeccion(vivo.lecciones, {
        clave: 'muchas-compactaciones',
        texto: `Van ${vivo.compactaciones} compactaciones en esta sesión. Cada una resume y pierde detalle: para una tarea nueva, /clear deja un contexto limpio y más barato.`,
      })
    }
    $.ui.invalidate('ui.render')
  } catch {
    // Aún no hay marca.
  }
}

/** Una nota corta al final del contexto: no rompe el caché (solo se añade). */
async function notaParaClaude($: $, texto: string): Promise<void> {
  try {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: texto }] } })
  } catch {
    // Si la sesión no admite notas (p. ej. hooks apagados), no pasa nada.
  }
}

/** Un sonido corto y suave. En Linux y Windows la terminal no tiene reproductor: no pasa nada. */
function sonar($: $, nombre: 'ahorro' | 'listo' | 'aviso'): void {
  if (!vivo.sonidos) return
  void $.audio.play({ asset: `sonidos/${nombre}.wav` }, { gain: 0.5 }).catch(() => undefined)
}

async function leerHistorial($: $): Promise<Historial> {
  const guardado = await $.store.get(CLAVE_HISTORIAL)
  return guardado !== null && typeof guardado === 'object' ? (guardado as Historial) : {}
}

async function sumarAhorro($: $, caracteres: number, comando: string): Promise<void> {
  const tokens = tokensAprox(caracteres)
  await update($, sesion, s => ({ ...s, tokensAhorrados: s.tokensAhorrados + tokens, compactaciones: s.compactaciones + 1 }))
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  await $.store.set(CLAVE_TOTAL, total + tokens)
  const ahora = await $.clock.now()
  await $.store.set(CLAVE_HISTORIAL, sumarAlDia(await leerHistorial($), ahora, tokens))
  vivo.ultimoAhorro = { tokens, comando }
  $.ui.toast(`Toki te ahorró ~${formatearTokens(tokens)} tokens en «${recortar(comando, 40)}»`, { timeoutMs: 6000 })
  sonar($, 'ahorro')
}

/** Lee las cifras de la sesión como máximo cada 5 s (es la misma llamada barata de la status line). */
async function refrescarUso($: $): Promise<void> {
  const ahora = await $.clock.now()
  if (ahora - vivo.usoLeido < 5000) return
  vivo.usoLeido = ahora
  try {
    const uso = await $.session.usage()
    const limite = (kind: string) => uso.rateLimits.find(r => r.kind === kind)?.percentUsed
    vivo.usoCache = {
      pct: uso.context.percent,
      tokens: uso.context.tokens,
      cincoHoras: limite('five_hour'),
      semana: limite('seven_day'),
      costo: uso.cost?.usd,
      inicio: uso.startedAt,
      esSuscripcion: uso.rateLimits.length > 0,
    }
  } catch {
    // Sin cifras por ahora: la barra muestra guiones.
  }
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

type Reporte = {
  sesion: Sesion
  total: number
  hoy: number
  semana: number
  mes: number
  grafica: ReturnType<typeof filasGrafica>
  contexto?: { pct?: number; ventana: number; costo?: number; esSuscripcion: boolean }
  ocupan: { nombre: string; tokens: number }[]
  sugerencias: string[]
  lecciones: Leccion[]
  hayMapa: boolean
}

async function reporte($: $, anchoBarra = 24): Promise<Reporte> {
  const s = await read($, sesion)
  const ahora = await $.clock.now()
  const historial = await leerHistorial($)
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  const r: Reporte = {
    sesion: s,
    total,
    hoy: totalDesde(historial, ahora, 1),
    semana: totalDesde(historial, ahora, 7),
    mes: totalDesde(historial, ahora, 30),
    grafica: filasGrafica(historial, ahora, 14, anchoBarra),
    ocupan: [],
    sugerencias: [],
    lecciones: vivo.lecciones,
    hayMapa: await $.fs.exists(RUTA_MAPA).catch(() => false),
  }
  try {
    const uso = await $.session.usage({ breakdown: 'summary' })
    const pct = uso.context.percent
    r.contexto = { pct, ventana: uso.context.window, costo: uso.cost?.usd, esSuscripcion: uso.rateLimits.length > 0 }
    const desglose = uso.context.breakdown
    if (desglose !== undefined) {
      r.ocupan = desglose.categories
        .filter(c => c.kind === 'used' && c.tokens > 0)
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 5)
        .map(c => ({ nombre: c.name, tokens: c.tokens }))
      const memoria = desglose.memoryFiles.reduce((suma, f) => suma + f.tokens, 0)
      if (memoria > 5000) {
        r.sugerencias.push(`Tus archivos de memoria (CLAUDE.md y similares) pesan ~${formatearTokens(memoria)} tokens en cada mensaje. Mueve los flujos específicos a skills y deja el CLAUDE.md por debajo de 200 líneas.`)
      }
      const mcp = desglose.mcpTools.filter(t => t.isLoaded).reduce((suma, t) => suma + t.tokens, 0)
      if (mcp > 10_000) r.sugerencias.push(`Las herramientas MCP cargadas ocupan ~${formatearTokens(mcp)} tokens. Desactiva en /mcp los servidores que no estés usando.`)
    }
    if (pct !== undefined && pct >= 50) r.sugerencias.push('El contexto pasa de la mitad. Si terminaste una tarea, /compact en esta pausa; si vas a cambiar de tema, /clear.')
  } catch {
    // Sin cifras por ahora.
  }
  if (!r.hayMapa) r.sugerencias.push('Aún no hay mapa del proyecto. Créalo con /ahorro-mapa para que Claude se oriente sin leer archivos a ciegas.')
  r.sugerencias.push('Para respuestas más cortas sin perder lo técnico: /output-style → ahorro-tokens:conciso.')
  return r
}

function textoDecisiones(): string {
  if (vivo.decisiones.length === 0) return 'Toki aún no ha visto ningún comando de Bash en esta sesión (desde la última recarga del plugin).'
  const lineas = ['Últimos comandos y qué hizo Toki con cada uno:']
  for (const d of [...vivo.decisiones].reverse()) {
    const marca = d.resultado === 'compactado' ? '✓' : '·'
    const extra = d.ahorro !== undefined ? ` (~${formatearTokens(d.ahorro)} tokens ahorrados)` : ''
    lineas.push(`  ${marca} ${d.comando}`, `      ${d.resultado === 'compactado' ? 'compactado: ' : 'sin cambio: '}${d.motivo}${extra}`)
  }
  lineas.push('', 'Compacta: tests, builds, instalaciones, linters, logs, listados largos. No toca: lecturas de archivos, diffs ni salidas ya filtradas con | tail, | grep, etc.')
  return lineas.join('\n')
}

function reporteEnTexto(r: Reporte): string {
  const lineas = [
    `Toki · ~${formatearTokens(r.sesion.tokensAhorrados)} tokens ahorrados en esta sesión · hoy ~${formatearTokens(r.hoy)} · semana ~${formatearTokens(r.semana)} · histórico ~${formatearTokens(r.total)}`,
    `${r.sesion.compactaciones} salidas compactadas · ${r.sesion.llamadas} llamadas · ${r.sesion.bucles} bucles`,
  ]
  if (r.contexto) lineas.push(`Contexto: ${r.contexto.pct === undefined ? 'sin datos aún' : `${r.contexto.pct}% usado`} (ventana de ${formatearTokens(r.contexto.ventana)} tokens)`)
  if (r.ocupan.length > 0) {
    lineas.push('', 'Qué ocupa tu contexto ahora:')
    for (const c of r.ocupan) lineas.push(`  ${c.nombre}: ~${formatearTokens(c.tokens)}`)
  }
  lineas.push('', 'Ahorro de los últimos 14 días:')
  for (const f of r.grafica) lineas.push(`  ${f.etiqueta} ${f.barra} ${f.valor}`)
  if (r.lecciones.length > 0) {
    lineas.push('', 'Lo que Toki notó esta sesión:')
    for (const l of r.lecciones) lineas.push(`  • ${l.texto}`)
  }
  lineas.push('', 'Sugerencias:')
  for (const sug of r.sugerencias) lineas.push(`  • ${sug}`)
  return lineas.join('\n')
}

// ---------- Registro ----------

export const register: Register = (on, options) => {
  const compresion = options['compresion'] !== false
  const mapaAuto = options['mapaAutomatico'] !== false
  const acompanante = options['acompanante'] !== false
  vivo.sonidos = options['sonidos'] !== false
  const memoriaActiva = options['memoria'] !== false
  const concisoAuto = options['concisoAutomatico'] !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ahorro', description: 'ahorro-tokens: ver cuánto has ahorrado y qué ocupa tu contexto' })
    await $.command.register({ name: 'ahorro-mapa', description: 'ahorro-tokens: crear o actualizar el mapa del proyecto' })
    await $.command.register({ name: 'ahorro-por-que', description: 'ahorro-tokens: ver por qué se compactó (o no) cada comando reciente' })
    // Animación de la mascota: un cuadro cada 600 ms mientras la barra esté visible.
    if (acompanante) {
      $.clock.every(600, () => {
        vivo.tick += 1
        if (memoriaActiva && vivo.tick % 5 === 0) void detectarCompactacion($)
        void read($, oculto).then(estaOculto => {
          if (!estaOculto) $.ui.invalidate('ui.render')
        })
      })
    }
    if (mapaAuto) $.clock.after(3_000, () => void mapaAutomatico($))
    // Sesión reanudada: recupera el último punto de control si es reciente.
    if (memoriaActiva) {
      try {
        const guardado = JSON.parse(await $.fs.read(`${CARPETA}/punto-de-control.json`)) as PuntoDeControl
        if ((await $.clock.now()) - guardado.cuando < 24 * 3_600_000) vivo.memoria = { ...vacio(guardado.cuando), ...guardado }
      } catch {
        // No hay punto de control: se empieza de cero.
      }
    }
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

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      vivo.actividad = 'pensando'
      vivo.ultimoAhorro = undefined
      vivo.bucleReciente = false
      vivo.salidasGrandesEnTurno = 0
      if (e.text.trim() !== '' && !e.text.startsWith('/')) vivo.memoria.tareaActual = recortar(e.text, LIMITES_MEMORIA.tarea)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ahora = await $.clock.now()
      await update($, sesion, s => ({ ...s, ultimaActividad: ahora }))
      vivo.actividad = 'listo'
      if (vivo.ultimoAhorro !== undefined) sonar($, 'listo')
      for (const d of extraerDecisiones(e.answer)) vivo.memoria.decisiones = recordar(vivo.memoria.decisiones, d, LIMITES_MEMORIA.decisiones)
      if (memoriaActiva) await guardarMemoria($)
      await refrescarUso($)
      const uso = vivo.usoCache
      if ((uso?.tokens ?? 0) >= 200_000) {
        vivo.lecciones = agregarLeccion(vivo.lecciones, {
          clave: 'conversacion-pesada',
          texto: `La conversación pesa ~${formatearTokens(uso?.tokens ?? 0)} tokens y se reenvía completa en cada mensaje, aunque el porcentaje de la ventana parezca bajo. Esto es lo que más consume de tus límites: al terminar una tarea, /compact; al cambiar de tema, /clear.`,
        })
      }
      if (uso !== undefined && ahora - uso.inicio > 3 * 3_600_000) {
        vivo.lecciones = agregarLeccion(vivo.lecciones, {
          clave: 'sesion-larga',
          texto: 'Esta sesión lleva más de 3 horas. Cada mensaje reenvía toda la conversación: al cambiar de tarea, /clear (con /rename antes si quieres volver) sale más barato que seguir en el mismo hilo.',
        })
      }
      if (concisoAuto && !vivo.nudgeConciso && (uso?.pct ?? 0) >= 50) {
        vivo.nudgeConciso = true
        await notaParaClaude(
          $,
          '[ahorro-tokens] El contexto pasa del 50%. De aquí en adelante responde de forma concisa: sin preámbulos, sin resúmenes finales ni narración de cada paso. Nunca recortes código, comandos, rutas, errores ni advertencias.',
        )
        $.ui.toast('Toki: contexto al 50%. Le pedí a Claude respuestas más concisas (sin recortar lo técnico).', { timeoutMs: 6000 })
      }
      $.clock.after(12_000, () => {
        if (vivo.actividad === 'listo') {
          vivo.actividad = 'tranquilo'
          $.ui.invalidate('ui.render')
        }
      })
    }
    return next(e)
  })

  // Observador: qué está haciendo Claude, para que Toki lo actúe.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    vivo.actividad = actividadDeHerramienta(String(e.tool))
    await update($, sesion, s => ({ ...s, llamadas: s.llamadas + 1 }))
    const herramienta = String(e.tool)
    if ((herramienta === 'Edit' || herramienta === 'Write' || herramienta === 'MultiEdit') && typeof (e as { file_path?: unknown }).file_path === 'string') {
      vivo.memoria.archivosEditados = recordar(vivo.memoria.archivosEditados, String((e as { file_path?: unknown }).file_path), LIMITES_MEMORIA.archivos)
    }
    let nudgeLectura: string | undefined
    if (herramienta === 'Read') {
      const entrada = e as { file_path?: unknown; offset?: unknown; limit?: unknown }
      if (typeof entrada.file_path === 'string' && entrada.offset === undefined && entrada.limit === undefined) {
        const n = (vivo.lecturas[entrada.file_path] ?? 0) + 1
        vivo.lecturas[entrada.file_path] = n
        if (n >= 4 && !vivo.nudgeLecturas) {
          vivo.nudgeLecturas = true
          const nombre = entrada.file_path.split('/').pop() ?? entrada.file_path
          vivo.lecciones = agregarLeccion(vivo.lecciones, {
            clave: 'relecturas',
            texto: `Claude leyó «${nombre}» completo ${n} veces. Cuando un archivo ya se conoce, leer solo el rango necesario (offset/limit) evita reenviar todo su contenido.`,
          })
          nudgeLectura = `[ahorro-tokens] Ya leíste «${nombre}» completo ${n} veces. Si solo necesitas una parte, usa offset y limit; si no cambió, no hace falta releerlo.`
        }
      }
    }
    try {
      const ran = await next(e)
      if (nudgeLectura !== undefined && ran.deny === undefined && ran.isError !== true) return { ...ran, context: [...(ran.context ?? []), nudgeLectura] }
      return ran
    } finally {
      vivo.actividad = 'pensando'
    }
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const anterior = vivo.actividad
    vivo.actividad = 'esperando'
    $.ui.invalidate('ui.render')
    try {
      return await next(e)
    } finally {
      vivo.actividad = anterior
    }
  })

  // Toki aprende: un cambio de modelo con el caché caliente reprocesa todo el contexto.
  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.source !== 'resume' && e.prompt_cache_warm && e.context_tokens >= 20_000) {
      vivo.lecciones = agregarLeccion(vivo.lecciones, leccionCambioModelo(e.context_tokens, e.estimated_cache_write_usd, e.from_model, e.to_model))
      vivo.avisoReciente = `Cambio de modelo con el caché caliente: el próximo mensaje reprocesa ~${formatearTokens(e.context_tokens)} tokens.`
      $.clock.after(20_000, () => {
        vivo.avisoReciente = undefined
        $.ui.invalidate('ui.render')
      })
      $.ui.toast(`Toki: ${vivo.avisoReciente} Para una tarea chica, mejor un subagente con model: haiku.`, { timeoutMs: 9000 })
      sonar($, 'aviso')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Donde no hay guardia corporativo, además guiamos el resumen de la compactación.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || e.trigger === 'precompute') return next(e)
    const anterior = vivo.actividad
    vivo.actividad = 'compactando'
    $.ui.invalidate('ui.render')
    let entrada = e
    if (memoriaActiva) {
      await guardarMemoria($)
      const extra = instruccionesDeCompactacion(vivo.memoria)
      entrada = { ...e, instructions: e.instructions ? `${e.instructions}\n\n${extra}` : extra }
    }
    try {
      return await next(entrada)
    } finally {
      vivo.actividad = anterior === 'compactando' ? 'tranquilo' : anterior
    }
  })

  // Motor: compactar salidas ruidosas y detectar bucles.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const comando = e.command
    const motivoNo = porQueNoCompactable(comando)
    const compactable = compresion && motivoNo === undefined
    if (!compresion) anotar(comando, 'sin-cambio', MOTIVOS.apagado)
    else if (motivoNo !== undefined) anotar(comando, 'sin-cambio', MOTIVOS[motivoNo])
    vivo.memoria.comandosRecientes = recordar(vivo.memoria.comandosRecientes, recortar(comando, 80), LIMITES_MEMORIA.comandos)
    const captura = compactable ? await planearCaptura($, comando) : undefined
    if (compactable) await ampliarLimite($)
    // El modelo sigue viendo su comando original en el historial; solo cambia cómo se ejecuta.
    let ran
    try {
      ran = await next(captura ? { ...e, command: captura.comando } : e)
    } finally {
      if (compactable) await restaurarLimite($)
    }
    if (ran.deny !== undefined) return ran
    const fallo = ran.isError === true
    if (fallo) {
      const err = primerError(ran.text ?? '')
      if (err !== undefined) vivo.memoria.ultimosErrores = recordar(vivo.memoria.ultimosErrores, err, LIMITES_MEMORIA.errores)
    }

    const { fallos: nuevos, avisar } = registrar(await read($, fallos), comando, fallo)
    await update($, fallos, () => nuevos)
    if (avisar) {
      await update($, sesion, s => ({ ...s, bucles: s.bucles + 1 }))
      vivo.bucleReciente = true
      vivo.lecciones = agregarLeccion(vivo.lecciones, {
        clave: 'bucle',
        texto: `Un comando falló ${UMBRAL_FALLOS} veces seguidas («${recortar(comando, 30)}»). Cada reintento vuelve a enviar todo el contexto: ante un fallo repetido, conviene parar y revisar la causa.`,
      })
      $.ui.toast('Toki: el mismo comando falló 3 veces seguidas. Le pedí a Claude cambiar de enfoque.', { timeoutMs: 8000 })
      sonar($, 'aviso')
    }
    const avisoBucle = avisar ? AVISO_BUCLE : undefined

    if (compactable) {
      // La salida completa: la copia capturada si existe, si no lo que entregó Claude Code.
      let completa: string | undefined
      if (captura !== undefined) completa = await $.fs.read(captura.ruta).catch(() => undefined)
      const copiaCompleta = completa !== undefined && completa.length > 0

      if (ran.isError === true) {
        const texto = ran.text ?? ''
        const salida = texto.match(/^(Exit code \d+)\n?/)
        const cuerpo = completa !== undefined && completa.length > 0 ? completa : salida ? texto.slice(salida[0].length) : texto
        const c = compactar(cuerpo)
        if (c !== null) {
          const ruta = captura?.ruta ?? (await archivar($, texto))
          if (ruta !== undefined) {
            const ahorrado = Math.max(0, texto.length - c.caracteresDespues - 200)
            await sumarAhorro($, ahorrado, comando)
            anotar(comando, 'compactado', `${Math.round(c.caracteresAntes / 1024)} KB → ${(c.caracteresDespues / 1024).toFixed(1)} KB${copiaCompleta ? ', copia completa guardada' : ', copia parcial'}`, tokensAprox(ahorrado))
            registrarSalidaGrande($, cuerpo.length)
            return { deny: [salida?.[1], encabezado(c, ruta, copiaCompleta, tokensAprox(ahorrado)), c.texto, avisoBucle].filter(Boolean).join('\n') }
          }
          anotar(comando, 'sin-cambio', MOTIVOS.archivar)
        } else anotar(comando, 'sin-cambio', esCorta(cuerpo) ? MOTIVOS.corta : MOTIVOS.pocoAhorro)
      } else {
        const r = ran.result
        const enSegundoPlano = r.backgroundTaskId !== undefined || r.interrupted || r.isImage === true
        if (enSegundoPlano) anotar(comando, 'sin-cambio', MOTIVOS.segundoPlano)
        else {
          // Con captura, stdout y stderr vienen juntos en el orden real en que salieron.
          const fuente = completa !== undefined && completa.length > 0 ? completa : r.stdout
          const cOut = compactar(fuente)
          const cErr = captura === undefined && r.stderr ? compactar(r.stderr) : null
          if (cOut !== null || cErr !== null) {
            const ruta = captura?.ruta ?? (await archivar($, `=== stdout ===\n${r.stdout}\n\n=== stderr ===\n${r.stderr}`))
            if (ruta !== undefined) {
              // Contrafactual honesto: sin el plugin, Claude Code entrega como máximo 30 KB,
              // o una vista previa de ~2 KB cuando guarda la salida en un archivo.
              const leidoSinPlugin = r.persistedOutputPath !== undefined ? 2200 : Math.min(r.stdout.length + r.stderr.length, LIMITE_CLAUDE_CODE)
              const leidoConPlugin = (cOut?.caracteresDespues ?? 0) + (cErr?.caracteresDespues ?? 0) + 300
              const ahorrado = Math.max(0, leidoSinPlugin - leidoConPlugin)
              await sumarAhorro($, ahorrado, comando)
              const principal = cOut ?? cErr
              anotar(comando, 'compactado', principal ? `${Math.round(principal.caracteresAntes / 1024)} KB → ${(principal.caracteresDespues / 1024).toFixed(1)} KB${copiaCompleta ? ', copia completa guardada' : ', copia parcial'}` : 'compactado', tokensAprox(ahorrado))
              registrarSalidaGrande($, fuente.length)
              const cabecera = principal ? encabezado(principal, ruta, copiaCompleta, tokensAprox(ahorrado)) : ''
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
            anotar(comando, 'sin-cambio', MOTIVOS.archivar)
          } else anotar(comando, 'sin-cambio', esCorta(fuente) ? MOTIVOS.corta : MOTIVOS.pocoAhorro)
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
    return { text: reporteEnTexto(await reporte($)) }
  })

  on('command.run', { command: 'ahorro-por-que' }, async () => ({ text: textoDecisiones() }))

  on('command.run', { command: 'ahorro-mapa' }, async $ => {
    const { archivos, truncado } = await generarMapa($)
    if (archivos === 0) return { text: 'No encontré archivos de código para mapear en esta carpeta.' }
    return {
      text: `Mapa listo: ${archivos} archivos${truncado ? ' (recortado)' : ''} en ${RUTA_MAPA}. Claude lo usará antes de buscar a ciegas.`,
    }
  })

  // Acompañante: el panel del reporte y la franja sobre el prompt.
  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const ancho = e.props.bodyColumns
    const r = await reporte($, Math.max(8, Math.min(30, ancho - 22)))
    const cifra = (etiqueta: string, valor: string, color: 'success' | 'claude' | 'text' = 'text') => (
      <Box flexDirection="column" marginRight={3}>
        <Text color={color} bold>
          {valor}
        </Text>
        <Text dimColor>{etiqueta}</Text>
      </Box>
    )
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Text color="claude" bold>
            {cuadro(vivo.actividad, vivo.tick)} Toki cuida tus tokens
          </Text>
        </Box>
        <Box flexDirection="row" marginTop={1}>
          {cifra('esta sesión', `~${formatearTokens(r.sesion.tokensAhorrados)}`, 'success')}
          {cifra('hoy', `~${formatearTokens(r.hoy)}`)}
          {cifra('7 días', `~${formatearTokens(r.semana)}`)}
          {cifra('30 días', `~${formatearTokens(r.mes)}`)}
          {cifra('histórico', `~${formatearTokens(r.total)}`, 'claude')}
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text dimColor>
            {r.sesion.compactaciones} salidas compactadas · {r.sesion.llamadas} llamadas · {r.sesion.bucles} bucles
            {r.contexto ? ` · contexto ${r.contexto.pct === undefined ? '—' : `${r.contexto.pct}%`} de ${formatearTokens(r.contexto.ventana)}` : ''}
            {r.contexto?.costo !== undefined && !r.contexto.esSuscripcion ? ` · $${r.contexto.costo.toFixed(2)}` : ''}
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Ahorro por día (últimos 14 días)</Text>
          {r.grafica.map(f => (
            <Box flexDirection="row" gap={1}>
              <Text dimColor={!f.esHoy} bold={f.esHoy}>
                {f.etiqueta}
              </Text>
              <Text color={f.tokens > 0 ? 'success' : 'inactive'} mono>
                {f.barra}
              </Text>
              <Text dimColor={!f.esHoy}>{f.valor}</Text>
            </Box>
          ))}
        </Box>
        {r.ocupan.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Qué ocupa tu contexto ahora</Text>
            {r.ocupan.map(c => (
              <Text>
                {'  '}
                {c.nombre}: <Text dimColor>~{formatearTokens(c.tokens)}</Text>
              </Text>
            ))}
          </Box>
        )}
        {vivo.decisiones.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Últimos comandos (/ahorro-por-que)</Text>
            {[...vivo.decisiones].reverse().slice(0, 6).map(d => (
              <Text wrap="truncate-end">
                {'  '}
                <Text color={d.resultado === 'compactado' ? 'success' : 'inactive'}>{d.resultado === 'compactado' ? '✓' : '·'}</Text> {d.comando}{' '}
                <Text dimColor>
                  — {d.motivo}
                  {d.ahorro !== undefined ? ` (~${formatearTokens(d.ahorro)})` : ''}
                </Text>
              </Text>
            ))}
          </Box>
        )}
        {r.lecciones.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="warning">
              Lo que Toki notó esta sesión
            </Text>
            {r.lecciones.map(l => (
              <Text wrap="wrap">
                {'  • '}
                {l.texto}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Sugerencias</Text>
          {r.sugerencias.map(sug => (
            <Text wrap="wrap">
              {'  • '}
              {sug}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {!r.hayMapa && (
            <Button
              key="crear-mapa"
              label="Crear mapa del proyecto"
              onPress={() => void generarMapa($).then(() => $.ui.invalidate('ui.render'))}
            />
          )}
          <Button key="cerrar" plain dimColor label="cerrar" onPress={() => void $.ui.close({ id: PANEL })} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!acompanante || e.props.hasSurvey || (await read($, oculto))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, sesion)
    const esCompacto = await read($, compacto)
    const verDetalles = await read($, detalles)
    await refrescarUso($)
    const uso = vivo.usoCache
    const ahora = await $.clock.now()
    const pct = uso?.pct
    const ttl = uso?.esSuscripcion ? 60 : 5 // Suscripción: 1 h de caché. API: 5 min.
    const inactivo = s.ultimaActividad > 0 ? (ahora - s.ultimaActividad) / 60_000 : 0
    const cacheRestante = s.ultimaActividad > 0 ? Math.max(0, ttl - inactivo) : undefined
    const actividad = decidirActividad(vivo.actividad, e.props.isWorking, pct, inactivo, ttl, s.ultimaActividad > 0, uso?.tokens, ahora < vivo.silencioPesadoHasta)
    const dicho = frase({
      actividad,
      contextoPct: pct,
      contextoTokens: uso?.tokens,
      cacheMinutosRestantes: cacheRestante,
      inactivoMinutos: inactivo,
      ahorradoSesion: s.tokensAhorrados,
      ultimoAhorro: vivo.ultimoAhorro,
      bucleReciente: vivo.bucleReciente,
    })
    if (vivo.avisoReciente !== undefined && (actividad === 'tranquilo' || actividad === 'listo')) {
      dicho.texto = vivo.avisoReciente
      dicho.tono = 'aviso'
    }
    if (actividad === 'alerta' && vivo.avisoContexto !== true) {
      vivo.avisoContexto = true
      sonar($, 'aviso')
    }
    if (actividad !== 'alerta' && vivo.avisoContexto === true && (pct ?? 0) < 60) vivo.avisoContexto = false
    const colorFrase = dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : dicho.tono === 'bien' ? 'success' : 'text'
    const mascota = cuadro(actividad, vivo.tick)
    const ancho = e.props.bodyColumns
    const angosto = ancho < 90
    const colorCache = cacheRestante === undefined ? 'inactive' : cacheRestante <= 0 ? 'error' : cacheRestante < ttl * 0.25 ? 'warning' : 'success'
    const cacheTexto = cacheRestante === undefined ? '—' : cacheRestante <= 0 ? 'frío' : formatearMinutos(cacheRestante)
    const pctTexto = pct === undefined ? '—' : `${pct}%`

    const botonOcultar = <Button key="ocultar" plain dimColor label="×" onPress={() => update($, oculto, () => true)} />
    const botonTamano = (
      <Button key="tamano" plain dimColor label={esCompacto ? '+' : '−'} onPress={() => update($, compacto, v => !v)} />
    )

    if (esCompacto) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="claude">{mascota}</Text>
          <Text color={colorDePorcentaje(pct)}>ctx {pctTexto}</Text>
          <Text dimColor>·</Text>
          <Text color={colorCache}>caché {cacheTexto}</Text>
          <Text dimColor>·</Text>
          <Text color="success">~{formatearTokens(s.tokensAhorrados)} ahorrados</Text>
          {dicho.tono !== 'normal' && dicho.tono !== 'bien' && <Text color={colorFrase}>· {recortar(dicho.texto, Math.max(20, ancho - 60))}</Text>}
          <Box flexGrow={1} />
          {botonTamano}
          {botonOcultar}
        </Box>
      )
    }

    const anchoBarra = angosto ? 8 : 14
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : 'claude'} paddingX={1}>
        <Box flexDirection="row" gap={1}>
          {e.surface === 'terminal' ? (
            <Text color="claude" bold>
              {mascota}
            </Text>
          ) : (
            (() => {
              const { Svg } = $.ui.resolve(e)
              return <Svg source={tokiSvg(actividad)} alt={`Toki, ${actividad}`} width={50} height={36} isInteractive />
            })()
          )}
          <Text color="claude" bold>
            Toki
          </Text>
          <Text dimColor>·</Text>
          <Text color={colorFrase} wrap="truncate-end">
            {dicho.texto}
          </Text>
          {dicho.accion === 'compactar' && (
            <Button key="compactar" variant="primary" hotkey="c" label="Compactar ahora" onPress={() => void $.session.compact({})} />
          )}
          {dicho.accion === 'compactar' && (pct ?? 0) < 70 && (
            <Button
              key="luego"
              plain
              dimColor
              label="en 30 min"
              onPress={() => {
                vivo.silencioPesadoHasta = ahora + 30 * 60_000
                $.ui.invalidate('ui.render')
              }}
            />
          )}
          <Box flexGrow={1} />
          {botonTamano}
          {botonOcultar}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>contexto</Text>
          <Text color={colorDePorcentaje(pct)} mono>
            {barra(pct, anchoBarra)} {pctTexto}
          </Text>
          <Text dimColor>·</Text>
          <Text dimColor>caché</Text>
          <Text color={colorCache}>
            {relojCache(cacheRestante, ttl)} {cacheTexto}
          </Text>
          <Text dimColor>·</Text>
          <Text dimColor>ahorrado</Text>
          <Text color="success" bold>
            ~{formatearTokens(s.tokensAhorrados)}
          </Text>
          {uso?.cincoHoras !== undefined && !angosto && (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>·</Text>
              <Text dimColor>5 h</Text>
              <Text color={colorDePorcentaje(uso.cincoHoras)}>{Math.round(uso.cincoHoras)}%</Text>
            </Box>
          )}
          {uso?.semana !== undefined && !angosto && (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>·</Text>
              <Text dimColor>semana</Text>
              <Text color={colorDePorcentaje(uso.semana)}>{Math.round(uso.semana)}%</Text>
            </Box>
          )}
          <Box flexGrow={1} />
          <Button key="detalles" plain dimColor label={verDetalles ? '▾ menos' : '▸ más'} onPress={() => update($, detalles, v => !v)} />
        </Box>
        {verDetalles && (
          <Box flexDirection="row" gap={1}>
            <Text dimColor>
              sesión {uso ? formatearDuracion(ahora - uso.inicio) : '—'} · {s.llamadas} llamadas · {s.compactaciones} salidas compactadas · {s.bucles} bucles
              {uso?.costo !== undefined && !uso.esSuscripcion ? ` · $${uso.costo.toFixed(2)}` : ''} · histórico ~{formatearTokens(Number((await $.store.get(CLAVE_TOTAL)) ?? 0))} · /ahorro
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
