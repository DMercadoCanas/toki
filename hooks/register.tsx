// Toki: tu acompañante de ahorro de tokens para Claude Code. Cada token cuenta.
// Corre dentro de Claude Code como mod: cero instrucciones fijas en el contexto,
// cero dependencias, y si algo falla, Claude sigue trabajando normal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderNode, ResolveInput, ToolCallResult } from 'claude-code'

import type { Sesion } from '../types'
import { avisoBucle, registrar, UMBRAL_FALLOS } from './bucles'
import { debeMantenerCache, evaluarPing } from './cache'
import {
  bytesDeBase64,
  compactar,
  decodificarUtf16,
  encabezado,
  envolver,
  envolverPs,
  envolverRescate,
  envolverRescatePs,
  esCorta,
  esRuidoso,
  porQueNoCompactable,
  rescatarErrores,
  separarComando,
  separarComandoPs,
  separarSelectLast,
  separarTail,
  tokensAprox,
} from './compresor'
import type { Compactado } from './compresor'
import { agregarLeccion, filasGrafica, fusionarHistorial, leccionCambioModelo, LOGROS, logrosNuevos, nombreModelo, racha, sumarAlDia, totalDesde } from './historial'
import type { Historial, Leccion, Logro } from './historial'
import { detectarIdioma, idiomaDeTexto, quitarEtiquetasDeSistema, t } from './idioma'
import type { Idioma, Textos } from './idioma'
import { avisoMapa, CARPETAS_IGNORADAS, construirMapa, esBusqueda, extraerFicha, lenguaje, LIMITES_MAPA, RUTA_MAPA } from './mapa'
import type { FichaArchivo } from './mapa'
import { actividadDeHerramienta, barra, colorDePorcentaje, cuadro, decidirActividad, formatearDuracion, formatearMinutos, formatearTokens, frase, recortar, relojCache } from './mascota'
import type { Actividad } from './mascota'
import { estaVacia, extraerDecisiones, instruccionesDeCompactacion, LIMITES_MEMORIA, motivo, notaPostCompactacion, primerError, recordar, registrarDecision, resumenCorto, vacio } from './memoria'
import type { Decision, Motivo, PuntoDeControl } from './memoria'
import {
  decidirInterfaz,
  diferencia,
  esEsfuerzo,
  etiquetas,
  ETIQUETAS_CLASIFICADOR,
  familiaDe,
  hermano,
  igual,
  leerModo,
  limpiarPrompt,
  modeloSubagente,
  nivelHeuristico,
  nombreCorto,
  proponer,
  REESCRITURA_QUE_PREGUNTA,
  textoDiferencia,
  textosRuta,
} from './modelo'
import type { Esfuerzo, ModoRuta, Motivo as MotivoRuta, Nivel, Opcion, Propuesta, TextosRuta, TipoOpcion } from './modelo'
import {
  alCompactar,
  contarPedido,
  contarTemprana,
  decidirVentana,
  esRepetida,
  GASTO_VACIO,
  huella,
  iniciarTemprana,
  leerVentana,
  MIN_REPETIDA,
  porcentajeRelectura,
  RELECTURAS_VACIAS,
  retirar,
  sumarPedido,
  tamanoDelPedido,
  totalGasto,
} from './gasto'
import type { Gasto, Relecturas, Repetida, Temprana, UsoPedido } from './gasto'
import { tokiSvg } from './toki-svg'
import { TRAMO_GENERADO, textosGenerados, tipoGenerado } from './generados'
import { PEGADO, recortarPegado, textosPegado } from './pegados'
import { resumirBusqueda, tipoBusqueda } from './busquedas'
import type { TipoBusqueda } from './busquedas'
import { avisoSemana, CONTEXTO_LARGO, leerSemanas, lunesDe, sumarSemana, tarjetaPendiente, tarjetaSemana } from './semana'
import type { Delta, Semanas, TipoAhorro } from './semana'
import { formatear as formatearPresupuesto, gastado, leerOrden, marcarAvisado, nuevoPresupuesto, porcentaje, subir, textosPresupuesto, umbralCruzado } from './presupuesto'
import type { Presupuesto, TipoOpcionPresupuesto } from './presupuesto'
import { agregarMuestra, claveVentana, DURACION, evaluarCacheFrio, FRIO, hora, opcionesFrio, preguntaFrio, proyectar, textosGuardia, VENTANAS } from './guardia'
import type { Muestra, OpcionLimite, Proyeccion, TextosGuardia, VentanaLimite } from './guardia'

/** Cambia en cada versión: así Claude Code recompila el módulo al recargar. */
export const VERSION = '0.13.0'

type $ = EngineInterface
type Tono = 'normal' | 'bien' | 'aviso' | 'peligro'

const SESION_VACIA: Sesion = { tokensAhorrados: 0, compactaciones: 0, bucles: 0, ultimaActividad: 0, llamadas: 0, relecturasEvitadas: 0 }
const sesion = atom({ plugin: 'toki', key: 'sesion' } as const, SESION_VACIA)
const gasto = atom({ plugin: 'toki', key: 'gasto' } as const, GASTO_VACIO)
const oculto = atom({ plugin: 'toki', key: 'oculto' } as const, false)
const compacto = atom({ plugin: 'toki', key: 'compacto' } as const, false)
const detalles = atom({ plugin: 'toki', key: 'detalles' } as const, false)
const fallos = atom({ plugin: 'toki', key: 'fallos' } as const, {})
const avisoMapaDado = atom({ plugin: 'toki', key: 'avisoMapaDado' } as const, false)

const CARPETA = '.claude/toki'
const PANEL = 'toki-panel'
const CLAVE_TOTAL = 'tokensAhorradosTotal'
const CLAVE_RANURA = 'ranuraArchivo'
const CLAVE_HISTORIAL = 'historialDiario'
const CLAVE_LOGROS = 'logros'
const CLAVE_IDIOMA = 'idiomaDetectado'
const CLAVE_MIGRADO = 'migradoDesdeAhorroTokens'
const CLAVE_RELECTURAS = 'relecturasEvitadasTotal'
const CLAVE_SEMANAS = 'semanas'
const CLAVE_TARJETA = 'tarjetaSemanalMostrada'
/** El valor que Toki puso en la variable, para no confundirlo con uno tuyo. */
const CLAVE_VENTANA = 'ventanaPuestaPorToki'
/** La ventana que Claude Code usaría sin Toki, por modelo. */
const CLAVE_VENTANA_NATIVA = 'ventanaNativa'
const RANURAS = 40
/** Lo que Claude Code entrega de una salida exitosa sin ayuda: 30 KB. */
const LIMITE_CLAUDE_CODE = 30_000
const HORAS_MAPA_VIGENTE = 24
/** Por debajo de esto, una compactación o un cambio de modelo cuestan poco: Toki no avisa. */
const CONTEXTO_RELEVANTE = 20_000
/** Desde aquí cada mensaje relee mucho: Toki le pide a Claude respuestas más concisas. */
const UMBRAL_CONCISO = 150_000

/** Las opciones de /plugin, leídas al registrar. */
const config = {
  compresion: true,
  mapaAuto: true,
  acompanante: true,
  memoria: true,
  conciso: true,
  mantenerCache: false,
  idioma: 'auto',
  /** Tokens a los que Claude Code compacta; 0 = no tocar la de Claude Code. */
  ventana: 300_000,
  repetidas: true,
  avisoCacheFrio: true,
  guardiaLimites: true,
  guardiaGenerados: true,
  guardiaPegados: true,
  busquedas: true,
}

// Estado vivo del acompañante (se pierde al recargar el plugin; es efímero a propósito).
const vivo: {
  idioma: Idioma
  idiomaFijo: boolean
  idiomaConfirmado: boolean
  votoIdioma?: { idioma: Idioma; n: number }
  actividad: Actividad
  tick: number
  /** Cuándo arrancó este proceso: separa las marcas de compactación viejas de las nuevas. */
  inicio: number
  enTurno: boolean
  ultimoTurnoCompleto: number
  /** Tamaño del contexto al terminar el último turno. */
  tokensUltimoTurno: number
  /** Última cifra del contexto que se vio (para notar una compactación a mitad de turno). */
  tokensVistos?: number
  ultimoAhorro?: { tokens: number; comando: string }
  bucleReciente: boolean
  usoCache?: {
    pct?: number
    ventana: number
    tokens?: number
    cincoHoras?: number
    semana?: number
    costo?: number
    inicio: number
    esSuscripcion: boolean
    reinicios: Partial<Record<VentanaLimite, number>>
  }
  usoLeido: number
  /** Costo de la sesión ya sumado a la semana. */
  costoContado: number
  /** Tokens que leyó la API en esta sesión (principal y subagentes): la base del presupuesto en tokens. */
  tokensSesion: number
  silencioPesadoHasta: number
  lecciones: Leccion[]
  sonidos: boolean
  mensaje?: { texto: string; tono: Tono; hasta: number }
  avisoContexto: boolean
  decisiones: Decision[]
  memoria: PuntoDeControl
  lecturas: Record<string, number>
  compactaciones: number
  ultimaCompactacion: number
  notaInyectada: number
  marcaVista: number
  nudgeConciso: boolean
  nudgeLecturas: boolean
  /** Lecturas enteras pedidas por archivo generado: 1 = frenada, 2 = tramo, 3+ = entera. */
  generadosFrenados: Map<string, number>
  salidasGrandesEnTurno: number
  modelo?: string
  modeloUltimoTurno?: string
  avisoModeloEn: number
  /** La última vez que algo usó el caché: un turno, una herramienta o un ping. */
  ultimoUsoCache: number
  /** % del último turno que salió del caché (cifra real de la API). */
  aprovechado?: number
  pingEnCurso: boolean
  pingsEnPausa: number
  apagadoEnPausa: boolean
  pingsTotales: number
  tokensLeidosPing: number
  celebrandoHasta: number
  /** La franja sobre el prompt se llegó a dibujar (en la app de Claude puede no existir). */
  bandaDibujada: boolean
  panelDibujado: boolean
  racha: number
  total: number
  /** Lo que Toki sacó del contexto y Claude habría releído en cada pedido. */
  relecturas: Relecturas
  /** Una compactación que Toki adelantó: lo que se ahorra en los pedidos siguientes. */
  temprana?: Temprana
  /** La ventana a la que Claude Code compacta ahora, y de quién es. */
  ventana?: number
  ventanaNativa?: number
  ventanaFuente?: 'toki' | 'tuya' | 'nativa'
  /** El pedido más grande desde la última compactación (el tamaño "antes"). */
  contextoMax: number
  /** Tamaño del último pedido del hilo principal. */
  contextoPedido?: number
  /** La última salida de cada comando, para notar una idéntica. */
  repetidas: Record<string, Repetida>
} = {
  idioma: 'es',
  idiomaFijo: false,
  idiomaConfirmado: false,
  actividad: 'tranquilo',
  tick: 0,
  inicio: 0,
  enTurno: false,
  ultimoTurnoCompleto: 0,
  tokensUltimoTurno: 0,
  bucleReciente: false,
  usoLeido: 0,
  costoContado: 0,
  tokensSesion: 0,
  silencioPesadoHasta: 0,
  lecciones: [],
  sonidos: true,
  avisoContexto: false,
  decisiones: [],
  memoria: vacio(0),
  lecturas: {},
  compactaciones: 0,
  ultimaCompactacion: 0,
  notaInyectada: 0,
  marcaVista: 0,
  nudgeConciso: false,
  nudgeLecturas: false,
  generadosFrenados: new Map<string, number>(),
  salidasGrandesEnTurno: 0,
  avisoModeloEn: 0,
  ultimoUsoCache: 0,
  pingEnCurso: false,
  pingsEnPausa: 0,
  apagadoEnPausa: false,
  pingsTotales: 0,
  tokensLeidosPing: 0,
  celebrandoHasta: 0,
  bandaDibujada: false,
  panelDibujado: false,
  racha: 0,
  total: 0,
  relecturas: RELECTURAS_VACIAS,
  contextoMax: 0,
  repetidas: {},
}

/** Toki en pixel art, animado dentro del SVG (fuera de la terminal). */
function mascotaGrafica($: $, e: ResolveInput, actividad: Actividad, tamano: number): RenderElement | '' {
  if (e.surface === 'terminal') return ''
  const { Svg } = $.ui.resolve(e)
  return <Svg source={tokiSvg(actividad)} alt={`Toki, ${actividad}`} width={tamano} height={tamano} />
}

function tx(): Textos {
  return t(vivo.idioma)
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`
}

/** Suscripción: 1 h de caché. API: 5 min. */
function ttlMinutos(): number {
  return vivo.usoCache?.esSuscripcion ? 60 : 5
}

function decir(ahora: number, texto: string, tono: Tono, ms: number): void {
  vivo.mensaje = { texto, tono, hasta: ahora + ms }
}

// ---------- Idioma ----------

async function localeDelSistema($: $): Promise<string | undefined> {
  try {
    const todo = await $.env.get('LC_ALL')
    if (todo) return todo
    const mensajes = await $.env.get('LC_MESSAGES')
    if (mensajes) return mensajes
    return await $.env.get('LANG')
  } catch {
    return undefined
  }
}

/** Fijo en la configuración, o el último que Toki aprendió de tus mensajes, o el del sistema. */
async function elegirIdioma($: $): Promise<void> {
  if (config.idioma === 'es' || config.idioma === 'en') {
    vivo.idioma = config.idioma
    vivo.idiomaFijo = true
    return
  }
  vivo.idiomaFijo = false
  try {
    const guardado = await $.store.get(CLAVE_IDIOMA)
    if (guardado === 'es' || guardado === 'en') {
      vivo.idioma = guardado
      vivo.idiomaConfirmado = true
      return
    }
  } catch {
    // Sin store: se usa el del sistema.
  }
  vivo.idioma = detectarIdioma('auto', await localeDelSistema($))
}

/** Toki habla el idioma en que le escribes a Claude. Cambia tras dos mensajes seguidos en otro idioma. */
async function aprenderIdioma($: $, texto: string): Promise<void> {
  if (vivo.idiomaFijo) return
  const detectado = idiomaDeTexto(texto)
  if (detectado === undefined) return
  if (detectado === vivo.idioma) {
    vivo.votoIdioma = undefined
    if (!vivo.idiomaConfirmado) {
      vivo.idiomaConfirmado = true
      await $.store.set(CLAVE_IDIOMA, detectado).catch(() => undefined)
    }
    return
  }
  const votos = vivo.votoIdioma?.idioma === detectado ? vivo.votoIdioma.n + 1 : 1
  vivo.votoIdioma = { idioma: detectado, n: votos }
  if (vivo.idiomaConfirmado && votos < 2) return
  vivo.idioma = detectado
  vivo.idiomaConfirmado = true
  vivo.votoIdioma = undefined
  await $.store.set(CLAVE_IDIOMA, detectado).catch(() => undefined)
  $.ui.invalidate('ui.render')
}

// ---------- Archivos ----------

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
  const partes = separarComando(comando)
  if (partes === undefined) return undefined
  return prepararEnvoltura($, 'Bash', comando, absoluta => envolver(partes.prefijo, partes.cuerpo, absoluta))
}

/** Lo mismo en PowerShell, con Tee-Object. */
async function planearCapturaPs($: $, comando: string): Promise<Captura | undefined> {
  const partes = separarComandoPs(comando)
  if (partes === undefined) return undefined
  return prepararEnvoltura($, 'PowerShell', comando, absoluta => envolverPs(partes.prefijo, partes.cuerpo, absoluta))
}

/** El `| Select-Object -Last N` de PowerShell, que esconde errores igual que un `| tail`. */
async function planearRescatePs($: $, comando: string): Promise<Captura | undefined> {
  const partes = separarSelectLast(comando)
  if (partes === undefined || !esRuidoso(partes.base)) return undefined
  const base = separarComandoPs(partes.base)
  if (base === undefined) return undefined
  return prepararEnvoltura($, 'PowerShell', comando, absoluta => envolverRescatePs(base.prefijo, base.cuerpo, partes.filtro, absoluta))
}

/** Un test o build cortado con `| tail`: se guarda la salida completa en el camino, sin cambiar lo que Claude ve. */
async function planearRescate($: $, comando: string): Promise<Captura | undefined> {
  const partes = separarTail(comando)
  if (partes === undefined || !esRuidoso(partes.base)) return undefined
  // Un `cd carpeta &&` inicial queda fuera de las llaves para que el cambio de carpeta siga valiendo.
  const base = separarComando(partes.base)
  if (base === undefined) return undefined
  return prepararEnvoltura($, 'Bash', comando, absoluta => envolverRescate(base.prefijo, base.cuerpo, partes.filtro, absoluta))
}

/** La decisión de permisos de Claude Code para un comando (allow, ask o deny). */
async function decisionDePermiso($: $, herramienta: 'Bash' | 'PowerShell', command: string): Promise<string> {
  // PowerShell existe en Windows (o con CLAUDE_CODE_USE_POWERSHELL_TOOL), pero los tipos solo nombran Bash.
  const r = herramienta === 'Bash' ? await $.tool.check({ tool: 'Bash', input: { command } }) : await $.tool.check({ tool: 'PowerShell', input: { command } } as never)
  return String((r as { decision?: unknown }).decision)
}

async function prepararEnvoltura($: $, herramienta: 'Bash' | 'PowerShell', comando: string, construir: (absoluta: string) => string): Promise<Captura | undefined> {
  try {
    if (herramienta === 'Bash') {
      const shell = (await $.env.get('SHELL')) ?? ''
      if (!/(^|\/)(bash|zsh)$/.test(shell)) {
        $.ui.log(`captura: shell no compatible: ${shell}`, { to: 'debug' })
        return undefined
      }
    }
    const ruta = await reservarRuta($)
    const absoluta = `${(await $.session.cwd()).replace(/[\\/]$/, '')}/${ruta}`
    const envuelto = construir(absoluta)
    // Solo si envolverlo no cambia la decisión de permisos: nunca genera una pregunta nueva.
    const [original, permiso] = await Promise.all([decisionDePermiso($, herramienta, comando), decisionDePermiso($, herramienta, envuelto)])
    $.ui.log(`captura (${herramienta}): original=${original} envuelto=${permiso}`, { to: 'debug' })
    if (permiso === 'deny' || permiso !== original) return undefined
    await $.fs.write(ruta, '')
    return { comando: envuelto, ruta, absoluta }
  } catch (err) {
    $.ui.log(`captura falló: ${String(err)}`, { to: 'debug' })
    return undefined
  }
}

/** La copia capturada. Si pesa más de 4 MiB no se puede leer entera, pero existe y Claude puede buscar en ella. */
async function leerCaptura($: $, captura: Captura | undefined): Promise<{ texto?: string; existe: boolean }> {
  if (captura === undefined) return { existe: false }
  try {
    let texto = await $.fs.read(captura.ruta)
    // Windows PowerShell 5.1 escribe la copia en UTF-16: se vuelve a leer como bytes.
    if (texto.includes('\u0000')) texto = decodificarUtf16(bytesDeBase64((await $.fs.read(captura.ruta, { as: 'bytes' })).base64))
    return texto.length > 0 ? { texto, existe: true } : { existe: false }
  } catch {
    try {
      return { existe: (await $.fs.stat(captura.ruta)).size > 0 }
    } catch {
      return { existe: false }
    }
  }
}

// ---------- Avisos, sonidos y cifras ----------

/** Un sonido corto y suave. En Linux y Windows la terminal no tiene reproductor: no pasa nada. */
function sonar($: $, nombre: 'ahorro' | 'listo' | 'aviso' | 'logro'): void {
  if (!vivo.sonidos) return
  void $.audio.play({ asset: `sonidos/${nombre}.wav` }, { gain: 0.5 }).catch(() => undefined)
}

/** Una nota corta al final del contexto: no rompe el caché (solo se añade). */
async function notaParaClaude($: $, texto: string): Promise<void> {
  try {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: texto }] } })
  } catch {
    // Si la sesión no admite notas, no pasa nada.
  }
}

async function leerHistorial($: $): Promise<Historial> {
  const guardado = await $.store.get(CLAVE_HISTORIAL)
  return guardado !== null && typeof guardado === 'object' ? (guardado as Historial) : {}
}

async function leerLogros($: $): Promise<string[]> {
  const guardado = await $.store.get(CLAVE_LOGROS)
  return Array.isArray(guardado) ? guardado.filter((l): l is string => typeof l === 'string') : []
}

/**
 * Toki se llamaba ahorro-tokens: al cambiar de nombre, Claude Code le da un almacén nuevo.
 * La primera vez, Toki busca el almacén viejo y suma su total y su historial (una sola vez).
 */
async function migrarDesdeAhorroTokens($: $): Promise<number> {
  try {
    if ((await $.store.get(CLAVE_MIGRADO)) === true) return 0
    await $.store.set(CLAVE_MIGRADO, true)
    const dirConfig = await $.env.get('CLAUDE_CONFIG_DIR')
    const casa = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const base = dirConfig ?? (casa !== undefined ? `${casa.replace(/[\\/]$/, '')}/.claude` : undefined)
    if (base === undefined) return 0
    const carpeta = `${base}/plugins/store`
    let total = 0
    let historial: Historial = {}
    for (const entrada of await $.fs.list(carpeta)) {
      if (entrada.kind !== 'file' || !/^ahorro-tokens_.*\.json$/.test(entrada.name)) continue
      try {
        const viejo = JSON.parse(await $.fs.read(`${carpeta}/${entrada.name}`)) as Record<string, unknown>
        const suyo = Number(viejo[CLAVE_TOTAL] ?? 0)
        if (Number.isFinite(suyo) && suyo > 0) total += suyo
        const dias = viejo[CLAVE_HISTORIAL]
        if (dias !== null && typeof dias === 'object') historial = fusionarHistorial(historial, dias as Historial)
      } catch {
        // Un almacén ilegible se ignora.
      }
    }
    if (total <= 0) return 0
    await $.store.set(CLAVE_TOTAL, Number((await $.store.get(CLAVE_TOTAL)) ?? 0) + total)
    await $.store.set(CLAVE_HISTORIAL, fusionarHistorial(await leerHistorial($), historial))
    $.ui.log(`migración: ${total} tokens y ${Object.keys(historial).length} días desde ahorro-tokens`, { to: 'debug' })
    return total
  } catch {
    return 0
  }
}

/** Revisa si hay logros nuevos y los celebra. Devuelve los recién desbloqueados. */
async function revisarLogros($: $, extra: { memoria?: boolean; rescate?: boolean } = {}): Promise<Logro[]> {
  try {
    const ahora = await $.clock.now()
    const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
    const rachaActual = racha(await leerHistorial($), ahora)
    vivo.total = total
    vivo.racha = rachaActual
    const ya = await leerLogros($)
    const nuevos = logrosNuevos(ya, { total, racha: rachaActual, ...extra })
    if (nuevos.length === 0) return []
    await $.store.set(CLAVE_LOGROS, [...ya, ...nuevos])
    const x = tx()
    const nombres = nuevos.map(l => x.logroNombres[l] ?? l).join(' · ')
    vivo.celebrandoHasta = ahora + 7_000
    decir(ahora, x.fraseLogro(nombres), 'bien', 15_000)
    $.ui.toast(x.toastLogro(nombres), { timeoutMs: 7000 })
    sonar($, 'logro')
    $.clock.after(7_100, () => $.ui.invalidate('ui.render'))
    $.ui.invalidate('ui.render')
    return nuevos
  } catch {
    return []
  }
}

// ---------- Presupuesto por tarea ----------

const tarea: { p?: Presupuesto } = {}

function xp() {
  return textosPresupuesto(vivo.idioma)
}

function actualDe(p: Presupuesto): number {
  return p.unidad === 'usd' ? vivo.costoContado : vivo.tokensSesion
}

function textoGastado(p: Presupuesto): { g: string; limite: string; pct: number } {
  const actual = actualDe(p)
  return { g: formatearPresupuesto(p.unidad, gastado(p, actual)), limite: formatearPresupuesto(p.unidad, p.limite), pct: porcentaje(p, actual) }
}

/** Tras cada pedido (o cada cambio de costo): avisa al 50 %, al 80 % y al pasarlo. */
async function revisarPresupuesto($: $): Promise<void> {
  const p = tarea.p
  if (p === undefined) return
  const u = umbralCruzado(p, actualDe(p))
  if (u === undefined) return
  tarea.p = marcarAvisado(p, u)
  const { g, limite } = textoGastado(p)
  const ahora = await $.clock.now()
  const texto = u >= 100 ? xp().pasado(g, limite) : xp().aviso(u, g, limite)
  decir(ahora, texto.replace(/^Toki: /, ''), u >= 100 ? 'peligro' : 'aviso', 20_000)
  $.ui.toast(texto, { timeoutMs: 9_000 })
  sonar($, 'aviso')
  $.ui.invalidate('ui.render')
}

/** Antes de tu mensaje, si la tarea ya pasó su presupuesto: ¿modo ahorro, subirlo o parar? Una vez por tope. */
async function guardiaPresupuesto($: $, texto: string): Promise<ResultadoGuardia | undefined> {
  const p = tarea.p
  if (p === undefined || p.preguntado || p.ahorro || porcentaje(p, actualDe(p)) < 100) return undefined
  tarea.p = { ...p, preguntado: true }
  const x = xp()
  const { g, limite } = textoGastado(p)
  const subido = subir(p, actualDe(p))
  const opciones: { tipo: TipoOpcionPresupuesto; etiqueta: string }[] = [
    { tipo: 'ahorro', etiqueta: x.opcion.ahorro },
    { tipo: 'subir', etiqueta: x.opcion.subir(formatearPresupuesto(p.unidad, subido.limite)) },
    { tipo: 'parar', etiqueta: x.opcion.parar },
    { tipo: 'quitar', etiqueta: x.opcion.quitar },
  ]
  sonar($, 'aviso')
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta(g, limite), { header: 'Toki', options: opciones.map(o => o.etiqueta) })
  } catch {
    return undefined
  }
  const tipo: TipoOpcionPresupuesto =
    opciones.find(o => o.etiqueta === respuesta)?.tipo ?? (/par|stop/i.test(respuesta) ? 'parar' : /sub|rais/i.test(respuesta) ? 'subir' : /sin|without|quit/i.test(respuesta) ? 'quitar' : 'ahorro')
  void anotarDiagnostico($, `presupuesto pasado (${g} de ${limite}): ${tipo}`)
  if (tipo === 'parar') {
    $.clock.after(100, () => void $.prompt.fill({ text: texto, mode: 'replace' }).catch(() => undefined))
    $.ui.toast(x.parado, { timeoutMs: 9_000 })
    return { drop: x.parado, silenciar: true }
  }
  if (tipo === 'subir') {
    tarea.p = subido
    $.ui.toast(x.subido(formatearPresupuesto(p.unidad, subido.limite)), { timeoutMs: 6_000 })
  } else if (tipo === 'quitar') {
    tarea.p = undefined
    $.ui.toast(x.quitado, { timeoutMs: 6_000 })
  } else {
    tarea.p = { ...p, preguntado: true, ahorro: true }
    $.ui.toast(x.enAhorro, { timeoutMs: 9_000 })
  }
  $.ui.invalidate('ui.render')
  return { silenciar: true }
}

async function comandoPresupuesto($: $, args: string): Promise<string> {
  const x = xp()
  const orden = leerOrden(args)
  if (orden.tipo === 'invalida') return x.invalida
  if (orden.tipo === 'quitar') {
    const habia = tarea.p !== undefined
    tarea.p = undefined
    $.ui.invalidate('ui.render')
    return habia ? x.quitado : x.ninguno
  }
  await refrescarUso($, true)
  if (orden.tipo === 'estado') {
    if (tarea.p === undefined) return x.ninguno
    const { g, limite, pct } = textoGastado(tarea.p)
    return x.estado(g, limite, pct, tarea.p.ahorro)
  }
  if (orden.unidad === 'usd' && vivo.usoCache?.costo === undefined) return x.sinCosto
  const p = nuevoPresupuesto(orden.unidad, orden.limite, orden.unidad === 'usd' ? vivo.costoContado : vivo.tokensSesion)
  tarea.p = p
  $.ui.invalidate('ui.render')
  return x.fijado(formatearPresupuesto(p.unidad, p.limite), p.unidad, vivo.usoCache?.esSuscripcion === true)
}

/** Primer inicio de la semana: un aviso corto con lo que ahorró la pasada. */
async function avisarSemana($: $, ahora: number): Promise<void> {
  try {
    const semanas = await leerSemanasDe($)
    const lunes = tarjetaPendiente(semanas, ahora, await $.store.get(CLAVE_TARJETA))
    if (lunes === undefined) return
    await $.store.set(CLAVE_TARJETA, lunes)
    const texto = avisoSemana(semanas, lunes, vivo.idioma)
    $.clock.after(8_000, () => $.ui.toast(texto, { timeoutMs: 12_000 }))
  } catch {
    // Sin tarjeta esta vez.
  }
}

async function leerSemanasDe($: $): Promise<Semanas> {
  return leerSemanas(await $.store.get(CLAVE_SEMANAS))
}

/** Suma a la tarjeta de la semana. Nunca falla: es solo estadística. */
async function alaSemana($: $, d: Delta): Promise<void> {
  try {
    await $.store.set(CLAVE_SEMANAS, sumarSemana(await leerSemanasDe($), await $.clock.now(), d))
  } catch {
    // Sin store: la tarjeta queda sin esta cifra.
  }
}

async function sumarAhorro($: $, caracteres: number, comando: string, principal = true, tipo: TipoAhorro = 'salida'): Promise<void> {
  const tokens = tokensAprox(caracteres)
  if (tokens > 0) await alaSemana($, { tipo, ahorro: tokens })
  await update($, sesion, s => ({ ...s, tokensAhorrados: s.tokensAhorrados + tokens, compactaciones: s.compactaciones + 1 }))
  if (tokens <= 0) return
  // Lo que salió del contexto principal ya no se relee en los pedidos siguientes.
  if (principal) vivo.relecturas = retirar(vivo.relecturas, tokens)
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  await $.store.set(CLAVE_TOTAL, total + tokens)
  const ahora = await $.clock.now()
  await $.store.set(CLAVE_HISTORIAL, sumarAlDia(await leerHistorial($), ahora, tokens))
  vivo.ultimoAhorro = { tokens, comando }
  $.ui.toast(tx().toastAhorro(formatearTokens(tokens), recortar(comando, 40)), { timeoutMs: 6000 })
  // Si además se desbloqueó un logro, suena la fanfarria en vez de la campanita.
  if ((await revisarLogros($)).length === 0) sonar($, 'ahorro')
}

/** Relecturas evitadas: en la sesión y en el histórico. Puede ser negativo (lo que cuesta compactar). */
async function sumarRelecturas($: $, tokens: number): Promise<void> {
  if (tokens === 0) return
  await update($, sesion, s => ({ ...s, relecturasEvitadas: (s.relecturasEvitadas ?? 0) + tokens }))
  const total = Number((await $.store.get(CLAVE_RELECTURAS)) ?? 0)
  await $.store.set(CLAVE_RELECTURAS, total + tokens)
  await alaSemana($, { relecturas: tokens })
}

/** Cada pedido al modelo: lo que costó de verdad y lo que Toki evitó que se releyera. */
async function alPedido($: $, subagente: boolean, u: UsoPedido): Promise<void> {
  await update($, gasto, g => sumarPedido(g, u, subagente))
  const leidos = tamanoDelPedido(u) + u.output_tokens
  vivo.tokensSesion += leidos
  await revisarPresupuesto($)
  if (subagente) {
    if (leidos > 0) await alaSemana($, { tokensLeidos: leidos })
    return
  }
  const contexto = tamanoDelPedido(u)
  if (contexto <= 0) return
  await alaSemana($, { pedidos: 1, tokensLeidos: leidos, pedidosLargos: contexto > CONTEXTO_LARGO ? 1 : 0 })
  const anterior = vivo.contextoPedido
  vivo.contextoPedido = contexto
  // El pedido cayó a menos de la mitad del anterior: se compactó.
  if (anterior !== undefined && anterior >= CONTEXTO_RELEVANTE && contexto < anterior * 0.5) await registrarCompactacion($, 'caida')
  vivo.contextoMax = Math.max(vivo.contextoMax, contexto)
  const c = contarPedido(vivo.relecturas)
  vivo.relecturas = c.r
  const tt = contarTemprana(vivo.temprana, contexto)
  vivo.temprana = tt.t
  await sumarRelecturas($, c.evitadas + tt.evitadas)
}

/**
 * Con Opus o Sonnet de 1M, Claude Code no compacta hasta ~500k-967k, y cada
 * mensaje relee todo eso. Toki baja la ventana (CLAUDE_CODE_AUTO_COMPACT_WINDOW)
 * a la elegida, salvo que tú ya hayas elegido otra. Probado con sesiones reales:
 * Claude Code la respeta si se pone en session.start, antes del primer turno;
 * puesta a mitad de un turno, /context la muestra pero ese turno no compacta.
 */
async function ajustarVentana($: $, avisar: boolean): Promise<void> {
  try {
    const modelo = vivo.modelo ?? 'modelo'
    const claveNativa = `${CLAVE_VENTANA_NATIVA}:${modelo}`
    const leer = async () => (await $.session.usage({ breakdown: 'summary' })).context
    const ctx = await leer()
    const b = ctx.breakdown
    const envActual = await $.env.get('CLAUDE_CODE_AUTO_COMPACT_WINDOW')
    const puesta = (await $.store.get(CLAVE_VENTANA)) as string | undefined
    const esDeToki = envActual !== undefined && envActual !== '' && envActual === puesta
    // Si la variable es de Toki, lo que se ve es la ventana de Toki: la nativa es la guardada.
    const guardada = Number((await $.store.get(claveNativa)) ?? 0)
    const nativa = esDeToki ? (guardada > 0 ? guardada : undefined) : b?.rawMaxTokens
    const decision = decidirVentana({ elegida: config.ventana, nativa, fuente: b?.autocompactSource, envActual, puestaPorToki: puesta })
    if (decision.poner === undefined) {
      if (decision.motivo === 'apagado' && esDeToki) {
        await $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', undefined)
        const otra = await leer()
        vivo.ventana = otra.breakdown?.rawMaxTokens ?? otra.window
        vivo.ventanaNativa = vivo.ventana
        vivo.ventanaFuente = 'nativa'
      } else if (decision.motivo === 'sin-datos') {
        // Aún sin desglose: se reintenta al empezar el próximo turno.
        vivo.ventana = ctx.window
        vivo.ventanaFuente = undefined
      } else {
        vivo.ventana = b?.rawMaxTokens ?? ctx.window
        vivo.ventanaNativa = nativa ?? vivo.ventana
        vivo.ventanaFuente = decision.motivo === 'tuya' ? 'tuya' : esDeToki ? 'toki' : 'nativa'
      }
      void anotarDiagnostico($, `ventana: ${decision.motivo}, compacta a ${vivo.ventana} (nativa ${vivo.ventanaNativa})`)
      return
    }
    const r = await $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', String(decision.poner))
    if (r.deny !== undefined) {
      vivo.ventana = b?.rawMaxTokens ?? ctx.window
      vivo.ventanaNativa = vivo.ventana
      vivo.ventanaFuente = 'nativa'
      void anotarDiagnostico($, `ventana: no se pudo poner (${r.deny})`)
      return
    }
    await $.store.set(CLAVE_VENTANA, String(decision.poner))
    if (!esDeToki && nativa !== undefined) await $.store.set(claveNativa, nativa)
    // Claude Code la limita a la ventana del modelo: se lee la que quedó de verdad.
    const efectiva = (await leer()).breakdown?.rawMaxTokens ?? decision.poner
    vivo.ventana = efectiva
    vivo.ventanaNativa = nativa ?? efectiva
    vivo.ventanaFuente = efectiva === decision.poner && (nativa ?? 0) > efectiva ? 'toki' : 'nativa'
    void anotarDiagnostico($, `ventana: compacta a ${efectiva} (Claude Code: ${nativa ?? '?'})`)
    // El aviso, una sola vez por valor: no en cada sesión.
    const claveAviso = `ventanaAvisada:${efectiva}`
    if (avisar && !esDeToki && vivo.ventanaFuente === 'toki' && (await $.store.get(claveAviso)) !== true) {
      await $.store.set(claveAviso, true)
      $.ui.toast(tx().toastVentana(formatearTokens(efectiva), formatearTokens(vivo.ventanaNativa)), { timeoutMs: 9000 })
    }
  } catch (err) {
    void anotarDiagnostico($, `ventana: sin cambios (${String(err)})`)
  }
}

/**
 * La misma salida otra vez (git status, un build o un test sin cambios): en
 * vez de repetirla, una línea que dice que no cambió y dónde está la copia.
 * La salida anterior sigue en el contexto (no hubo compactación desde entonces).
 */
async function revisarRepetida(
  $: $,
  herramienta: string,
  comando: string,
  agente: string | undefined,
  r: SalidaShell | undefined,
  captura: Captura | undefined,
): Promise<{ stdout: string; stderr: string } | undefined> {
  if (!config.repetidas || r === undefined) return undefined
  if (r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) return undefined
  const texto = r.stderr ? `${r.stdout}\n${r.stderr}` : r.stdout
  if (texto.length < MIN_REPETIDA) return undefined
  const clave = `${agente ?? 'main'}|${herramienta}|${comando.trim()}`
  const actual: Repetida = { huella: huella(texto), cuando: await $.clock.now(), epoca: vivo.compactaciones }
  const previa = vivo.repetidas[clave]
  if (!esRepetida(previa, actual, texto.length)) {
    const claves = Object.keys(vivo.repetidas)
    const recientes = claves.length >= 60 ? Object.fromEntries(claves.slice(-40).map(k => [k, vivo.repetidas[k] as Repetida])) : vivo.repetidas
    vivo.repetidas = { ...recientes, [clave]: actual }
    return undefined
  }
  const copia = await leerCaptura($, captura)
  const ruta = copia.existe && captura !== undefined ? captura.ruta : await archivar($, texto)
  if (ruta === undefined) return undefined
  const x = tx()
  const linea = x.salidaRepetida(Math.round((actual.cuando - (previa?.cuando ?? actual.cuando)) / 60_000), kb(texto.length), ruta)
  // Contrafactual honesto: sin Toki, Claude habría leído lo que entrega Claude Code (máx. 30 KB).
  const ahorrado = Math.max(0, Math.min(texto.length, LIMITE_CLAUDE_CODE) - linea.length)
  await sumarAhorro($, ahorrado, comando, agente === undefined, 'repetida')
  anotar(comando, 'compactado', x.detalleRepetida, tokensAprox(ahorrado))
  return { stdout: linea, stderr: '' }
}

/** Lee las cifras de la sesión como máximo cada 5 s (es la misma llamada barata de la status line). */
async function refrescarUso($: $, forzar = false): Promise<void> {
  const ahora = await $.clock.now()
  if (!forzar && ahora - vivo.usoLeido < 5000) return
  vivo.usoLeido = ahora
  try {
    const uso = await $.session.usage()
    const limite = (kind: string) => uso.rateLimits.find(r => r.kind === kind)?.percentUsed
    // El % que importa es contra la ventana a la que se compacta, no contra el millón del modelo.
    const ventana = vivo.ventana ?? uso.context.window
    vivo.usoCache = {
      pct: uso.context.tokens !== undefined && ventana > 0 ? Math.round((uso.context.tokens / ventana) * 100) : uso.context.percent,
      ventana,
      tokens: uso.context.tokens,
      cincoHoras: limite('five_hour'),
      semana: limite('seven_day'),
      costo: uso.cost?.usd,
      inicio: uso.startedAt,
      esSuscripcion: uso.rateLimits.length > 0,
      reinicios: reiniciosDe(uso.rateLimits),
    }
    const costo = uso.cost?.usd
    if (costo !== undefined && Number.isFinite(costo)) {
      // Si el costo bajó, la sesión empezó de nuevo: se cuenta desde cero.
      const delta = costo >= vivo.costoContado ? costo - vivo.costoContado : costo
      vivo.costoContado = costo
      if (delta > 0) await alaSemana($, { costo: delta })
      if (delta > 0) await revisarPresupuesto($)
    }
    await revisarLimites($, ahora)
    // ¿Se compactó a mitad de un turno? El contexto cae de golpe.
    const tokens = uso.context.tokens
    const antes = vivo.tokensVistos
    if (tokens !== undefined) {
      vivo.tokensVistos = tokens
      if (antes !== undefined && antes >= CONTEXTO_RELEVANTE && tokens < antes * 0.5 && antes - tokens >= CONTEXTO_RELEVANTE) {
        await registrarCompactacion($, 'caida')
      }
    }
  } catch {
    // Sin cifras por ahora: la barra muestra guiones.
  }
}

/** Dos salidas enormes en un mismo turno: mejor delegar a un subagente. */
function registrarSalidaGrande($: $, caracteres: number): void {
  if (caracteres < 20_000) return
  vivo.salidasGrandesEnTurno += 1
  if (vivo.salidasGrandesEnTurno === 2) {
    const x = tx()
    vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'subagente', texto: x.leccionSubagente })
    $.ui.toast(x.toastSalidasGrandes, { timeoutMs: 7000 })
  }
}

function anotar(comando: string, resultado: Decision['resultado'], texto: string, ahorro?: number): void {
  vivo.decisiones = registrarDecision(vivo.decisiones, { comando: recortar(comando, 60), resultado, motivo: texto, ahorro })
}

function anotarMotivo(comando: string, clave: Motivo): void {
  anotar(comando, 'sin-cambio', motivo(clave, vivo.idioma))
}

/** Cambia lo último anotado para este comando (p. ej. "filtrado" → "rescatado"). */
function reanotar(comando: string, resultado: Decision['resultado'], texto: string): void {
  const clave = recortar(comando, 60)
  const i = vivo.decisiones.map(d => d.comando).lastIndexOf(clave)
  if (i < 0) return anotar(comando, resultado, texto)
  vivo.decisiones = vivo.decisiones.map((d, j) => (j === i ? { ...d, resultado, motivo: texto } : d))
}

// ---------- Memoria que sobrevive la compactación ----------

/** Deja lista la nota que el hook SessionStart(compact) reinyecta tras compactar. */
async function guardarMemoria($: $): Promise<void> {
  try {
    await asegurarCarpeta($)
    vivo.memoria.cuando = await $.clock.now()
    await $.fs.write(`${CARPETA}/punto-de-control.json`, JSON.stringify(vivo.memoria, null, 2))
    await $.fs.write(`${CARPETA}/nota-post-compactacion.txt`, estaVacia(vivo.memoria) ? '' : notaPostCompactacion(vivo.memoria, vivo.idioma))
  } catch {
    // Sin memoria guardada no pasa nada grave: Claude Code compacta como siempre.
  }
}

/** ¿El hook de comando ya le dio la nota a Claude después de `desde`? */
async function marcaFresca($: $, desde: number): Promise<boolean> {
  try {
    const { mtimeMs } = await $.fs.stat(`${CARPETA}/ultima-compactacion`)
    return mtimeMs > desde && mtimeMs >= vivo.inicio - 5_000
  } catch {
    return false
  }
}

/**
 * Plan B de la memoria: donde el hook de comando no corre (Windows sin Git Bash),
 * Toki mismo le deja la nota a Claude. Nunca dos veces por compactación.
 */
async function inyectarNotaSiFalta($: $, desde: number): Promise<void> {
  if (vivo.notaInyectada > 0 && vivo.notaInyectada >= desde) return
  if (estaVacia(vivo.memoria) || (await marcaFresca($, desde))) return
  vivo.notaInyectada = await $.clock.now()
  await notaParaClaude($, notaPostCompactacion(vivo.memoria, vivo.idioma))
}

/**
 * Registra una compactación, la detecte quien la detecte: la marca del hook de
 * comando, el contexto sin cifra al empezar un turno, el hook de compactación
 * (sin guardia corporativo) o una caída brusca del contexto. Una sola vez cada una.
 */
async function registrarCompactacion($: $, origen: 'marca' | 'turno' | 'resumen' | 'caida'): Promise<void> {
  if (vivo.ultimaCompactacion > 0 && vivo.ultimaCompactacion >= vivo.ultimoTurnoCompleto) return
  const ahora = await $.clock.now()
  const desde = vivo.ultimoTurnoCompleto
  vivo.ultimaCompactacion = ahora
  vivo.compactaciones += 1
  // Lo que sigue a una compactación se escribe de cero en el caché: cambiar de modelo ahí sale gratis.
  ruta.cacheFrio = true
  vivo.tokensVistos = undefined
  // Lo de antes ya no está en el contexto: no hay relecturas que evitar ni salidas que repetir.
  const antes = vivo.contextoMax
  vivo.contextoMax = 0
  vivo.relecturas = alCompactar()
  vivo.repetidas = {}
  vivo.temprana = undefined
  // ¿La adelantó la ventana de Toki? Claude Code no habría compactado hasta la nativa.
  if (vivo.ventanaFuente === 'toki' && vivo.ventana !== undefined && vivo.ventanaNativa !== undefined && antes >= vivo.ventana * 0.7 && antes < vivo.ventanaNativa * 0.9) {
    const inicio = iniciarTemprana(antes, vivo.ventanaNativa)
    vivo.temprana = inicio.t
    await sumarRelecturas($, inicio.evitadas)
  }
  const x = tx()
  const conMemoria = config.memoria && !estaVacia(vivo.memoria)
  if (conMemoria) {
    if (origen === 'turno') await inyectarNotaSiFalta($, desde)
    else if (origen !== 'marca') $.clock.after(3_000, () => void inyectarNotaSiFalta($, desde))
    $.ui.toast(x.toastCompacto(resumenCorto(vivo.memoria, vivo.idioma)), { timeoutMs: 7000 })
  }
  if (vivo.compactaciones >= 3) {
    vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'muchas-compactaciones', texto: x.leccionCompactaciones(vivo.compactaciones) })
  }
  if (conMemoria) await revisarLogros($, { memoria: true })
  $.ui.invalidate('ui.render')
}

/** El hook de comando deja una marca de tiempo al compactar (macOS, Linux, Windows con Git Bash). */
async function detectarMarca($: $): Promise<void> {
  try {
    const { mtimeMs } = await $.fs.stat(`${CARPETA}/ultima-compactacion`)
    if (mtimeMs <= vivo.marcaVista) return
    vivo.marcaVista = mtimeMs
    if (mtimeMs < vivo.inicio - 5_000) return // Marca vieja de otra sesión.
    await registrarCompactacion($, 'marca')
  } catch {
    // Aún no hay marca.
  }
}

// ---------- Modelo y caché ----------

async function avisarCambioModelo($: $, de: string, a: string, tokens: number, usd: number | undefined, caliente?: boolean): Promise<void> {
  const ahora = await $.clock.now()
  const estaCaliente = caliente ?? (vivo.ultimoUsoCache > 0 && ahora - vivo.ultimoUsoCache < ttlMinutos() * 60_000)
  if (!estaCaliente || tokens < CONTEXTO_RELEVANTE) return
  if (vivo.avisoModeloEn > 0 && ahora - vivo.avisoModeloEn < 10 * 60_000) return
  vivo.avisoModeloEn = ahora
  const x = tx()
  vivo.lecciones = agregarLeccion(vivo.lecciones, leccionCambioModelo(tokens, usd ?? 0, de, a, vivo.idioma))
  decir(ahora, x.fraseCambioModelo(nombreModelo(a), formatearTokens(tokens)), 'aviso', 20_000)
  $.ui.toast(x.toastModelo(nombreModelo(a), formatearTokens(tokens)), { timeoutMs: 9000 })
  sonar($, 'aviso')
  $.ui.invalidate('ui.render')
}

/** Con el guardia corporativo el evento de cambio de modelo no llega: Toki lo nota preguntando. */
async function revisarModelo($: $): Promise<void> {
  let modelo: string
  try {
    modelo = await $.session.model()
  } catch {
    return
  }
  const anterior = vivo.modelo
  vivo.modelo = modelo
  if (anterior === undefined || anterior === modelo) return
  // Cambiaste de modelo con /model: manda el tuyo.
  ruta.modeloPrincipal = undefined
  // Otro modelo, otra ventana: se vuelve a calcular a cuánto compacta.
  await ajustarVentana($, false)
  await avisarCambioModelo($, anterior, modelo, vivo.tokensUltimoTurno, undefined)
}

/** Solo API: un ping que lee el caché antes de que venza (5 min), mientras lees o piensas. */
async function mantenerCaliente($: $): Promise<void> {
  // El ping va con tu modelo; si Toki puso otro, el caché está en ese y el ping no lo leería.
  if (vivo.pingEnCurso || ruta.modeloPrincipal !== undefined) return
  await refrescarUso($)
  const uso = vivo.usoCache
  const ahora = await $.clock.now()
  const debe = debeMantenerCache({
    activo: config.mantenerCache,
    esApi: uso !== undefined && !uso.esSuscripcion,
    trabajando: vivo.enTurno,
    ahora,
    ultimoUsoCache: vivo.ultimoUsoCache,
    ultimaInteraccion: vivo.ultimoTurnoCompleto,
    pingsEnPausa: vivo.pingsEnPausa,
    apagadoEnPausa: vivo.apagadoEnPausa,
    contextoTokens: uso?.tokens ?? vivo.tokensUltimoTurno,
    modeloCambio: vivo.modelo !== undefined && vivo.modeloUltimoTurno !== undefined && vivo.modelo !== vivo.modeloUltimoTurno,
  })
  if (!debe) return
  vivo.pingEnCurso = true
  try {
    const r = await $.model.fork({ prompt: tx().pingPrompt })
    const { sirvio, leidos } = evaluarPing(r)
    if (!sirvio) {
      // El caché ya estaba frío o no había nada que reusar: se para hasta tu próximo mensaje.
      vivo.apagadoEnPausa = true
      $.ui.log(`mantener caché: se detiene (${r.isAnswered ? 'sin lectura de caché' : r.reason})`, { to: 'debug' })
      return
    }
    vivo.pingsEnPausa += 1
    vivo.pingsTotales += 1
    vivo.tokensLeidosPing += leidos
    vivo.ultimoUsoCache = await $.clock.now()
    $.ui.invalidate('ui.render')
  } catch {
    vivo.apagadoEnPausa = true
  } finally {
    vivo.pingEnCurso = false
  }
}

/** Cada 5 s: cifras del contexto (y compactaciones a mitad de turno) y el modelo. */
/**
 * Donde la franja sobre el prompt no se dibuja (por ejemplo, la app de Claude con una
 * sesión remota), Toki se muestra en su panel. Deja una línea de diagnóstico.
 */
async function abrirPanelSiNoHayFranja($: $): Promise<void> {
  try {
    const superficies = await $.session.surfaces()
    if (vivo.bandaDibujada) {
      await anotarDiagnostico($, `franja dibujada; superficies: ${superficies.join(', ') || 'ninguna'}`)
      return
    }
    const abierto = await $.ui.open({ id: PANEL, title: 'Toki' })
    await anotarDiagnostico($, `superficies: ${superficies.join(', ') || 'ninguna'}; panel: ${abierto.isPlaced ? 'abierto' : `no (${abierto.reason})`}`)
    // Y una línea de estado, por si la superficie muestra esa y no los paneles.
    $.ui.status(`Toki · ${tx().lema}`)
  } catch (err) {
    await anotarDiagnostico($, `panel automático falló: ${String(err)}`)
  }
}

/** Un registro corto de lo que la superficie hace con Toki: sirve para saber por qué no se ve. */
const diagnostico: string[] = []
async function anotarDiagnostico($: $, linea: string): Promise<void> {
  try {
    diagnostico.push(`${new Date(await $.clock.now()).toISOString()} ${linea}`)
    await asegurarCarpeta($)
    await $.fs.write(`${CARPETA}/diagnostico.txt`, `${diagnostico.slice(-20).join('\n')}\n`)
  } catch {
    // Sin diagnóstico no pasa nada.
  }
}

async function vigilar($: $): Promise<void> {
  await refrescarUso($)
  await revisarModelo($)
}

// ---------- Motor: compactar salidas de comandos ----------

type SalidaShell = {
  stdout: string
  stderr: string
  interrupted?: boolean
  isImage?: boolean
  backgroundTaskId?: string
  persistedOutputPath?: string
}

function comoSalidaShell(r: unknown): SalidaShell | undefined {
  if (r === null || typeof r !== 'object') return undefined
  const o = r as { stdout?: unknown; stderr?: unknown }
  return typeof o.stdout === 'string' && typeof o.stderr === 'string' ? (r as SalidaShell) : undefined
}

/** Anota por qué no se compacta (si aplica) y recuerda el comando. ¿Se intenta compactar? */
function prepararComando(comando: string): boolean {
  const motivoNo = porQueNoCompactable(comando)
  if (!config.compresion) anotarMotivo(comando, 'apagado')
  else if (motivoNo !== undefined) anotarMotivo(comando, motivoNo)
  vivo.memoria.comandosRecientes = recordar(vivo.memoria.comandosRecientes, recortar(comando, 80), LIMITES_MEMORIA.comandos)
  return config.compresion && motivoNo === undefined
}

/** Recuerda el primer error y vigila bucles. Devuelve el aviso de bucle si toca. */
async function despuesDeEjecutar($: $, comando: string, fallo: boolean, texto: string | undefined): Promise<string | undefined> {
  if (fallo) {
    const err = primerError(texto ?? '')
    if (err !== undefined) vivo.memoria.ultimosErrores = recordar(vivo.memoria.ultimosErrores, err, LIMITES_MEMORIA.errores)
  }
  const { fallos: nuevos, avisar } = registrar(await read($, fallos), comando, fallo)
  await update($, fallos, () => nuevos)
  if (!avisar) return undefined
  await update($, sesion, s => ({ ...s, bucles: s.bucles + 1 }))
  vivo.bucleReciente = true
  const x = tx()
  vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'bucle', texto: x.leccionBucle(UMBRAL_FALLOS, recortar(comando, 30)) })
  $.ui.toast(x.toastBucle, { timeoutMs: 8000 })
  sonar($, 'aviso')
  return avisoBucle(vivo.idioma)
}

/** Un comando que falló: Claude Code solo entrega ~10 KB, y el error suele estar al final. */
async function compactarFallo($: $, comando: string, texto: string, captura: Captura | undefined, principal = true): Promise<string | undefined> {
  const idioma = vivo.idioma
  const copia = await leerCaptura($, captura)
  const salida = texto.match(/^(Exit code \d+)\n?/)
  const cuerpo = copia.texto ?? (salida ? texto.slice(salida[0].length) : texto)
  const c = compactar(cuerpo, idioma)
  if (c === null) {
    anotarMotivo(comando, esCorta(cuerpo) ? 'corta' : 'pocoAhorro')
    return undefined
  }
  const ruta = copia.existe && captura !== undefined ? captura.ruta : await archivar($, texto)
  if (ruta === undefined) {
    anotarMotivo(comando, 'archivar')
    return undefined
  }
  // Contrafactual honesto: sin Toki, Claude habría leído lo que entregó Claude Code.
  const ahorrado = Math.max(0, texto.length - c.caracteresDespues - 200)
  await sumarAhorro($, ahorrado, comando, principal)
  anotar(comando, 'compactado', tx().detalleCompactado(kb(c.caracteresAntes), kb(c.caracteresDespues), copia.existe), tokensAprox(ahorrado))
  registrarSalidaGrande($, cuerpo.length)
  return [salida?.[1], encabezado(c, ruta, copia.existe, tokensAprox(ahorrado), idioma), c.texto].filter(Boolean).join('\n')
}

/** Un comando que terminó bien. Devuelve el stdout y stderr nuevos, o nada si se deja igual. */
async function compactarExito($: $, comando: string, r: SalidaShell, captura: Captura | undefined, esPrincipal = true): Promise<{ stdout: string; stderr: string } | undefined> {
  const idioma = vivo.idioma
  if (r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) {
    anotarMotivo(comando, 'segundoPlano')
    return undefined
  }
  const copia = await leerCaptura($, captura)
  // Con captura, stdout y stderr vienen juntos en el orden real en que salieron.
  const fuente = copia.texto ?? r.stdout
  const cOut = compactar(fuente, idioma)
  const cErr = !copia.existe && r.stderr ? compactar(r.stderr, idioma) : null
  const principal: Compactado | null = cOut ?? cErr
  if (principal === null) {
    anotarMotivo(comando, esCorta(fuente) ? 'corta' : 'pocoAhorro')
    return undefined
  }
  const ruta = copia.existe && captura !== undefined ? captura.ruta : await archivar($, `=== stdout ===\n${r.stdout}\n\n=== stderr ===\n${r.stderr}`)
  if (ruta === undefined) {
    anotarMotivo(comando, 'archivar')
    return undefined
  }
  // Contrafactual honesto: sin Toki, Claude Code entrega como máximo 30 KB,
  // o una vista previa de ~2 KB cuando guarda la salida en un archivo.
  const leidoSinToki = r.persistedOutputPath !== undefined ? 2200 : Math.min(r.stdout.length + r.stderr.length, LIMITE_CLAUDE_CODE)
  const leidoConToki = (cOut?.caracteresDespues ?? 0) + (cErr?.caracteresDespues ?? 0) + 300
  const ahorrado = Math.max(0, leidoSinToki - leidoConToki)
  await sumarAhorro($, ahorrado, comando, esPrincipal)
  anotar(comando, 'compactado', tx().detalleCompactado(kb(principal.caracteresAntes), kb(principal.caracteresDespues), copia.existe), tokensAprox(ahorrado))
  registrarSalidaGrande($, fuente.length)
  const cabecera = encabezado(principal, ruta, copia.existe, tokensAprox(ahorrado), idioma)
  return {
    stdout: cOut ? `${cabecera}\n${cOut.texto}` : r.stdout,
    stderr: copia.existe ? '' : cErr ? (cOut ? cErr.texto : `${cabecera}\n${cErr.texto}`) : r.stderr,
  }
}

/** Una búsqueda que pasó de 30 KB: resumen por archivo o carpeta, con la salida completa en la copia. */
async function resumirBusquedaShell(
  $: $,
  comando: string,
  tipo: TipoBusqueda,
  r: SalidaShell,
  captura: Captura | undefined,
  esPrincipal: boolean,
): Promise<{ stdout: string; stderr: string } | undefined> {
  if (r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) return undefined
  const copia = await leerCaptura($, captura)
  const fuente = copia.texto ?? r.stdout
  if (fuente.length <= LIMITE_CLAUDE_CODE) return undefined
  const ruta = copia.existe && captura !== undefined ? captura.ruta : await archivar($, fuente)
  if (ruta === undefined) return undefined
  const resumen = resumirBusqueda(fuente, tipo, ruta, vivo.idioma)
  if (resumen === undefined) return undefined
  // Contrafactual honesto, como con las salidas ruidosas: sin Toki, como mucho 30 KB (o la vista previa de 2 KB).
  const leidoSinToki = r.persistedOutputPath !== undefined ? 2200 : Math.min(r.stdout.length + r.stderr.length, LIMITE_CLAUDE_CODE)
  const ahorrado = Math.max(0, leidoSinToki - resumen.caracteresDespues)
  await sumarAhorro($, ahorrado, comando, esPrincipal, 'busqueda')
  anotar(comando, 'compactado', tx().detalleCompactado(kb(resumen.caracteresAntes), kb(resumen.caracteresDespues), true), tokensAprox(ahorrado))
  registrarSalidaGrande($, fuente.length)
  return { stdout: resumen.texto, stderr: copia.existe ? '' : r.stderr }
}

/** Agrega a lo que entregó el `| tail` los errores que quedaron fuera. Nada si no había. */
async function rescatar($: $, comando: string, captura: Captura, entregado: string, programa = 'tail'): Promise<string | undefined> {
  const copia = await leerCaptura($, captura)
  if (copia.texto === undefined) return undefined
  const r = rescatarErrores(copia.texto, entregado)
  if (r === undefined) return undefined
  const x = tx()
  const lineas = [x.rescateEncabezado(programa, r.errores, r.total), ...r.texto]
  if (r.incluidos < r.errores) lineas.push(x.rescateMas(r.errores - r.incluidos))
  lineas.push(x.copiaCompleta(captura.ruta))
  reanotar(comando, 'rescatado', x.detalleRescate(r.errores))
  $.ui.toast(x.toastRescate(r.errores, recortar(comando, 40)), { timeoutMs: 7000 })
  if ((await revisarLogros($, { rescate: true })).length === 0) sonar($, 'ahorro')
  return lineas.join('\n')
}

async function conAvisoMapa($: $, herramienta: string, comando: string | undefined, ran: ToolCallResult): Promise<ToolCallResult> {
  if (ran.deny !== undefined || ran.isError === true || !esBusqueda(herramienta, comando)) return ran
  if (await read($, avisoMapaDado)) return ran
  if (!(await $.fs.exists(RUTA_MAPA).catch(() => false))) return ran
  await update($, avisoMapaDado, () => true)
  return { ...ran, context: [...(ran.context ?? []), avisoMapa(vivo.idioma)] }
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
  await $.fs.write(RUTA_MAPA, construirMapa(fichas, fecha, truncado, vivo.idioma))
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
  racha: number
  logros: string[]
  grafica: ReturnType<typeof filasGrafica>
  contexto?: { pct?: number; ventana: number; costo?: number; esSuscripcion: boolean }
  ocupan: { nombre: string; tokens: number }[]
  sugerencias: string[]
  lecciones: Leccion[]
  hayMapa: boolean
  gasto: Gasto
  relecturasTotal: number
  ventanaTexto?: string
  porQueCero?: string
}

/** A cuánto compacta Claude Code ahora, y quién lo decidió. */
function textoVentana(x: Textos): string | undefined {
  if (vivo.ventana === undefined || vivo.ventanaFuente === undefined) return undefined
  const v = formatearTokens(vivo.ventana)
  if (vivo.ventanaFuente === 'toki') return x.ventanaToki(v, formatearTokens(vivo.ventanaNativa ?? vivo.ventana))
  if (vivo.ventanaFuente === 'tuya') return x.ventanaTuya(v)
  return x.ventanaNativa(v)
}

/** Lo que costó la sesión, con las cifras que la API reportó pedido por pedido. */
function lineasGasto(x: Textos, g: Gasto): string[] {
  if (g.pedidos === 0) return []
  const lineas = [
    x.gastoLinea(formatearTokens(g.cacheLeido), porcentajeRelectura(g), formatearTokens(g.cacheEscrito), formatearTokens(g.entrada), formatearTokens(g.salida)),
    x.gastoPedidos(g.pedidos, formatearTokens(Math.round((g.entrada + g.cacheLeido + g.cacheEscrito) / g.pedidos))),
  ]
  if (g.subPedidos > 0) lineas.push(x.gastoSub(g.subPedidos, formatearTokens(g.subTokens)))
  return lineas
}

/** Si Toki no recortó nada pero la sesión gastó bastante, explica dónde se fue. */
function explicarCero(x: Textos, s: Sesion, g: Gasto): string | undefined {
  if (s.tokensAhorrados > 0 || totalGasto(g) < 100_000) return undefined
  return x.porQueCero(formatearTokens(g.cacheLeido), porcentajeRelectura(g))
}

async function reporte($: $, anchoBarra = 24): Promise<Reporte> {
  const x = tx()
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
    racha: racha(historial, ahora),
    logros: await leerLogros($),
    grafica: filasGrafica(historial, ahora, 14, anchoBarra, vivo.idioma),
    ocupan: [],
    sugerencias: [],
    lecciones: vivo.lecciones,
    hayMapa: await $.fs.exists(RUTA_MAPA).catch(() => false),
    gasto: await read($, gasto),
    relecturasTotal: Math.max(0, Number((await $.store.get(CLAVE_RELECTURAS)) ?? 0)),
    ventanaTexto: textoVentana(x),
  }
  r.porQueCero = explicarCero(x, s, r.gasto)
  try {
    const uso = await $.session.usage({ breakdown: 'summary' })
    // El % contra la ventana a la que de verdad se compacta.
    const ventana = vivo.ventana ?? uso.context.breakdown?.rawMaxTokens ?? uso.context.window
    const pct = uso.context.tokens !== undefined && ventana > 0 ? Math.round((uso.context.tokens / ventana) * 100) : uso.context.percent
    r.contexto = { pct, ventana, costo: uso.cost?.usd, esSuscripcion: uso.rateLimits.length > 0 }
    const desglose = uso.context.breakdown
    if (desglose !== undefined) {
      r.ocupan = desglose.categories
        .filter(c => c.kind === 'used' && c.tokens > 0)
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 5)
        .map(c => ({ nombre: c.name, tokens: c.tokens }))
      const memoria = desglose.memoryFiles.reduce((suma, f) => suma + f.tokens, 0)
      if (memoria > 5000) r.sugerencias.push(x.sugMemoria(formatearTokens(memoria)))
      const mcp = desglose.mcpTools.filter(h => h.isLoaded).reduce((suma, h) => suma + h.tokens, 0)
      if (mcp > 10_000) r.sugerencias.push(x.sugMcp(formatearTokens(mcp)))
    }
    if (pct !== undefined && pct >= 50) r.sugerencias.push(x.sugContexto)
  } catch {
    // Sin cifras por ahora.
  }
  if (!config.mantenerCache && vivo.ultimoTurnoCompleto > 0 && vivo.usoCache !== undefined && !vivo.usoCache.esSuscripcion) r.sugerencias.push(x.sugCache)
  if (!r.hayMapa) r.sugerencias.push(x.sugMapa)
  if (await $.fs.exists('.claude/ahorro-tokens').catch(() => false)) r.sugerencias.push(x.sugCarpetaVieja)
  r.sugerencias.push(x.sugConciso)
  return r
}

async function textoDecisiones($: $): Promise<string> {
  const x = tx()
  const s = await read($, sesion)
  const g = await read($, gasto)
  const cuentas = [...lineasGasto(x, g)]
  if ((s.relecturasEvitadas ?? 0) > 0) cuentas.push(x.relecturasLinea(formatearTokens(s.relecturasEvitadas)))
  const ventana = textoVentana(x)
  if (ventana !== undefined) cuentas.push(ventana)
  const cero = explicarCero(x, s, g)
  const pie = [...(cero !== undefined ? ['', cero] : []), ...(cuentas.length > 0 ? ['', `${x.gastoTitulo}:`, ...cuentas.map(l => `  ${l}`)] : [])]
  pie.push('', ...textoRuta(xr()))
  if (vivo.decisiones.length === 0) return [x.sinComandos, ...pie].join('\n')
  const lineas = [x.decisionesTitulo]
  for (const d of [...vivo.decisiones].reverse()) {
    const extra = d.ahorro !== undefined ? ` (${x.tokensAhorradosCorto(formatearTokens(d.ahorro))})` : ''
    const estado = d.resultado === 'compactado' ? x.compactado : d.resultado === 'rescatado' ? x.rescatado : x.sinCambio
    lineas.push(`  ${marcaDecision(d)} ${d.comando}`, `      ${estado}: ${d.motivo}${extra}`)
  }
  lineas.push('', x.decisionesPie, ...pie)
  return lineas.join('\n')
}

function marcaDecision(d: Decision): string {
  return d.resultado === 'compactado' ? '✓' : d.resultado === 'rescatado' ? '✚' : '·'
}

function lineaLogros(x: Textos, logros: readonly string[]): string {
  return LOGROS.map(l => `${logros.includes(l) ? '✓' : '○'} ${x.logroNombres[l] ?? l}`).join('  ')
}

function reporteEnTexto(r: Reporte): string {
  const x = tx()
  const lineas = [
    x.reporteCabecera(formatearTokens(r.sesion.tokensAhorrados), formatearTokens(r.hoy), formatearTokens(r.semana), formatearTokens(r.total)),
    x.resumenSesion(r.sesion.compactaciones, r.sesion.llamadas, r.sesion.bucles),
    r.racha > 0 ? x.rachaDias(r.racha) : x.rachaNinguna,
    `${x.logros}: ${lineaLogros(x, r.logros)}`,
  ]
  if (r.contexto) {
    lineas.push(x.contextoLinea(r.contexto.pct === undefined ? x.sinDatos : `${r.contexto.pct}% ${x.usado}`, formatearTokens(r.contexto.ventana)))
  }
  if (vivo.pingsTotales > 0) lineas.push(x.cacheMantenido(vivo.pingsTotales, formatearTokens(vivo.tokensLeidosPing)))
  const cuentas = lineasGasto(x, r.gasto)
  if ((r.sesion.relecturasEvitadas ?? 0) > 0) cuentas.push(x.relecturasLinea(formatearTokens(r.sesion.relecturasEvitadas)))
  if (r.ventanaTexto !== undefined) cuentas.push(r.ventanaTexto)
  if (r.porQueCero !== undefined) cuentas.push(r.porQueCero)
  if (cuentas.length > 0) {
    lineas.push('', `${x.gastoTitulo}:`)
    for (const l of cuentas) lineas.push(`  ${l}`)
  }
  lineas.push('', ...textoRuta(xr()))
  if (r.ocupan.length > 0) {
    lineas.push('', `${x.queOcupa}:`)
    for (const c of r.ocupan) lineas.push(`  ${c.nombre}: ~${formatearTokens(c.tokens)}`)
  }
  lineas.push('', `${x.ahorroPorDia}:`)
  for (const f of r.grafica) lineas.push(`  ${f.etiqueta} ${f.barra} ${f.valor}`)
  if (r.lecciones.length > 0) {
    lineas.push('', `${x.loQueNoto}:`)
    for (const l of r.lecciones) lineas.push(`  • ${l.texto}`)
  }
  lineas.push('', `${x.sugerencias}:`)
  for (const sug of r.sugerencias) lineas.push(`  • ${sug}`)
  return lineas.join('\n')
}

/** Lo que se olvida al hacer /clear: la conversación nueva empieza limpia. */
function reiniciarConversacion(): void {
  vivo.lecciones = []
  vivo.decisiones = []
  vivo.memoria = vacio(0)
  vivo.lecturas = {}
  vivo.compactaciones = 0
  vivo.nudgeConciso = false
  vivo.nudgeLecturas = false
  vivo.generadosFrenados = new Map<string, number>()
  vivo.ultimoAhorro = undefined
  vivo.mensaje = undefined
  vivo.aprovechado = undefined
}

/** El seguimiento del contexto y del caché, que pertenece a una conversación. */
function reiniciarSeguimiento(): void {
  vivo.enTurno = false
  vivo.ultimoTurnoCompleto = 0
  vivo.tokensUltimoTurno = 0
  vivo.tokensVistos = undefined
  vivo.ultimaCompactacion = 0
  vivo.notaInyectada = 0
  vivo.ultimoUsoCache = 0
  vivo.pingsEnPausa = 0
  vivo.apagadoEnPausa = false
  vivo.modeloUltimoTurno = undefined
  vivo.contextoPedido = undefined
  vivo.contextoMax = 0
  vivo.relecturas = RELECTURAS_VACIAS
  vivo.temprana = undefined
  vivo.repetidas = {}
}

// ---------- Modelo y esfuerzo por mensaje ----------

type Eleccion = { modelo: string; esfuerzo: Esfuerzo }
type DecisionRuta = { cuando: number; nivel: Nivel; motivo: MotivoRuta; antes: Eleccion; despues: Eleccion; como: 'auto' | 'elegido' | 'recordado' | 'deshecho'; dif: number }

const CLAVE_MODO_RUTA = 'modoModeloEsfuerzo'
/** Cuánto espera Toki a Haiku en la zona dudosa antes de seguir con la heurística. */
const ESPERA_CLASIFICADOR = 2_000
/** Por debajo de esto el contexto real (sistema + herramientas) aún no se midió: se usa este piso. */
const CONTEXTO_BASE = 35_000

const ruta: {
  modo: ModoRuta
  /** El modo de /plugin; /toki-modelo lo cambia y se guarda aparte. */
  modoConfig: ModoRuta
  subagentes: boolean
  interactivo: boolean
  /** El modelo que Toki eligió para el hilo principal; sigue hasta que vuelva al tuyo, cambies con /model o hagas /clear. */
  modeloPrincipal?: string
  /** El plan del próximo turno (de `prompt.submit` a `turn.start`). */
  pendiente?: { nivel: Nivel; esfuerzo?: Esfuerzo }
  /** El turno al que se aplica el esfuerzo elegido, y cuál es. */
  turno?: string
  esfuerzo?: Esfuerzo
  nivelPrevio?: Nivel
  /** El esfuerzo de la sesión, como lo pide Claude Code (antes de que Toki lo cambie). */
  esfuerzoSesion?: Esfuerzo
  /** Lo que elegiste antes para cada nivel: la próxima vez se aplica solo. */
  preferencias: Partial<Record<Nivel, TipoOpcion>>
  rechazos: number
  silenciado: boolean
  /** El modelo que Toki pidió no respondió en esta cuenta: solo el esfuerzo. */
  modeloRoto: boolean
  aviso?: { texto: string; hasta: number; deshacer?: Eleccion }
  avisoSubagentes: boolean
  subagentesEnSonnet: number
  historial: DecisionRuta[]
  /** Aún no hay caché que perder (sesión nueva, /clear, recién compactado): cambiar de modelo sale gratis. */
  cacheFrio: boolean
  /** Lo que Toki leyó en el último mensaje, aunque no haya cambiado nada: para que puedas comprobarlo. */
  ultima?: { nivel: Nivel; motivo: MotivoRuta; actual: Opcion; recomendada: Opcion; decision: 'ya-va-asi' | 'callado' | 'auto' | 'preguntar' }
} = {
  modo: 'preguntar',
  modoConfig: 'preguntar',
  subagentes: true,
  interactivo: false,
  preferencias: {},
  rechazos: 0,
  silenciado: false,
  modeloRoto: false,
  avisoSubagentes: false,
  subagentesEnSonnet: 0,
  historial: [],
  cacheFrio: true,
}

function xr(): TextosRuta {
  return textosRuta[vivo.idioma]
}

/** Con qué va la conversación ahora: tu modelo o el que Toki eligió, y el esfuerzo de la sesión. */
function eleccionActual(): Eleccion | undefined {
  const modelo = ruta.modeloPrincipal ?? vivo.modelo
  if (modelo === undefined) return undefined
  return { modelo, esfuerzo: ruta.esfuerzoSesion ?? 'medium' }
}

function reiniciarRuta(): void {
  ruta.modeloPrincipal = undefined
  ruta.pendiente = undefined
  ruta.turno = undefined
  ruta.esfuerzo = undefined
  ruta.nivelPrevio = undefined
  ruta.aviso = undefined
  ruta.cacheFrio = true
}

async function leerNivel($: $, texto: string): Promise<{ nivel: Nivel; motivo: MotivoRuta }> {
  const l = nivelHeuristico(texto, ruta.nivelPrevio)
  if (l.seguro || limpiarPrompt(texto).length < 40) return l
  // Zona dudosa: una pregunta corta a Haiku, con tiempo límite. Si tarda, gana la heurística.
  try {
    const etiqueta = await Promise.race([
      $.model.classify(recortar(limpiarPrompt(texto), 2_000), Object.keys(ETIQUETAS_CLASIFICADOR)),
      new Promise<undefined>(resolver => $.clock.after(ESPERA_CLASIFICADOR, () => resolver(undefined))),
    ])
    const nivel = etiqueta === undefined ? undefined : ETIQUETAS_CLASIFICADOR[etiqueta]
    if (nivel !== undefined) return { nivel, motivo: nivel === l.nivel ? l.motivo : 'clasificador' }
  } catch {
    // Sin clasificador: la heurística.
  }
  return l
}

/** Lee el mensaje antes de mandarlo y decide (o te pregunta) con qué modelo y esfuerzo va. */
async function planearTurno($: $, textoCrudo: string, silenciar = false): Promise<void> {
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  if (ruta.modo === 'no' || texto === '' || texto.startsWith('/')) return
  if (vivo.modelo === undefined) {
    try {
      vivo.modelo = await $.session.model()
    } catch {
      return
    }
  }
  const actual = eleccionActual()
  // Haiku no tiene esfuerzo, y no hay nada más barato a qué bajar.
  if (actual === undefined || familiaDe(actual.modelo) === 'haiku') return
  const { nivel, motivo } = await leerNivel($, texto)
  ruta.nivelPrevio = nivel
  const p = proponer({
    nivel,
    modelo: actual.modelo,
    esfuerzo: actual.esfuerzo,
    contexto: Math.max(CONTEXTO_BASE, vivo.contextoPedido ?? vivo.tokensUltimoTurno),
    ttl1h: vivo.usoCache?.esSuscripcion ?? true,
    permitirModelo: !ruta.modeloRoto,
    cacheFrio: ruta.cacheFrio || (vivo.ultimoUsoCache > 0 && (await $.clock.now()) - vivo.ultimoUsoCache > ttlMinutos() * 60_000),
  })
  let modo = decidirInterfaz(ruta.modo, p, ruta.silenciado || silenciar)
  // Modo ahorro por límite (lo elegiste al 90 %): la opción barata, sin preguntar, hasta que se renueve.
  const enAhorro = guardia.ahorroHasta > (await $.clock.now()) || tarea.p?.ahorro === true
  const ahorro = enAhorro ? p.opciones.find(o => o.tipo === 'ahorro') : undefined
  if (enAhorro) modo = ahorro !== undefined && !igual(ahorro, p.actual) && ahorro.usd <= p.actual.usd ? 'auto' : 'nada'
  ruta.ultima = { nivel, motivo, actual: p.actual, recomendada: p.recomendada, decision: modo === 'nada' ? (igual(p.recomendada, p.actual) ? 'ya-va-asi' : 'callado') : modo }
  void anotarDiagnostico(
    $,
    `ruta: ${nivel} (${motivo}) ${actual.modelo}/${actual.esfuerzo} → ${p.recomendada.modelo}/${p.recomendada.esfuerzo} ${textoDiferencia(diferencia(p.recomendada, p.actual), xr())} [${ruta.ultima.decision}]`,
  )
  // Lo que elegiste antes para este nivel se repite solo, si no reescribe el caché.
  const recordada = ruta.preferencias[nivel]
  let elegida: Opcion | undefined = ahorro ?? p.recomendada
  let como: DecisionRuta['como'] = 'auto'
  if (modo === 'preguntar' && recordada !== undefined && ruta.modo !== 'siempre') {
    const o = recordada === 'actual' ? p.actual : p.opciones.find(op => op.tipo === recordada)
    if (o !== undefined && o.reescribe < REESCRITURA_QUE_PREGUNTA) {
      elegida = o
      modo = 'auto'
      como = 'recordado'
    }
  }
  // Sin nadie que responda (claude -p, un mensaje del SDK): solo lo que ahorra.
  if (modo === 'preguntar' && !ruta.interactivo) modo = decidirInterfaz('preguntar', p, true)
  if (modo === 'nada') return
  if (modo === 'preguntar') {
    const x = xr()
    const { opciones, dejar } = etiquetas(p, x)
    let respuesta: string
    try {
      respuesta = await $.ui.ask(x.pregunta(x.nivel[nivel], x.motivo[motivo]), { header: 'Toki', options: [...opciones.map(o => o.etiqueta), dejar].slice(0, 4) })
    } catch {
      // Cerraste el diálogo: el mensaje va como estaba.
      return
    }
    const opcion = opciones.find(o => o.etiqueta === respuesta)?.opcion ?? interpretarRespuesta(respuesta, p)
    if (opcion === undefined || igual(opcion, p.actual)) {
      ruta.preferencias[nivel] = 'actual'
      ruta.rechazos += 1
      if (ruta.rechazos >= 3 && !ruta.silenciado) {
        ruta.silenciado = true
        $.ui.toast(x.callado, { timeoutMs: 9000 })
      }
      return
    }
    ruta.rechazos = 0
    ruta.preferencias[nivel] = opcion.tipo
    elegida = opcion
    como = 'elegido'
  }
  if (elegida === undefined || igual(elegida, p.actual)) return
  await aplicarEleccion($, { nivel, motivo, antes: actual, despues: elegida, como, dif: diferencia(elegida, p.actual) })
}

/** Lo que escribiste bajo "Otro": "sonnet", "opus max", "bajo"… */
function interpretarRespuesta(texto: string, p: Propuesta): Opcion | undefined {
  const t = texto.toLowerCase()
  const fam = /\bsonnet\b/.test(t) ? 'sonnet' : /\bopus\b/.test(t) ? 'opus' : undefined
  const esfuerzo: Esfuerzo | undefined = /\bmax|m[aá]ximo\b/.test(t)
    ? 'max'
    : /xhigh|muy alto|extra/.test(t)
      ? 'xhigh'
      : /\bhigh|alto\b/.test(t)
        ? 'high'
        : /\bmedium|medio\b/.test(t)
          ? 'medium'
          : /\blow|bajo\b/.test(t)
            ? 'low'
            : undefined
  if (fam === undefined && esfuerzo === undefined) return undefined
  const modelo = fam === undefined ? p.actual.modelo : (hermano(p.actual.modelo, fam) ?? p.actual.modelo)
  return { tipo: 'equilibrio', modelo, esfuerzo: esfuerzo ?? p.actual.esfuerzo, usd: p.actual.usd, cambio: 0, reescribe: 0 }
}

async function aplicarEleccion($: $, d: Omit<DecisionRuta, 'cuando'>): Promise<void> {
  const ahora = await $.clock.now()
  ruta.modeloPrincipal = d.despues.modelo === vivo.modelo ? undefined : d.despues.modelo
  ruta.pendiente = { nivel: d.nivel, esfuerzo: d.despues.esfuerzo !== d.antes.esfuerzo ? d.despues.esfuerzo : undefined }
  ruta.historial = [...ruta.historial, { ...d, cuando: ahora }].slice(-12)
  void anotarDiagnostico($, `ruta aplicada: ${d.antes.modelo}/${d.antes.esfuerzo} → ${d.despues.modelo}/${d.despues.esfuerzo} [${d.como}]`)
  const x = xr()
  const texto = x.cambio(nombreCorto(d.despues.modelo), x.esfuerzo[d.despues.esfuerzo], `${textoDiferencia(d.dif, x)}${d.como === 'recordado' ? `, ${x.comoAntes}` : ''}`)
  ruta.aviso = { texto, hasta: ahora + 12_000, deshacer: d.antes }
  sonar($, 'aviso')
  $.ui.invalidate('ui.render')
}

/** El botón Deshacer: vuelve a como estaba desde el próximo pedido. */
async function deshacerEleccion($: $): Promise<void> {
  const antes = ruta.aviso?.deshacer
  if (antes === undefined) return
  ruta.modeloPrincipal = antes.modelo === vivo.modelo ? undefined : antes.modelo
  ruta.esfuerzo = undefined
  ruta.pendiente = undefined
  const ultima = ruta.historial[ruta.historial.length - 1]
  if (ultima !== undefined) {
    ruta.historial = [...ruta.historial.slice(0, -1), { ...ultima, como: 'deshecho' }]
    ruta.preferencias[ultima.nivel] = 'actual'
  }
  ruta.aviso = undefined
  $.ui.invalidate('ui.render')
}

function textoRuta(x: TextosRuta): string[] {
  const lineas = [`${x.titulo}: ${x.modo[ruta.modo]}${ruta.silenciado ? ` (${x.silenciado})` : ''}`]
  if (ruta.modeloPrincipal !== undefined) lineas.push(`  ${nombreCorto(ruta.modeloPrincipal)} ${x.porToki}`)
  if (guardia.ahorroHasta > 0) lineas.push(`  ${xg().limite.enAhorro(hora(guardia.ahorroHasta, guardia.ahorroVentana ?? 'five_hour', vivo.idioma))}`)
  if (ruta.subagentesEnSonnet > 0) lineas.push(`  ${x.subagentes.replace(/^Toki: /, '')} (${ruta.subagentesEnSonnet})`)
  const u = ruta.ultima
  if (u !== undefined) {
    const rec = `${nombreCorto(u.recomendada.modelo)} · ${x.esfuerzo[u.recomendada.esfuerzo]} (${textoDiferencia(diferencia(u.recomendada, u.actual), x)})`
    lineas.push(`  ${x.ultimoMensaje}: ${x.nivel[u.nivel]} (${x.motivo[u.motivo]}) · ${nombreCorto(u.actual.modelo)} · ${x.esfuerzo[u.actual.esfuerzo]} → ${rec} · ${x.decision[u.decision]}`)
  } else {
    lineas.push(`  ${x.sinLectura}`)
  }
  if (ruta.historial.length === 0) return [...lineas, `  ${x.sinDecisiones}`]
  for (const d of [...ruta.historial].reverse().slice(0, 6)) {
    const elegido = `${nombreCorto(d.despues.modelo)} · ${x.esfuerzo[d.despues.esfuerzo]} (${textoDiferencia(d.dif, x)}${d.como === 'deshecho' ? `, ${x.deshecho}` : ''})`
    lineas.push(`  • ${x.linea(x.nivel[d.nivel], elegido, x.motivo[d.motivo])}`)
  }
  return lineas
}

// ---------- Guardias: caché vencido y límites ----------

const guardia: {
  muestras: Partial<Record<VentanaLimite, Muestra[]>>
  proyeccion: Partial<Record<VentanaLimite, Proyeccion>>
  /** Avisos y preguntas ya hechos (uno por ventana), guardados entre sesiones. */
  hechos: string[]
  hechosLeidos: boolean
  /** El periodo frío por el que ya se preguntó (el `ultimoUsoCache` de entonces). */
  frioVisto: number
  frioRechazos: number
  pegadoRechazos: number
  /** Hasta cuándo va el modo ahorro por límite (0 = apagado). */
  ahorroHasta: number
  ahorroVentana?: VentanaLimite
  /** Tu mensaje (con lo importante de antes), para devolverlo al cuadro después de /clear. */
  devolver?: string
} = { muestras: {}, proyeccion: {}, hechos: [], hechosLeidos: false, frioVisto: 0, frioRechazos: 0, pegadoRechazos: 0, ahorroHasta: 0 }

const CLAVE_GUARDIA = 'guardia-hechos'

function xg(): TextosGuardia {
  return textosGuardia[vivo.idioma]
}

function reiniciosDe(limites: readonly { kind: string; resetsAt?: string }[]): Partial<Record<VentanaLimite, number>> {
  const r: Partial<Record<VentanaLimite, number>> = {}
  for (const v of VENTANAS) {
    const iso = limites.find(l => l.kind === v)?.resetsAt
    const ms = iso === undefined ? Number.NaN : Date.parse(iso)
    if (Number.isFinite(ms)) r[v] = ms
  }
  return r
}

async function yaHecho($: $, clave: string): Promise<boolean> {
  if (!guardia.hechosLeidos) {
    guardia.hechosLeidos = true
    try {
      const g = await $.store.get(CLAVE_GUARDIA)
      if (Array.isArray(g)) guardia.hechos = g.filter((c): c is string => typeof c === 'string')
    } catch {
      // Sin nada guardado.
    }
  }
  return guardia.hechos.includes(clave)
}

async function marcarHecho($: $, clave: string): Promise<void> {
  guardia.hechos = [...guardia.hechos.filter(c => c !== clave), clave].slice(-20)
  await $.store.set(CLAVE_GUARDIA, guardia.hechos).catch(() => undefined)
}

function porcentajeDe(v: VentanaLimite): number | undefined {
  return v === 'five_hour' ? vivo.usoCache?.cincoHoras : vivo.usoCache?.semana
}

/** Con tu ritmo de gasto: ¿se acaba la ventana antes de renovarse? Avisa una vez por ventana. */
async function revisarLimites($: $, ahora: number): Promise<void> {
  if (guardia.ahorroHasta > 0 && ahora >= guardia.ahorroHasta) guardia.ahorroHasta = 0
  if (!config.guardiaLimites) return
  for (const v of VENTANAS) {
    const pct = porcentajeDe(v)
    const reinicia = vivo.usoCache?.reinicios[v]
    if (pct === undefined || reinicia === undefined) {
      delete guardia.proyeccion[v]
      continue
    }
    const muestras = agregarMuestra(guardia.muestras[v] ?? [], { t: ahora, pct }, reinicia - DURACION[v])
    guardia.muestras[v] = muestras
    const p = proyectar({ ventana: v, pct, reinicia, ahora, muestras })
    if (p === undefined) {
      delete guardia.proyeccion[v]
      continue
    }
    guardia.proyeccion[v] = p
    if (!p.avisar || p.agotaEn === undefined) continue
    const clave = `aviso:${claveVentana(v, reinicia)}`
    if (await yaHecho($, clave)) continue
    await marcarHecho($, clave)
    const x = xg().limite
    const texto = x.aviso(x.nombre[v], hora(p.agotaEn, v, vivo.idioma), hora(reinicia, v, vivo.idioma))
    void anotarDiagnostico($, `límite ${v}: ${pct}% a ${p.ritmoHora}/h, se acaba ${new Date(p.agotaEn).toISOString()}, se renueva ${new Date(reinicia).toISOString()}`)
    decir(ahora, texto.replace(/^Toki: /, ''), 'aviso', 30_000)
    $.ui.toast(texto, { timeoutMs: 10_000 })
    sonar($, 'aviso')
  }
}

type ResultadoGuardia = { drop?: string; silenciar: boolean }

/** Pegaste algo enorme: ¿lo guardo en un archivo y mando solo principio, final y errores? Devuelve el texto a enviar. */
async function guardiaPegado($: $, texto: string): Promise<{ texto: string; silenciar: boolean }> {
  if (!config.guardiaPegados || !ruta.interactivo || texto.length < PEGADO.umbral || texto.startsWith('/')) return { texto, silenciar: false }
  if (guardia.pegadoRechazos >= PEGADO.maxRechazos) return { texto, silenciar: false }
  const ahora = await $.clock.now()
  const archivo = `${CARPETA}/pegados/pegado-${new Date(ahora).toISOString().replace(/[:.]/g, '-')}.txt`
  const recorte = recortarPegado(texto, archivo, vivo.idioma)
  if (recorte === undefined) return { texto, silenciar: false }
  const x = textosPegado[vivo.idioma]
  const guardar = x.guardar(formatearTokens(recorte.tokensAntes), formatearTokens(recorte.tokensDespues))
  sonar($, 'aviso')
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta(recorte.lineas, formatearTokens(recorte.tokensAntes)), { header: 'Toki', options: [guardar, x.enviar] })
  } catch {
    return { texto, silenciar: false }
  }
  const aceptar = respuesta === guardar || (respuesta !== x.enviar && /guard|archiv|save|file|esencial|essential/i.test(respuesta))
  void anotarDiagnostico($, `pegado de ${recorte.lineas} líneas (~${formatearTokens(recorte.tokensAntes)}): ${aceptar ? 'archivo' : 'completo'}`)
  if (!aceptar) {
    guardia.pegadoRechazos += 1
    if (guardia.pegadoRechazos >= PEGADO.maxRechazos) $.ui.toast(x.callado, { timeoutMs: 8_000 })
    return { texto, silenciar: true }
  }
  guardia.pegadoRechazos = 0
  try {
    await asegurarCarpeta($)
    await $.fs.write(archivo, texto)
  } catch (err) {
    // Sin copia guardada, se manda completo: nunca se pierde lo que pegaste.
    $.ui.log(`Toki, pegado: ${String(err)}`, { to: 'debug' })
    return { texto, silenciar: true }
  }
  await sumarAhorro($, texto.length - recorte.texto.length, vivo.idioma === 'en' ? 'pasted text' : 'texto pegado', true, 'pegado')
  return { texto: recorte.texto, silenciar: true }
}

/** Antes de mandar tu mensaje: ¿estás por agotar el límite?, ¿se venció el caché con mucho contexto? */
async function guardiasAntesDeEnviar($: $, textoCrudo: string): Promise<ResultadoGuardia> {
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  if (!ruta.interactivo || texto === '' || texto.startsWith('/')) return { silenciar: false }
  const tope = await guardiaPresupuesto($, textoCrudo)
  if (tope !== undefined) return tope
  if (!config.guardiaLimites && !config.avisoCacheFrio) return { silenciar: false }
  await refrescarUso($, true)
  return (await guardiaLimite($, texto)) ?? (await guardiaFrio($, texto)) ?? { silenciar: false }
}

/** Al 90 % de una ventana, una vez: ¿modo ahorro, seguir igual o esperar? */
async function guardiaLimite($: $, texto: string): Promise<ResultadoGuardia | undefined> {
  if (!config.guardiaLimites) return undefined
  const ahora = await $.clock.now()
  if (guardia.ahorroHasta > ahora) return undefined
  const p = VENTANAS.map(v => guardia.proyeccion[v])
    .filter((q): q is Proyeccion => q !== undefined && q.critico)
    .sort((a, b) => b.pct - a.pct)[0]
  if (p === undefined) return undefined
  const clave = `critico:${claveVentana(p.ventana, p.reinicia)}`
  if (await yaHecho($, clave)) return undefined
  await marcarHecho($, clave)
  const x = xg().limite
  const renueva = hora(p.reinicia, p.ventana, vivo.idioma)
  const opciones: { tipo: OpcionLimite; etiqueta: string }[] = [
    { tipo: 'ahorro', etiqueta: `${x.opcion.ahorro} ★` },
    { tipo: 'seguir', etiqueta: x.opcion.seguir },
    { tipo: 'esperar', etiqueta: x.opcion.esperar },
  ]
  sonar($, 'aviso')
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta(Math.round(p.pct), x.nombre[p.ventana], renueva), { header: 'Toki', options: opciones.map(o => o.etiqueta) })
  } catch {
    return undefined
  }
  const tipo: OpcionLimite = opciones.find(o => o.etiqueta === respuesta)?.tipo ?? (/esper|wait/i.test(respuesta) ? 'esperar' : /ahorro|saving|sonnet|bajo|low/i.test(respuesta) ? 'ahorro' : 'seguir')
  void anotarDiagnostico($, `límite ${p.ventana} ${p.pct}%: ${tipo}`)
  if (tipo === 'esperar') {
    $.clock.after(100, () => void $.prompt.fill({ text: texto, mode: 'replace' }).catch(() => undefined))
    $.ui.toast(x.esperando, { timeoutMs: 8_000 })
    return { drop: x.esperando, silenciar: true }
  }
  if (tipo === 'ahorro') {
    guardia.ahorroHasta = p.reinicia
    guardia.ahorroVentana = p.ventana
    $.ui.toast(x.modoAhorro(renueva), { timeoutMs: 9_000 })
  }
  return { silenciar: true }
}

/** El caché venció y hay mucho contexto: este mensaje lo reescribe entero. Mejor compactar o empezar en limpio. */
async function guardiaFrio($: $, texto: string): Promise<ResultadoGuardia | undefined> {
  if (!config.avisoCacheFrio || guardia.frioRechazos >= FRIO.maxRechazos) return undefined
  if (vivo.ultimoUsoCache <= 0 || vivo.ultimoUsoCache === guardia.frioVisto) return undefined
  const familia = familiaDe(ruta.modeloPrincipal ?? vivo.modelo)
  if (familia === undefined) return undefined
  const ahora = await $.clock.now()
  const esSuscripcion = vivo.usoCache?.esSuscripcion ?? true
  const f = evaluarCacheFrio({
    ahora,
    ultimoUsoCache: vivo.ultimoUsoCache,
    ttlMin: ttlMinutos(),
    contexto: vivo.usoCache?.tokens ?? vivo.tokensUltimoTurno,
    familia,
    ttl1h: esSuscripcion,
  })
  if (f === undefined) return undefined
  guardia.frioVisto = vivo.ultimoUsoCache
  const x = xg().frio
  const opciones = opcionesFrio(f, xg())
  let respuesta: string
  try {
    respuesta = await $.ui.ask(preguntaFrio(f, esSuscripcion, xg()), { header: 'Toki', options: opciones.map(o => o.etiqueta) })
  } catch {
    return undefined
  }
  const tipo = opciones.find(o => o.etiqueta === respuesta)?.tipo ?? (/compact/i.test(respuesta) ? 'compactar' : /clear|limpi|fresh/i.test(respuesta) ? 'limpio' : 'enviar')
  void anotarDiagnostico($, `caché vencido (${f.minutos} min, ${formatearTokens(f.contexto)}): ${tipo}`)
  const conMemoria = config.memoria && !estaVacia(vivo.memoria)
  if (tipo === 'enviar') {
    guardia.frioRechazos += 1
    if (guardia.frioRechazos >= FRIO.maxRechazos) $.ui.toast(x.callado, { timeoutMs: 8_000 })
    return { silenciar: true }
  }
  guardia.frioRechazos = 0
  if (tipo === 'compactar') {
    // No se puede compactar con tu mensaje en la mano (el turno ya espera): se frena, se compacta y se reenvía.
    $.clock.after(50, () => void compactarYReenviar($, texto, conMemoria))
    return { drop: x.compactando, silenciar: true }
  }
  // Empezar en limpio: /clear y tu mensaje de vuelta al cuadro, con lo importante de antes.
  const nota = conMemoria ? notaPostCompactacion(vivo.memoria, vivo.idioma).replace(/^[^\n]*/, x.notaTitulo) : ''
  guardia.devolver = nota === '' ? texto : `${texto}\n\n${nota}`
  $.clock.after(100, () => {
    void $.command.run({ command: 'clear' }).catch(async () => {
      await $.prompt.fill({ text: '/clear', mode: 'replace' }).catch(() => undefined)
      $.ui.toast(x.pulsaEnter, { timeoutMs: 10_000 })
    })
  })
  $.ui.toast(x.limpiando, { timeoutMs: 6_000 })
  return { drop: x.limpiando, silenciar: true }
}

async function compactarYReenviar($: $, texto: string, conMemoria: boolean): Promise<void> {
  const x = xg().frio
  const devolver = async (): Promise<void> => {
    $.ui.toast(x.noCompacto, { timeoutMs: 8_000 })
    await $.prompt.fill({ text: texto, mode: 'replace' }).catch(() => undefined)
  }
  try {
    const r = await $.session.compact(conMemoria ? { instructions: instruccionesDeCompactacion(vivo.memoria, vivo.idioma) } : {})
    if ('skip' in r) {
      await devolver()
      return
    }
    await registrarCompactacion($, 'resumen')
    await refrescarUso($, true)
  } catch (err) {
    $.ui.log(`Toki, compactar antes de enviar: ${String(err)}`, { to: 'debug' })
    await devolver()
    return
  }
  // Tu mensaje, como tuyo: Claude lo lee igual que si lo hubieras escrito. Toki decide antes el esfuerzo.
  try {
    await planearTurno($, texto, true)
  } catch {
    // Sin plan: va como está.
  }
  await $.prompt.submit({ text: texto, asUser: true }).catch(async () => {
    await $.prompt.fill({ text: texto, mode: 'replace' }).catch(() => undefined)
  })
}

/** Después de /clear: tu mensaje vuelve al cuadro. */
function devolverMensaje($: $): void {
  const texto = guardia.devolver
  if (texto === undefined) return
  guardia.devolver = undefined
  guardia.frioVisto = 0
  guardia.pegadoRechazos = 0
  $.clock.after(300, () => {
    void $.prompt
      .fill({ text: texto, mode: 'replace' })
      .then(() => $.ui.toast(xg().frio.devuelto, { timeoutMs: 8_000 }))
      .catch(() => undefined)
  })
}

// ---------- Registro ----------

export const register: Register = (on, options) => {
  config.compresion = options['compresion'] !== false
  config.mapaAuto = options['mapaAutomatico'] !== false
  config.acompanante = options['acompanante'] !== false
  config.memoria = options['memoria'] !== false
  config.conciso = options['concisoAutomatico'] !== false
  config.mantenerCache = options['mantenerCache'] === true
  config.idioma = typeof options['idioma'] === 'string' ? options['idioma'] : 'auto'
  config.ventana = leerVentana(options['ventanaCompactacion'])
  config.repetidas = options['salidasRepetidas'] !== false
  config.avisoCacheFrio = options['avisoCacheFrio'] !== false
  config.guardiaLimites = options['guardiaLimites'] !== false
  config.guardiaGenerados = options['guardiaGenerados'] !== false
  config.guardiaPegados = options['guardiaPegados'] !== false
  config.busquedas = options['resumirBusquedas'] !== false
  vivo.sonidos = options['sonidos'] !== false
  ruta.modoConfig = leerModo(options['recomendarModelo'])
  ruta.modo = ruta.modoConfig
  ruta.subagentes = options['subagentesSonnet'] !== false
  if (config.idioma === 'es' || config.idioma === 'en') {
    vivo.idioma = config.idioma
    vivo.idiomaFijo = true
  }

  on('session.start', async ($, e, next) => {
    const ahora = await $.clock.now()
    vivo.inicio = ahora
    await elegirIdioma($)
    const x = tx()
    await $.command.register({ name: 'toki', description: x.cmdPanel })
    await $.command.register({ name: 'toki-mapa', description: x.cmdMapa })
    await $.command.register({ name: 'toki-por-que', description: x.cmdPorQue })
    await $.command.register({ name: 'toki-modelo', description: xr().cmd, argumentHint: 'preguntar | siempre | automatico | no' })
    await $.command.register({
      name: 'toki-semana',
      description: vivo.idioma === 'en' ? 'Toki: your weekly savings card' : 'Toki: tu tarjeta semanal de ahorro',
      argumentHint: vivo.idioma === 'en' ? '[last]' : '[pasada]',
    })
    await $.command.register({ name: 'toki-presupuesto', description: xp().cmd, argumentHint: xp().pista })
    ruta.interactivo = e.isInteractive === true
    try {
      const guardado = await $.store.get(CLAVE_MODO_RUTA)
      if (typeof guardado === 'string') ruta.modo = leerModo(guardado)
    } catch {
      // Sin preferencia guardada: la de /plugin.
    }
    // Animación de Toki: un cuadro cada 600 ms mientras la franja esté visible.
    if (config.acompanante) {
      $.clock.every(600, () => {
        vivo.tick += 1
        void read($, oculto).then(estaOculto => {
          if (!estaOculto) $.ui.invalidate('ui.render')
        })
      })
    }
    if (config.memoria) $.clock.every(3_000, () => void detectarMarca($))
    $.clock.every(5_000, () => void vigilar($))
    if (config.mantenerCache) $.clock.every(30_000, () => void mantenerCaliente($))
    if (config.mapaAuto) $.clock.after(3_000, () => void mapaAutomatico($))
    if (config.acompanante) $.clock.after(6_000, () => void abrirPanelSiNoHayFranja($))
    void $.session
      .surfaces()
      .then(superficies => anotarDiagnostico($, `inicio ${VERSION}: superficie=${String(e.surface)} interactiva=${String(e.isInteractive)} superficies=${superficies.join(', ') || 'ninguna'}`))
      .catch(() => undefined)
    try {
      vivo.modelo = await $.session.model()
    } catch {
      // Sin modelo aún.
    }
    // Claude Code lee la ventana de compactación al empezar: puesta a mitad de un turno no cuenta.
    await ajustarVentana($, e.isInteractive === true)
    // Sesión reanudada: recupera el último punto de control si es reciente.
    if (config.memoria) {
      try {
        const guardado = JSON.parse(await $.fs.read(`${CARPETA}/punto-de-control.json`)) as PuntoDeControl
        if (ahora - guardado.cuando < 24 * 3_600_000) vivo.memoria = { ...vacio(guardado.cuando), ...guardado }
      } catch {
        // No hay punto de control: se empieza de cero.
      }
    }
    const migrado = await migrarDesdeAhorroTokens($)
    if (migrado > 0) {
      decir(ahora, x.migrado(formatearTokens(migrado)), 'bien', 20_000)
      $.ui.toast(`Toki: ${x.migrado(formatearTokens(migrado))}`, { timeoutMs: 8000 })
    }
    await revisarLogros($)
    vivo.costoContado = 0
    await alaSemana($, { sesiones: 1 })
    if (e.isInteractive) await avisarSemana($, ahora)
    if (e.isInteractive && config.acompanante && vivo.mensaje === undefined) decir(ahora, x.saludo(vivo.total > 0 ? formatearTokens(vivo.total) : undefined, vivo.racha), 'normal', 15_000)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    reiniciarSeguimiento()
    if (e.reason === 'clear') {
      tarea.p = undefined
      reiniciarConversacion()
      reiniciarRuta()
      await update($, sesion, () => SESION_VACIA)
      await update($, gasto, () => GASTO_VACIO)
      await update($, fallos, () => ({}))
      await update($, avisoMapaDado, () => false)
      devolverMensaje($)
    }
    return next(e)
  })

  // Antes de mandar tu mensaje: ¿qué modelo y esfuerzo merece? Solo lo que tú escribes.
  on('prompt.submit', async ($, e, next) => {
    const deLaPersona = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (e.command !== undefined || e.isMeta === true || e.turnId !== undefined || !deLaPersona) return next(e)
    let silenciar = false
    let texto = e.text
    try {
      const p = await guardiaPegado($, texto)
      texto = p.texto
      silenciar = p.silenciar
    } catch (err) {
      $.ui.log(`Toki, pegado: ${String(err)}`, { to: 'debug' })
    }
    try {
      const g = await guardiasAntesDeEnviar($, texto)
      if (g.drop !== undefined) return { drop: g.drop }
      silenciar = silenciar || g.silenciar
    } catch (err) {
      $.ui.log(`Toki, guardias: ${String(err)}`, { to: 'debug' })
    }
    try {
      await planearTurno($, texto, silenciar)
    } catch (err) {
      $.ui.log(`Toki, modelo y esfuerzo: ${String(err)}`, { to: 'debug' })
    }
    return next(texto === e.text ? e : { ...e, text: texto })
  })

  // Subagentes con encargos simples: Sonnet. Empiezan sin contexto, no se pierde caché.
  on('agent.spawn', async ($, e, next) => {
    if (!ruta.subagentes || ruta.modo === 'no' || e.model !== undefined) return next(e)
    const modelo = modeloSubagente(e.subagentType, e.prompt, e.parentModel)
    if (modelo === undefined) return next(e)
    const r = await next({ ...e, model: modelo })
    if (familiaDe((r as { model?: string }).model) === 'sonnet') {
      ruta.subagentesEnSonnet += 1
      if (!ruta.avisoSubagentes) {
        ruta.avisoSubagentes = true
        $.ui.toast(xr().subagentes, { timeoutMs: 7000 })
      }
    }
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      // El esfuerzo que se eligió para este mensaje vale para todos sus pedidos, y solo para ellos.
      ruta.turno = ruta.pendiente !== undefined ? e.turnId : undefined
      ruta.esfuerzo = ruta.pendiente?.esfuerzo
      ruta.pendiente = undefined
      vivo.enTurno = true
      vivo.actividad = 'pensando'
      vivo.ultimoAhorro = undefined
      vivo.bucleReciente = false
      vivo.salidasGrandesEnTurno = 0
      vivo.pingsEnPausa = 0
      vivo.apagadoEnPausa = false
      vivo.mensaje = undefined
      // Avisos de la app (<task-notification>…) no son la tarea ni el idioma de la persona.
      const texto = quitarEtiquetasDeSistema(e.text)
      if (texto !== '' && !texto.startsWith('/')) await aprenderIdioma($, texto)
      // ¿Se compactó entre turnos? El contexto queda sin cifra hasta la próxima respuesta.
      // Va antes de anotar la tarea nueva: la nota lleva la tarea de antes de compactar.
      try {
        const uso = await $.session.usage()
        if (vivo.tokensUltimoTurno >= CONTEXTO_RELEVANTE && uso.context.tokens === undefined) await registrarCompactacion($, 'turno')
      } catch {
        // Sin cifras: nada que comparar.
      }
      // Un "sí", "dale" o "sigue" no es una tarea nueva: se conserva la anterior.
      if (texto !== '' && !texto.startsWith('/') && (texto.length >= 25 || vivo.memoria.tareaActual === '')) {
        vivo.memoria.tareaActual = recortar(texto, LIMITES_MEMORIA.tarea)
      }
      void revisarModelo($)
      if (vivo.ventanaFuente === undefined) void ajustarVentana($, false)
    }
    return next(e)
  })

  // Cada pedido al modelo: lo que costó (cifras de la API) y lo que Toki evitó releer.
  on('turn.step', async function* ($, e, next) {
    let pedido = e
    if (e.agentId === undefined) {
      if (esEsfuerzo(e.effort)) ruta.esfuerzoSesion = e.effort
      // Solo sobre tu modelo: si Claude Code cayó a otro (sobrecarga), se respeta.
      const sobreTuModelo = familiaDe(e.model) !== undefined && familiaDe(e.model) === familiaDe(vivo.modelo)
      const modelo = ruta.modeloPrincipal !== undefined && !ruta.modeloRoto && sobreTuModelo ? ruta.modeloPrincipal : e.model
      const esfuerzo = ruta.esfuerzo !== undefined && ruta.turno === e.turnId && e.effort !== undefined ? ruta.esfuerzo : e.effort
      if (modelo !== e.model || esfuerzo !== e.effort) {
        pedido = { ...e, model: modelo, effort: esfuerzo }
        if (e.index === 0) void anotarDiagnostico($, `pedido: ${e.model}/${String(e.effort)} → ${modelo}/${String(esfuerzo)}`)
      }
    }
    const respuesta = yield* next(pedido)
    if (e.agentId === undefined && respuesta.usage !== null) {
      ruta.cacheFrio = false
      // Cada pedido lee o escribe el caché: desde aquí corre su vida (1 h o 5 min).
      vivo.ultimoUsoCache = await $.clock.now()
    }
    // ¿Respondió el modelo que Toki pidió? Si no, se deja de cambiar el modelo (el esfuerzo sigue).
    if (pedido.model !== e.model && respuesta.usage !== null && familiaDe(respuesta.usage.model) !== familiaDe(pedido.model)) {
      ruta.modeloRoto = true
      ruta.modeloPrincipal = undefined
      $.ui.toast(xr().modeloNoDisponible(nombreCorto(pedido.model)), { timeoutMs: 8000 })
      void anotarDiagnostico($, `modelo pedido ${pedido.model}, respondió ${respuesta.usage.model}`)
    }
    if (respuesta.usage !== null) {
      try {
        await alPedido($, e.agentId !== undefined, respuesta.usage)
      } catch {
        // Sin cifras de este pedido: no cambia nada para Claude.
      }
    }
    return respuesta
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ahora = await $.clock.now()
      const x = tx()
      vivo.enTurno = false
      await update($, sesion, s => ({ ...s, ultimaActividad: ahora }))
      vivo.actividad = 'listo'
      if (e.usage !== undefined) {
        vivo.ultimoUsoCache = ahora
        const entrada = e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens
        if (entrada > 0) vivo.aprovechado = Math.round((e.usage.cache_read_input_tokens / entrada) * 100)
      }
      if (vivo.ultimoAhorro !== undefined) sonar($, 'listo')
      for (const d of extraerDecisiones(e.answer)) vivo.memoria.decisiones = recordar(vivo.memoria.decisiones, d, LIMITES_MEMORIA.decisiones)
      if (config.memoria) await guardarMemoria($)
      await refrescarUso($, true)
      const uso = vivo.usoCache
      vivo.tokensUltimoTurno = uso?.tokens ?? vivo.tokensUltimoTurno
      vivo.ultimoTurnoCompleto = ahora
      try {
        vivo.modeloUltimoTurno = await $.session.model()
        vivo.modelo = vivo.modelo ?? vivo.modeloUltimoTurno
      } catch {
        // Sin modelo.
      }
      if ((uso?.tokens ?? 0) >= 200_000) {
        vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'conversacion-pesada', texto: x.leccionPesada(formatearTokens(uso?.tokens ?? 0)) })
      }
      if (uso !== undefined && ahora - uso.inicio > 3 * 3_600_000) {
        vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'sesion-larga', texto: x.leccionSesionLarga })
      }
      // Por tamaño, no por % de la ventana: con 1M de ventana el 50% llegaba tarde o nunca.
      const umbralConciso = Math.min(UMBRAL_CONCISO, Math.round((vivo.ventana ?? uso?.ventana ?? 200_000) * 0.5))
      if (config.conciso && !vivo.nudgeConciso && (uso?.tokens ?? 0) >= umbralConciso) {
        vivo.nudgeConciso = true
        await notaParaClaude($, x.notaConciso)
        $.ui.toast(x.toastConciso, { timeoutMs: 6000 })
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
    const herramienta = String(e.tool)
    vivo.actividad = actividadDeHerramienta(herramienta)
    await update($, sesion, s => ({ ...s, llamadas: s.llamadas + 1 }))
    const entrada = e as { file_path?: unknown; offset?: unknown; limit?: unknown }
    if ((herramienta === 'Edit' || herramienta === 'Write' || herramienta === 'MultiEdit') && typeof entrada.file_path === 'string') {
      vivo.memoria.archivosEditados = recordar(vivo.memoria.archivosEditados, entrada.file_path, LIMITES_MEMORIA.archivos)
    }
    // Archivos generados (lockfiles, minificados, build): la primera lectura completa se frena; repetirla la deja pasar.
    if (config.guardiaGenerados && herramienta === 'Read' && typeof entrada.file_path === 'string' && entrada.offset === undefined && entrada.limit === undefined) {
      const tipo = tipoGenerado(entrada.file_path)
      const veces = tipo === undefined ? 0 : (vivo.generadosFrenados.get(entrada.file_path) ?? 0) + 1
      if (tipo !== undefined) vivo.generadosFrenados.set(entrada.file_path, veces)
      if (tipo !== undefined && veces === 1) {
        const nombre = entrada.file_path.split(/[\\/]/).pop() ?? entrada.file_path
        const tg = textosGenerados[vivo.idioma === 'en' ? 'en' : 'es']
        $.ui.toast(tg.toast(nombre), { timeoutMs: 6000 })
        await alaSemana($, { frenos: 1 })
        return { deny: tg.frenado(nombre, tipo) }
      }
      // En vivo, Claude repetía la lectura entera de inmediato: la segunda trae solo un tramo; la tercera, todo.
      if (tipo !== undefined && veces === 2) return next({ ...e, limit: TRAMO_GENERADO } as typeof e)
    }
    let nudgeLectura: string | undefined
    if (herramienta === 'Read' && typeof entrada.file_path === 'string' && entrada.offset === undefined && entrada.limit === undefined) {
      const n = (vivo.lecturas[entrada.file_path] ?? 0) + 1
      vivo.lecturas[entrada.file_path] = n
      if (n >= 4 && !vivo.nudgeLecturas) {
        vivo.nudgeLecturas = true
        const x = tx()
        const nombre = entrada.file_path.split(/[\\/]/).pop() ?? entrada.file_path
        vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'relecturas', texto: x.leccionRelecturas(nombre, n) })
        nudgeLectura = x.nudgeLectura(nombre, n)
      }
    }
    try {
      const ran = await next(e)
      if (nudgeLectura !== undefined && ran.deny === undefined && ran.isError !== true) return { ...ran, context: [...(ran.context ?? []), nudgeLectura] }
      return ran
    } finally {
      vivo.actividad = 'pensando'
      // Tras cada herramienta Claude vuelve a llamar al modelo: el caché sigue en uso.
      try {
        vivo.ultimoUsoCache = await $.clock.now()
      } catch {
        // Sin reloj: no importa.
      }
    }
  })

  // Sin guardia corporativo, Toki también muestra cuándo Claude espera tu permiso.
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

  // Sin guardia corporativo llega el evento con el costo estimado; con guardia, revisarModelo() lo nota igual.
  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.source !== 'resume' && e.prompt_cache_warm) await avisarCambioModelo($, e.from_model, e.to_model, e.context_tokens, e.estimated_cache_write_usd, true)
    return next(e)
  })

  // Sin guardia corporativo, además guiamos el resumen de la compactación.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || e.trigger === 'precompute') return next(e)
    const anterior = vivo.actividad
    vivo.actividad = 'compactando'
    $.ui.invalidate('ui.render')
    let entrada = e
    if (config.memoria) {
      await guardarMemoria($)
      if (!estaVacia(vivo.memoria)) {
        const extra = instruccionesDeCompactacion(vivo.memoria, vivo.idioma)
        entrada = { ...e, instructions: e.instructions ? `${e.instructions}\n\n${extra}` : extra }
      }
    }
    try {
      const resultado = await next(entrada)
      if (resultado.messages !== undefined) await registrarCompactacion($, 'resumen')
      return resultado
    } finally {
      vivo.actividad = anterior === 'compactando' ? 'tranquilo' : anterior
    }
  })

  // Motor (Bash): compactar salidas ruidosas, rescatar el error del final y detectar bucles.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const comando = e.command
    const compactable = prepararComando(comando)
    const busqueda = !compactable && config.compresion && config.busquedas ? tipoBusqueda(comando) : undefined
    const captura = compactable || busqueda !== undefined ? await planearCaptura($, comando) : undefined
    const rescate = !compactable && busqueda === undefined && config.compresion ? await planearRescate($, comando) : undefined
    const ampliado = compactable || (busqueda !== undefined && captura !== undefined)
    if (ampliado) await ampliarLimite($)
    // El modelo sigue viendo su comando original en el historial; solo cambia cómo se ejecuta.
    const envuelto = captura ?? rescate
    let ran
    try {
      ran = await next(envuelto ? { ...e, command: envuelto.comando } : e)
    } finally {
      if (ampliado) await restaurarLimite($)
    }
    if (ran.deny !== undefined) return ran
    const principal = e.agentId === undefined
    if (busqueda !== undefined && ran.isError !== true) {
      const nuevo = await resumirBusquedaShell($, comando, busqueda, ran.result, captura, principal)
      if (nuevo !== undefined) return { result: { ...ran.result, ...nuevo, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    const aviso = await despuesDeEjecutar($, comando, ran.isError === true, ran.text)
    if (ran.isError !== true) {
      const repetida = await revisarRepetida($, 'Bash', comando, e.agentId, ran.result, envuelto)
      if (repetida !== undefined) return { result: { ...ran.result, ...repetida, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    if (compactable) {
      if (ran.isError === true) {
        const texto = await compactarFallo($, comando, ran.text ?? '', captura, principal)
        if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
      } else {
        const nuevo = await compactarExito($, comando, ran.result, captura, principal)
        if (nuevo !== undefined) return { result: { ...ran.result, ...nuevo, persistedOutputPath: undefined, persistedOutputSize: undefined } }
      }
    }
    if (rescate !== undefined) {
      if (ran.isError === true) {
        const bloque = await rescatar($, comando, rescate, ran.text ?? '')
        if (bloque !== undefined) return { deny: [ran.text ?? '', bloque, aviso].filter(Boolean).join('\n\n') }
      } else if (ran.result.backgroundTaskId === undefined && !ran.result.interrupted) {
        const bloque = await rescatar($, comando, rescate, `${ran.result.stdout}\n${ran.result.stderr}`)
        if (bloque !== undefined) return { result: { ...ran.result, stdout: `${ran.result.stdout.replace(/\n+$/, '')}\n\n${bloque}` } }
      }
    }
    if (aviso !== undefined && ran.isError === true) return { deny: `${ran.text ?? ''}\n\n${aviso}` }
    return conAvisoMapa($, 'Bash', comando, ran)
  })

  // Motor (PowerShell, Windows sin Git Bash): lo mismo, con Tee-Object. Ante cualquier sorpresa, la salida original.
  on('tool.call', { tool: /^PowerShell$/ }, async ($, e, next) => {
    const comando = (e as { command?: unknown }).command
    if (typeof comando !== 'string') return next(e)
    const compactable = prepararComando(comando)
    const captura = compactable ? await planearCapturaPs($, comando) : undefined
    const rescate = !compactable && config.compresion ? await planearRescatePs($, comando) : undefined
    const envuelto = captura ?? rescate
    const ran = await next(envuelto ? ({ ...e, command: envuelto.comando } as typeof e) : e)
    if (ran.deny !== undefined) return ran
    const aviso = await despuesDeEjecutar($, comando, ran.isError === true, ran.text)
    try {
      const r = ran.isError === true ? undefined : comoSalidaShell(ran.result)
      const conSalida = (nuevo: { stdout: string; stderr: string }) => {
        const base = ran.result as Record<string, unknown>
        const resultado: Record<string, unknown> = { ...base, ...nuevo }
        if ('persistedOutputPath' in base) resultado['persistedOutputPath'] = undefined
        if ('persistedOutputSize' in base) resultado['persistedOutputSize'] = undefined
        return { result: resultado }
      }
      const principal = e.agentId === undefined
      if (r !== undefined) {
        const repetida = await revisarRepetida($, 'PowerShell', comando, e.agentId, r, envuelto)
        if (repetida !== undefined) return conSalida(repetida)
      }
      if (compactable) {
        if (ran.isError === true) {
          const texto = await compactarFallo($, comando, ran.text ?? '', captura, principal)
          if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
        } else if (r === undefined) anotarMotivo(comando, 'formato')
        else {
          const nuevo = await compactarExito($, comando, r, captura, principal)
          if (nuevo !== undefined) return conSalida(nuevo)
        }
      }
      if (rescate !== undefined) {
        if (ran.isError === true) {
          const bloque = await rescatar($, comando, rescate, ran.text ?? '', 'Select-Object -Last')
          if (bloque !== undefined) return { deny: [ran.text ?? '', bloque, aviso].filter(Boolean).join('\n\n') }
        } else if (r !== undefined) {
          const bloque = await rescatar($, comando, rescate, `${r.stdout}\n${r.stderr}`, 'Select-Object -Last')
          if (bloque !== undefined) return conSalida({ stdout: `${r.stdout.replace(/\n+$/, '')}\n\n${bloque}`, stderr: r.stderr })
        }
      }
    } catch (err) {
      $.ui.log(`PowerShell: se deja la salida original (${String(err)})`, { to: 'debug' })
    }
    if (aviso !== undefined && ran.isError === true) return { deny: `${ran.text ?? ''}\n\n${aviso}` }
    return conAvisoMapa($, 'PowerShell', comando, ran)
  })

  // Grep y Glob no existen en los builds nativos (macOS, Linux): se buscan por nombre.
  on('tool.call', { tool: /^Grep$/ }, async ($, e, next) => conAvisoMapa($, 'Grep', undefined, await next(e)))
  on('tool.call', { tool: /^Glob$/ }, async ($, e, next) => conAvisoMapa($, 'Glob', undefined, await next(e)))

  // Comandos: /toki, /toki-mapa y /toki-por-que. No dejan instrucciones fijas en el contexto.
  on('command.run', { command: 'toki' }, async $ => {
    await update($, oculto, () => false)
    const abierto = await $.ui.open({ id: PANEL, title: 'Toki' })
    if (abierto.isPlaced) return { text: tx().panelAbierto }
    return { text: reporteEnTexto(await reporte($)) }
  })

  on('command.run', { command: 'toki-presupuesto' }, async ($, e) => ({ text: await comandoPresupuesto($, e.args) }))

  on('command.run', { command: 'toki-semana' }, async ($, e) => {
    const ahora = await $.clock.now()
    const semanas = await leerSemanasDe($)
    const pasada = /^(pasada|last|anterior|prev)/i.test(e.args.trim())
    const actual = lunesDe(ahora)
    const lunes = pasada
      ? (Object.keys(semanas)
          .filter(k => k < actual)
          .sort()
          .pop() ?? actual)
      : actual
    const historial = await leerHistorial($)
    return { text: tarjetaSemana(semanas, lunes, ahora, historial, { idioma: vivo.idioma, mostrarCosto: vivo.usoCache?.esSuscripcion !== true, racha: racha(historial, ahora) }) }
  })

  on('command.run', { command: 'toki-por-que' }, async $ => ({ text: await textoDecisiones($) }))

  on('command.run', { command: 'toki-modelo' }, async ($, e) => {
    const x = xr()
    const arg = e.args.trim().toLowerCase()
    if (/^(preguntar|siempre|autom[aá]tico|auto|no|off|apagado)$/.test(arg)) {
      ruta.modo = leerModo(arg)
      ruta.silenciado = false
      ruta.rechazos = 0
      ruta.preferencias = {}
      guardia.ahorroHasta = 0
      // Apagado: de vuelta a tu modelo y tu esfuerzo desde el próximo pedido.
      if (ruta.modo === 'no') reiniciarRuta()
      await $.store.set(CLAVE_MODO_RUTA, ruta.modo).catch(() => undefined)
      $.ui.invalidate('ui.render')
      return { text: x.modoCambiado(x.modo[ruta.modo]) }
    }
    return { text: [...textoRuta(x), '', x.uso].join('\n') }
  })

  on('command.run', { command: 'toki-mapa' }, async $ => {
    const { archivos, truncado } = await generarMapa($)
    return { text: archivos === 0 ? tx().mapaVacio : tx().mapaListo(archivos, truncado, RUTA_MAPA) }
  })

  // El panel de /toki.
  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const x = tx()
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
    if (!vivo.panelDibujado) void anotarDiagnostico($, `panel pedido por la superficie ${e.surface}`)
    vivo.panelDibujado = true
    // Toki en vivo arriba del panel: la misma cara y frase que la franja.
    const s = r.sesion
    const ahora = await $.clock.now()
    const uso = vivo.usoCache
    const ttl = ttlMinutos()
    const ultimoUso = Math.max(vivo.ultimoUsoCache, s.ultimaActividad)
    const desdeCache = ultimoUso > 0 ? (ahora - ultimoUso) / 60_000 : 0
    const actividad = decidirActividad(
      vivo.actividad,
      vivo.enTurno,
      uso?.pct,
      vivo.enTurno ? 0 : desdeCache,
      ttl,
      s.ultimaActividad > 0,
      uso?.tokens,
      ahora < vivo.silencioPesadoHasta,
      ahora < vivo.celebrandoHasta,
    )
    const dicho = frase(
      {
        actividad,
        contextoPct: uso?.pct,
        contextoTokens: uso?.tokens,
        inactivoMinutos: s.ultimaActividad > 0 ? (ahora - s.ultimaActividad) / 60_000 : 0,
        ahorradoSesion: s.tokensAhorrados,
        ultimoAhorro: vivo.ultimoAhorro,
        bucleReciente: vivo.bucleReciente,
      },
      vivo.idioma,
    )
    if (vivo.mensaje !== undefined && ahora < vivo.mensaje.hasta && (actividad === 'tranquilo' || actividad === 'listo' || actividad === 'celebrando')) {
      dicho.texto = vivo.mensaje.texto
      dicho.tono = vivo.mensaje.tono
    }
    const colorFrase = dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : dicho.tono === 'bien' ? 'success' : 'text'
    const cacheRestante = vivo.enTurno ? ttl : ultimoUso > 0 ? Math.max(0, ttl - desdeCache) : undefined
    const medidores = `${x.contexto} ${uso?.pct === undefined ? '—' : `${uso.pct}%`} · ${x.cache} ${relojCache(cacheRestante, ttl)} ${cacheRestante === undefined ? '—' : cacheRestante <= 0 ? x.frio : formatearMinutos(cacheRestante, vivo.idioma)} · ${x.ahorrado} ~${formatearTokens(s.tokensAhorrados)}`
    return (
      <Box flexDirection="column" paddingX={1}>
        {e.surface !== 'terminal' &&
          (() => {
            return (
              <Box flexDirection="row" gap={2} alignItems="center" marginBottom={1}>
                {mascotaGrafica($, e, actividad, 120)}
                <Box flexDirection="column" flexGrow={1}>
                  <Text color="claude" bold>
                    Toki
                  </Text>
                  <Text color={colorFrase} wrap="wrap">
                    {dicho.texto}
                  </Text>
                  <Text dimColor>{medidores}</Text>
                </Box>
              </Box>
            )
          })()}
        <Box flexDirection="row" gap={1}>
          <Text color="claude" bold>
            {cuadro(actividad, vivo.tick)} {x.panelTitulo}
          </Text>
          <Text dimColor>· {x.eslogan}</Text>
        </Box>
        <Box flexDirection="row" marginTop={1}>
          {cifra(x.estaSesion, `~${formatearTokens(r.sesion.tokensAhorrados)}`, 'success')}
          {cifra(x.hoy, `~${formatearTokens(r.hoy)}`)}
          {cifra(x.dias7, `~${formatearTokens(r.semana)}`)}
          {cifra(x.dias30, `~${formatearTokens(r.mes)}`)}
          {cifra(x.historico, `~${formatearTokens(r.total)}`, 'claude')}
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text dimColor wrap="wrap">
            {x.resumenSesion(r.sesion.compactaciones, r.sesion.llamadas, r.sesion.bucles)}
            {r.contexto ? ` · ${x.contexto} ${r.contexto.pct === undefined ? '—' : `${r.contexto.pct}%`} / ${formatearTokens(r.contexto.ventana)}` : ''}
            {vivo.aprovechado !== undefined ? ` · ${x.aprovechado(vivo.aprovechado)}` : ''}
            {r.contexto?.costo !== undefined && !r.contexto.esSuscripcion ? ` · $${r.contexto.costo.toFixed(2)}` : ''}
          </Text>
        </Box>
        {ruta.modo !== 'no' && (
          <Box flexDirection="column" marginTop={1}>
            {textoRuta(xr()).map((l, i) =>
              i === 0 ? (
                <Text bold wrap="wrap">
                  {l}
                </Text>
              ) : (
                <Text dimColor wrap="wrap">
                  {l}
                </Text>
              ),
            )}
          </Box>
        )}
        {(r.gasto.pedidos > 0 || r.ventanaTexto !== undefined) && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{x.gastoTitulo}</Text>
            {lineasGasto(x, r.gasto).map(l => (
              <Text wrap="wrap">
                {'  '}
                {l}
              </Text>
            ))}
            {(r.sesion.relecturasEvitadas ?? 0) > 0 && (
              <Text color="success" wrap="wrap">
                {'  '}
                {x.relecturasLinea(formatearTokens(r.sesion.relecturasEvitadas))}
              </Text>
            )}
            {r.ventanaTexto !== undefined && (
              <Text dimColor wrap="wrap">
                {'  '}
                {r.ventanaTexto}
              </Text>
            )}
            {r.porQueCero !== undefined && (
              <Text dimColor wrap="wrap">
                {'  '}
                {r.porQueCero}
              </Text>
            )}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={r.racha > 0 ? 'warning' : 'text'}>
            {r.racha > 0 ? x.rachaDias(r.racha) : x.rachaNinguna}
          </Text>
          <Text wrap="wrap">
            <Text bold>{x.logros}:</Text>
            {LOGROS.map(l => (
              <Text color={r.logros.includes(l) ? 'success' : 'inactive'}>
                {'  '}
                {r.logros.includes(l) ? '✓' : '○'} {x.logroNombres[l] ?? l}
              </Text>
            ))}
          </Text>
          {vivo.pingsTotales > 0 && (
            <Text dimColor wrap="wrap">
              {x.cacheMantenido(vivo.pingsTotales, formatearTokens(vivo.tokensLeidosPing))}
            </Text>
          )}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{x.ahorroPorDia}</Text>
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
            <Text bold>{x.queOcupa}</Text>
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
            <Text bold>{x.ultimosComandos}</Text>
            {[...vivo.decisiones]
              .reverse()
              .slice(0, 6)
              .map(d => (
                <Text wrap="truncate-end">
                  {'  '}
                  <Text color={d.resultado === 'sin-cambio' ? 'inactive' : 'success'}>{marcaDecision(d)}</Text> {d.comando}{' '}
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
              {x.loQueNoto}
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
          <Text bold>{x.sugerencias}</Text>
          {r.sugerencias.map(sug => (
            <Text wrap="wrap">
              {'  • '}
              {sug}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {!r.hayMapa && <Button key="crear-mapa" label={x.crearMapa} onPress={() => void generarMapa($).then(() => $.ui.invalidate('ui.render'))} />}
          <Button key="cerrar" plain dimColor label={x.cerrar} onPress={() => void $.ui.close({ id: PANEL })} />
        </Box>
      </Box>
    )
  })

  // La franja de Toki sobre el prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!config.acompanante || e.props.hasSurvey || (await read($, oculto))) return next(e)
    if (!vivo.bandaDibujada) void anotarDiagnostico($, `franja pedida por la superficie ${e.surface}`)
    vivo.bandaDibujada = true
    const { Box, Button, Text } = $.ui.resolve(e)
    const x = tx()
    const s = await read($, sesion)
    const esCompacto = await read($, compacto)
    const verDetalles = await read($, detalles)
    await refrescarUso($)
    const uso = vivo.usoCache
    const ahora = await $.clock.now()
    const pct = uso?.pct
    const ttl = ttlMinutos()
    const ultimoUso = Math.max(vivo.ultimoUsoCache, s.ultimaActividad)
    const inactivo = s.ultimaActividad > 0 ? (ahora - s.ultimaActividad) / 60_000 : 0
    const desdeCache = ultimoUso > 0 ? (ahora - ultimoUso) / 60_000 : 0
    // Mientras Claude trabaja, el caché está en uso.
    const cacheRestante = e.props.isWorking ? ttl : ultimoUso > 0 ? Math.max(0, ttl - desdeCache) : undefined
    const actividad = decidirActividad(
      vivo.actividad,
      e.props.isWorking,
      pct,
      e.props.isWorking ? 0 : desdeCache,
      ttl,
      s.ultimaActividad > 0,
      uso?.tokens,
      ahora < vivo.silencioPesadoHasta,
      ahora < vivo.celebrandoHasta,
    )
    const dicho = frase(
      {
        actividad,
        contextoPct: pct,
        contextoTokens: uso?.tokens,
        cacheMinutosRestantes: cacheRestante,
        inactivoMinutos: inactivo,
        ahorradoSesion: s.tokensAhorrados,
        ultimoAhorro: vivo.ultimoAhorro,
        bucleReciente: vivo.bucleReciente,
      },
      vivo.idioma,
    )
    if (vivo.mensaje !== undefined && ahora < vivo.mensaje.hasta && (actividad === 'tranquilo' || actividad === 'listo' || actividad === 'celebrando')) {
      dicho.texto = vivo.mensaje.texto
      dicho.tono = vivo.mensaje.tono
    }
    if (actividad === 'alerta' && !vivo.avisoContexto) {
      vivo.avisoContexto = true
      sonar($, 'aviso')
    }
    if (actividad !== 'alerta' && vivo.avisoContexto && (pct ?? 0) < 60) vivo.avisoContexto = false
    const colorFrase = dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : dicho.tono === 'bien' ? 'success' : 'text'
    const mascota = cuadro(actividad, vivo.tick)
    const ancho = e.props.bodyColumns
    const angosto = ancho < 90
    const colorCache = cacheRestante === undefined ? 'inactive' : cacheRestante <= 0 ? 'error' : cacheRestante < ttl * 0.25 ? 'warning' : 'success'
    const cacheTexto = cacheRestante === undefined ? '—' : cacheRestante <= 0 ? x.frio : formatearMinutos(cacheRestante, vivo.idioma)
    const pctTexto = pct === undefined ? '—' : `${pct}%`
    const conRacha = vivo.racha >= 2

    const botonOcultar = <Button key="ocultar" plain dimColor label="×" onPress={() => update($, oculto, () => true)} />
    const botonTamano = <Button key="tamano" plain dimColor label={esCompacto ? '+' : '−'} onPress={() => update($, compacto, v => !v)} />
    // Toki cambió el modelo o el esfuerzo de este mensaje: el borde parpadea unos segundos y se puede deshacer.
    const avisoRuta = ruta.aviso !== undefined && ahora < ruta.aviso.hasta ? ruta.aviso : undefined
    const destello = avisoRuta !== undefined && ahora < avisoRuta.hasta - 8_000 && vivo.tick % 2 === 0
    const botonDeshacer = avisoRuta?.deshacer !== undefined ? <Button key="deshacer" label={xr().deshacer} onPress={() => void deshacerEleccion($)} /> : null
    // Mientras el modelo o el esfuerzo de este turno no son los tuyos, se ve en la barra.
    const esfuerzoToki = ruta.esfuerzo !== undefined && ruta.turno !== undefined ? ruta.esfuerzo : ruta.pendiente?.esfuerzo
    const partesChip = [ruta.modeloPrincipal !== undefined ? nombreCorto(ruta.modeloPrincipal) : undefined, esfuerzoToki !== undefined ? xr().esfuerzo[esfuerzoToki] : undefined].filter(
      (p): p is string => p !== undefined,
    )
    const chipModelo = partesChip.length > 0 && avisoRuta === undefined ? `${partesChip.join(' · ')} · ${xr().porToki}` : undefined
    const pctTope = tarea.p !== undefined ? porcentaje(tarea.p, actualDe(tarea.p)) : undefined
    const chipTope = pctTope !== undefined ? ({ texto: xp().chip(pctTope), color: pctTope >= 100 ? 'error' : pctTope >= 80 ? 'warning' : 'inactive' } as const) : undefined

    if (esCompacto) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="claude">{mascota}</Text>
          <Text color={colorDePorcentaje(pct)}>ctx {pctTexto}</Text>
          <Text dimColor>·</Text>
          <Text color={colorCache}>
            {x.cache} {cacheTexto}
          </Text>
          <Text dimColor>·</Text>
          <Text color="success">
            ~{formatearTokens(s.tokensAhorrados)} {x.ahorrados}
          </Text>
          {conRacha && <Text color="warning">· 🔥{vivo.racha}</Text>}
          {chipTope !== undefined && <Text color={chipTope.color}>· {chipTope.texto}</Text>}
          {chipModelo !== undefined && <Text dimColor>· {chipModelo}</Text>}
          {avisoRuta !== undefined && (
            <Text color="warning" bold={destello}>
              · {recortar(avisoRuta.texto, Math.max(20, ancho - 70))}
            </Text>
          )}
          {avisoRuta !== undefined && botonDeshacer}
          {avisoRuta === undefined && dicho.tono !== 'normal' && dicho.tono !== 'bien' && <Text color={colorFrase}>· {recortar(dicho.texto, Math.max(20, ancho - 64))}</Text>}
          <Box flexGrow={1} />
          {botonTamano}
          {botonOcultar}
        </Box>
      )
    }

    const anchoBarra = angosto ? 8 : 14
    const grafico = e.surface !== 'terminal'
    // Cada medida es un bloque que no se parte por dentro; la fila los envuelve cuando falta ancho.
    const chip = (clave: string, nodos: RenderNode[]) => (
      <Box key={clave} flexDirection="row" gap={1} flexShrink={0}>
        {nodos}
      </Box>
    )
    const medidas = [
      chip('contexto', [
        <Text dimColor>{x.contexto}</Text>,
        <Text color={colorDePorcentaje(pct)} mono>
          {barra(pct, anchoBarra)} {pctTexto}
          {!angosto && uso !== undefined ? ` ${x.deVentana(formatearTokens(uso.ventana))}` : ''}
        </Text>,
      ]),
      chip('cache', [
        <Text dimColor>· {x.cache}</Text>,
        <Text color={colorCache}>
          {relojCache(cacheRestante, ttl)} {cacheTexto}
        </Text>,
        vivo.pingsEnPausa > 0 ? <Text dimColor>({x.cacheCaliente(vivo.pingsEnPausa)})</Text> : '',
      ]),
      chip('ahorrado', [
        <Text dimColor>· {x.ahorrado}</Text>,
        <Text color="success" bold>
          ~{formatearTokens(s.tokensAhorrados)}
        </Text>,
      ]),
      (s.relecturasEvitadas ?? 0) > 0 && !angosto ? chip('relecturas', [<Text dimColor>· {x.relecturas}</Text>, <Text color="success">~{formatearTokens(s.relecturasEvitadas)}</Text>]) : null,
      conRacha && !angosto ? chip('racha', [<Text color="warning">· {x.rachaCorta(vivo.racha)}</Text>]) : null,
      uso?.cincoHoras !== undefined && !angosto
        ? chip('cinco', [
            <Text dimColor>· {x.cincoHoras}</Text>,
            <Text color={colorDePorcentaje(uso.cincoHoras)}>{Math.round(uso.cincoHoras)}%</Text>,
            guardia.proyeccion.five_hour?.agotaEn !== undefined ? <Text color="warning">{xg().limite.seAcaba(hora(guardia.proyeccion.five_hour.agotaEn, 'five_hour', vivo.idioma))}</Text> : '',
          ])
        : null,
      uso?.semana !== undefined && !angosto
        ? chip('semana', [
            <Text dimColor>· {x.semana}</Text>,
            <Text color={colorDePorcentaje(uso.semana)}>{Math.round(uso.semana)}%</Text>,
            guardia.proyeccion.seven_day?.agotaEn !== undefined ? <Text color="warning">{xg().limite.seAcaba(hora(guardia.proyeccion.seven_day.agotaEn, 'seven_day', vivo.idioma))}</Text> : '',
          ])
        : null,
    ]
    const cabecera = (
      <Box flexDirection="row" gap={1} alignItems="center">
        {!grafico && (
          <Text color="claude" bold>
            {mascota}
          </Text>
        )}
        <Text color="claude" bold>
          Toki
        </Text>
        <Text dimColor>·</Text>
        <Text color={colorFrase} wrap="truncate-end">
          {dicho.texto}
        </Text>
        {dicho.accion === 'compactar' && <Button key="compactar" variant="primary" hotkey="c" label={x.compactarAhora} onPress={() => void $.session.compact({})} />}
        {dicho.accion === 'compactar' && (pct ?? 0) < 70 && (
          <Button
            key="luego"
            plain
            dimColor
            label={x.en30min}
            onPress={() => {
              vivo.silencioPesadoHasta = ahora + 30 * 60_000
              $.ui.invalidate('ui.render')
            }}
          />
        )}
        <Box flexGrow={1} />
        {chipTope !== undefined && <Text color={chipTope.color}>{chipTope.texto}</Text>}
        {chipModelo !== undefined && <Text dimColor>{chipModelo}</Text>}
        {botonTamano}
        {botonOcultar}
      </Box>
    )
    const filaAviso =
      avisoRuta !== undefined ? (
        <Box flexDirection="row" gap={1}>
          <Text color="warning" bold={destello} wrap="truncate-end">
            {avisoRuta.texto}
          </Text>
          {botonDeshacer}
        </Box>
      ) : null
    const filaMedidas = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
        {medidas}
        <Box flexGrow={1} />
        <Button key="detalles" plain dimColor label={verDetalles ? x.menos : x.mas} onPress={() => update($, detalles, v => !v)} />
      </Box>
    )
    const cuerpo = (
      <Box flexDirection="column" flexGrow={1}>
        {cabecera}
        {filaAviso}
        {filaMedidas}
      </Box>
    )
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={destello ? 'warning' : dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : 'claude'} paddingX={1}>
        {grafico
          ? (() => {
              return (
                <Box flexDirection="row" gap={2} alignItems="center">
                  {mascotaGrafica($, e, actividad, 64)}
                  {cuerpo}
                </Box>
              )
            })()
          : cuerpo}
        {verDetalles && (
          <Box flexDirection="row" gap={1}>
            <Text dimColor wrap="wrap">
              {x.sesion} {uso ? formatearDuracion(ahora - uso.inicio, vivo.idioma) : '—'} · {s.llamadas} {x.llamadas} · {s.compactaciones} {x.salidasCompactadas} · {s.bucles} {x.bucles}
              {vivo.aprovechado !== undefined ? ` · ${x.aprovechado(vivo.aprovechado)}` : ''}
              {uso?.costo !== undefined && !uso.esSuscripcion ? ` · $${uso.costo.toFixed(2)}` : ''} · {x.historico} ~{formatearTokens(Number((await $.store.get(CLAVE_TOTAL)) ?? 0))} · /toki
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
