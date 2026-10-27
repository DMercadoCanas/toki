// Toki: tu acompañante de ahorro de tokens para Claude Code. Cada token cuenta.
// Corre dentro de Claude Code como mod: cero instrucciones fijas en el contexto,
// cero dependencias, y si algo falla, Claude sigue trabajando normal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderNode, ResolveInput, ToolCallResult, TurnStepInput, TurnUsage } from 'claude-code'

import type { Sesion } from '../types'
import { ahorroBreve, CENTAVO, cifraUsd, cifraUsdDia, cifraUsdFirmada, COMIENZO_TIPICO, costoClasificador, costoSeccionBreve, costoSinTokiPedido, esPedidoPrevio, estimarAhorroPrevio, factorSalida, leidoSinToki as leidoCacheSinToki, resumenAhorro, SALIDA_BREVE, salidaEvitadaBreve, valorEscritura, valorLectura } from './ahorro'
import type { PedidoPrevio, UsoMedido } from './ahorro'
import { breveActivo, decidirBreve, ID_BREVE, SECCION_BREVE } from './breve'
import type { DecisionBreve } from './breve'
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
import { agregarAlRegistro, agregarLeccion, filasGrafica, fusionarHistorial, hayAhorro, leccionCambioModelo, LOGROS, logrosNuevos, nombreModelo, racha, sumarAlDia, totalDesde } from './historial'
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
  costoMedido,
  decidirRuta,
  diferencia,
  esEsfuerzo,
  ESFUERZOS,
  esfuerzoDeFabrica,
  esfuerzoGuardado,
  etiquetas,
  ETIQUETAS_CLASIFICADOR,
  familiaDe,
  hermano,
  igual,
  leerEsfuerzo,
  leerModo,
  limpiarPrompt,
  modeloCanonico,
  modeloSubagente,
  nivelHeuristico,
  nombreCorto,
  PEDIDOS_PARA_SUBIR,
  PEDIDOS_POR_NIVEL,
  proponer,
  terminaEnPregunta,
  textoDiferencia,
  textosRuta,
  usaEsfuerzoHeredado,
  usd as usdTexto,
} from './modelo'
import type { Decision as DecisionMensaje, Esfuerzo, EstadoRuta, Familia, ModoRuta, Motivo as MotivoRuta, Nivel, Opcion, Propuesta, TextosRuta, TipoOpcion } from './modelo'
import {
  alCompactar,
  contarLimpio,
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
  topeLimpio,
  totalGasto,
} from './gasto'
import type { Gasto, Limpio, Relecturas, Repetida, Temprana, UsoPedido } from './gasto'
import { tokiSvg } from './toki-svg'
import { TRAMO_GENERADO, textosGenerados, tipoGenerado } from './generados'
import { PEGADO, recortarPegado, textosPegado } from './pegados'
import { resumirBusqueda, tipoBusqueda } from './busquedas'
import type { TipoBusqueda } from './busquedas'
import { conAcentos } from './palabras'
import { avisoSemana, CONTEXTO_LARGO, leerSemanas, lunesDe, sumarSemana, tarjetaGuardada, tarjetaNoGuardada, tarjetaPendiente, tarjetaSemana } from './semana'
import type { Delta, Semanas, TipoAhorro } from './semana'
import { formatear as formatearPresupuesto, gastado, leerOrden, marcarAvisado, nuevoPresupuesto, porcentaje, subir, textosPresupuesto, umbralCruzado } from './presupuesto'
import type { Presupuesto, TipoOpcionPresupuesto } from './presupuesto'
import {
  armarPedidoMejorado,
  CONTEXTO_CAMBIO_DE_TEMA,
  CONTEXTO_PARA_LIMPIAR,
  cambioDeTema,
  consejoDe,
  esCorreccion,
  esPedidoGrande,
  evaluarEntrevista,
  FRENOS_ENTREVISTA,
  frenaAntesDePreguntar,
  leerModoEntrevista,
  retomaLoAnterior,
  SALTOS_PARA_CALLAR,
  textosEntrevista,
} from './entrevista'
import type { Consejo, ModoEntrevista, PorQueEntrevistar, TextosEntrevista } from './entrevista'
import { agregarMuestra, claveVentana, DURACION, evaluarCacheFrio, FRIO, hora, opcionesFrio, preguntaFrio, proyectar, textosGuardia, VENTANAS } from './guardia'
import type { Muestra, OpcionLimite, Proyeccion, TextosGuardia, VentanaLimite } from './guardia'

/** Cambia en cada versión: así Claude Code recompila el módulo al recargar. */
export const VERSION = '0.17.3'

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
/** Lo que Toki ahorró desde siempre en dólares a precio de API: recortes, relecturas y modelo (neto). */
const CLAVE_AHORRO_USD = 'ahorroUsdTotal'
/** Lo mismo, día por día. */
const CLAVE_HISTORIAL_USD = 'historialDiarioUsd'
/** Ya se pasó a dólares lo ahorrado antes de medir en dólares (una sola vez). */
const CLAVE_USD_SEMBRADO = 'ahorroUsdSembrado'
/** Cuánto de CLAVE_AHORRO_USD es esa estimación (para decirlo en el panel). */
const CLAVE_USD_ESTIMADO = 'ahorroUsdEstimado'
/** El último pedido del hilo principal y el comienzo medido: el caché que sigue vivo entre sesiones. */
const CLAVE_ULTIMO_PEDIDO = 'ultimoPedido'
const CLAVE_SEMANAS = 'semanas'
const CLAVE_TARJETA = 'tarjetaSemanalMostrada'
/** El valor que Toki puso en la variable, para no confundirlo con uno tuyo. */
const CLAVE_VENTANA = 'ventanaPuestaPorToki'
/** La ventana que Claude Code usaría sin Toki, por modelo. */
const CLAVE_VENTANA_NATIVA = 'ventanaNativa'
/** Ya se avisó (una vez, desde siempre) que Toki pide respuestas breves. */
const CLAVE_AVISO_BREVE = 'avisoBreveDado'
const RANURAS = 40
/** Lo que Claude Code entrega de una salida exitosa sin ayuda: 30 KB. */
const LIMITE_CLAUDE_CODE = 30_000
const HORAS_MAPA_VIGENTE = 24
/** Por debajo de esto, una compactación o un cambio de modelo cuestan poco: Toki no avisa. */
const CONTEXTO_RELEVANTE = 20_000
/** Desde aquí cada mensaje relee mucho: Toki le pide a Claude respuestas más concisas. */
const UMBRAL_CONCISO = 150_000
/** Cuánto menos escribe Claude con respuestas breves, medido, para decirlo: 12. */
const PCT_BREVE = Math.round((1 - SALIDA_BREVE) * 100)

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
  /** Lo ahorrado desde siempre en dólares (neto), como está en el store. */
  totalUsd: number
  /** Lo que Toki sacó del contexto y Claude habría releído en cada pedido. */
  relecturas: Relecturas
  /** Una compactación que Toki adelantó: lo que se ahorra en los pedidos siguientes. */
  temprana?: Temprana
  /** Empezaste en limpio porque Toki lo propuso: lo que se ahorra en los pedidos de la conversación nueva. */
  limpio?: Limpio
  /** Toki propuso empezar en limpio y dijiste que sí: falta que llegue el /clear. */
  limpioPropuesto?: { antes: number; frio: boolean; cuando: number }
  /** Ya se avisó cuánto ahorró empezar en limpio (una vez por conversación nueva). */
  limpioAvisado: boolean
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
  /** El último pedido del hilo principal: contra él se mide el caché que habría tenido tu modelo. */
  pedidoPrevio?: PedidoPrevio
  /** Lo que el caché sirve al empezar de cero (herramientas e instrucciones), medido. */
  prefijoSistema?: number
  /** Recién /clear o compactado: con el pedido anterior solo queda en común el comienzo. */
  trasLimpiar: boolean
  /** Toki mantuvo el caché con pings desde el último pedido. */
  conPings: boolean
  /** El modelo que habría usado sin Toki cada subagente que Toki mandó a otro. */
  familiaSinDeAgente: Map<string, Familia>
  /** Lo medido y aún sin acreditar: lo que costó de verdad (con lo que gasta Toki) y lo que habría costado sin Toki. */
  cuentaRuteo: { real: number; sin: number }
  /** Dólares ahorrados que aún no se sumaron al total y al día (se guardan al terminar cada mensaje). */
  dolaresPendientes: number
  /** Lo que Toki decidió sobre las respuestas breves al armar el último system prompt (sin decidir: el motor no lo deja tocar). */
  breve?: DecisionBreve
  /** Lo que las respuestas breves ahorraron en el mensaje en curso, aún sin acreditar: dólares y tokens de salida. */
  cuentaBreve: { usd: number; tokens: number }
  /** Ya se miró si había que avisar de las respuestas breves (el aviso es uno solo, desde siempre). */
  breveAvisado: boolean
  /** La sección ya se mandó en un pedido del hilo principal: desde ahí está en el caché. */
  breveEnCache: boolean
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
  totalUsd: 0,
  relecturas: RELECTURAS_VACIAS,
  limpioAvisado: false,
  contextoMax: 0,
  repetidas: {},
  trasLimpiar: false,
  conPings: false,
  familiaSinDeAgente: new Map<string, Familia>(),
  cuentaRuteo: { real: 0, sin: 0 },
  dolaresPendientes: 0,
  cuentaBreve: { usd: 0, tokens: 0 },
  breveAvisado: false,
  breveEnCache: false,
}

/** Toki en pixel art, animado dentro del SVG (fuera de la terminal). */
function mascotaGrafica($: $, e: ResolveInput, actividad: Actividad, tamano: number): RenderElement | '' {
  if (e.surface === 'terminal') return ''
  const { Svg } = $.ui.resolve(e)
  // Una superficie que no dibuja SVG (una extensión vieja) muestra el alt: la carita, no una frase.
  return <Svg source={tokiSvg(actividad)} alt={cuadro(actividad, 0)} width={tamano} height={tamano} />
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

/** Para medir: suscripción (o aún sin cifras), 1 h; API, 5 min. */
function ttl1hSesion(): boolean {
  return vivo.usoCache?.esSuscripcion ?? true
}

function ttlMs(): number {
  return (ttl1hSesion() ? 60 : 5) * 60_000
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

async function leerHistorialUsd($: $): Promise<Historial> {
  const guardado = await $.store.get(CLAVE_HISTORIAL_USD)
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

/**
 * Antes de 0.17 el ahorro se guardaba solo en tokens: la primera vez se pasa a
 * dólares (recortes y relecturas a precio de Sonnet, lo más barato) para que el
 * histórico no empiece en cero. Una sola vez; lo estimado se dice en el panel.
 */
async function sembrarAhorroUsd($: $): Promise<void> {
  try {
    if ((await $.store.get(CLAVE_USD_SEMBRADO)) === true) return
    await $.store.set(CLAVE_USD_SEMBRADO, true)
    const tokens = await leerHistorial($)
    const usdDias = await leerHistorialUsd($)
    // Desde el primer día con dólares ya se midió todo: solo cuenta lo anterior.
    const primerDiaUsd = Object.keys(usdDias).sort()[0]
    const antes = (d: string) => primerDiaUsd === undefined || d < primerDiaUsd
    const desdeUsd = Object.entries(tokens)
      .filter(([d, n]) => !antes(d) && typeof n === 'number' && Number.isFinite(n))
      .reduce((suma, [, n]) => suma + n, 0)
    const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
    const recortados = Math.max(0, (Number.isFinite(total) ? total : 0) - desdeUsd)
    // Las relecturas no se guardan por día: solo si nunca se midió en dólares.
    const relecturas = primerDiaUsd === undefined ? Number((await $.store.get(CLAVE_RELECTURAS)) ?? 0) : 0
    const estimado = estimarAhorroPrevio(recortados, relecturas)
    if (!(estimado >= CENTAVO)) return
    let dias: Historial = { ...usdDias }
    for (const [d, n] of Object.entries(tokens)) {
      if (antes(d) && typeof n === 'number' && Number.isFinite(n) && n > 0) dias = { ...dias, [d]: (dias[d] ?? 0) + estimarAhorroPrevio(n, 0) }
    }
    const previo = Number((await $.store.get(CLAVE_AHORRO_USD)) ?? 0)
    await $.store.set(CLAVE_AHORRO_USD, (Number.isFinite(previo) ? previo : 0) + estimado)
    await $.store.set(CLAVE_HISTORIAL_USD, dias)
    await $.store.set(CLAVE_USD_ESTIMADO, estimado)
    $.ui.log(`ahorro en dólares: ${estimado.toFixed(4)} estimados de antes de 0.17`, { to: 'debug' })
  } catch {
    // Sin store: se empieza a contar en dólares desde ahora.
  }
}

/** Días seguidos con algún ahorro, en tokens o en dólares. */
async function rachaDe($: $, ahora: number): Promise<number> {
  return racha(hayAhorro(await leerHistorial($), await leerHistorialUsd($)), ahora)
}

/** Lo ahorrado desde siempre, para decirlo: en dólares si llega a un centavo, si no en tokens. */
function totalAhorrado(): string | undefined {
  if (vivo.totalUsd >= 0.01) return cifraUsd(vivo.totalUsd)
  return vivo.total > 0 ? `~${formatearTokens(vivo.total)} tokens` : undefined
}

/** Revisa si hay logros nuevos y los celebra. Devuelve los recién desbloqueados. */
async function revisarLogros($: $, extra: { memoria?: boolean; rescate?: boolean } = {}): Promise<Logro[]> {
  try {
    const ahora = await $.clock.now()
    const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
    const usd = Number((await $.store.get(CLAVE_AHORRO_USD)) ?? 0)
    const rachaActual = await rachaDe($, ahora)
    vivo.total = Number.isFinite(total) ? total : 0
    vivo.totalUsd = Number.isFinite(usd) ? usd : 0
    vivo.racha = rachaActual
    const ya = await leerLogros($)
    const nuevos = logrosNuevos(ya, { total: vivo.total, usd: vivo.totalUsd, racha: rachaActual, ...extra })
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

/**
 * Lo que Toki recortó de una salida o un pegado (`agente`: el subagente que la
 * recibió; ninguno en el hilo principal). En dólares vale lo que no se escribió
 * en el caché del modelo que la habría leído sin Toki.
 */
async function sumarAhorro($: $, caracteres: number, comando: string, agente: string | undefined, tipo: TipoAhorro = 'salida'): Promise<void> {
  const tokens = tokensAprox(caracteres)
  const principal = agente === undefined
  // Un subagente, a precio de 5 min: no se sabe cuánto dura su caché, y así no se infla.
  const usd = tokens > 0 ? valorEscritura(tokens, familiaSin(agente), principal && ttl1hSesion(), principal ? (vivo.contextoPedido ?? 0) : 0) : 0
  if (tokens > 0) await alaSemana($, { tipo, ahorro: tokens, ahorroUsd: usd })
  await update($, sesion, s => ({ ...s, tokensAhorrados: s.tokensAhorrados + tokens, compactaciones: s.compactaciones + 1, recorteUsd: (s.recorteUsd ?? 0) + usd }))
  if (tokens <= 0) return
  vivo.dolaresPendientes += usd
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

/**
 * Relecturas evitadas: en la sesión y en el histórico, en tokens y en dólares (a
 * precio de lectura del modelo que las habría releído sin Toki). Puede ser
 * negativo (lo que cuesta compactar).
 */
async function sumarRelecturas($: $, tokens: number, familia: Familia): Promise<void> {
  if (tokens === 0) return
  const usd = valorLectura(tokens, familia, vivo.contextoPedido ?? 0)
  vivo.dolaresPendientes += usd
  await update($, sesion, s => ({ ...s, relecturasEvitadas: (s.relecturasEvitadas ?? 0) + tokens, relecturasUsd: (s.relecturasUsd ?? 0) + usd }))
  const total = Number((await $.store.get(CLAVE_RELECTURAS)) ?? 0)
  await $.store.set(CLAVE_RELECTURAS, total + tokens)
  await alaSemana($, { relecturas: tokens, ahorroUsd: usd })
}

/**
 * Empezar en limpio cuando Toki lo propuso: la conversación de antes que este
 * pedido ya no releyó (`relecturas`) o no reescribió (`reescritura`, con el caché
 * vencido), a precio del modelo que la habría leído sin Toki y con el tamaño que
 * habría tenido el pedido (`contexto`). El primero que cuenta se avisa.
 */
async function sumarLimpio($: $, relecturas: number, reescritura: number, familia: Familia, contexto: number): Promise<void> {
  const tokens = relecturas + reescritura
  if (tokens <= 0) return
  const usd = valorLectura(relecturas, familia, contexto) + valorEscritura(reescritura, familia, ttl1hSesion(), contexto)
  vivo.dolaresPendientes += usd
  await update($, sesion, s => ({ ...s, limpioUsd: (s.limpioUsd ?? 0) + usd, limpioTokens: (s.limpioTokens ?? 0) + tokens }))
  const total = Number((await $.store.get(CLAVE_RELECTURAS)) ?? 0)
  await $.store.set(CLAVE_RELECTURAS, total + tokens)
  await alaSemana($, { relecturas: tokens, ahorroUsd: usd })
  if (vivo.limpioAvisado) return
  vivo.limpioAvisado = true
  $.ui.toast(tx().toastLimpio(cifraUsd(usd), formatearTokens(tokens), reescritura > 0), { timeoutMs: 9_000 })
}

/**
 * Lo que movieron el modelo y el esfuerzo de un mensaje, medido: lo que ahorró va
 * al ahorro (sesión, semana y total); lo que costó de más, aparte.
 */
async function sumarRuteo($: $, usd: number): Promise<void> {
  if (!Number.isFinite(usd) || Math.abs(usd) < 1e-6) return
  vivo.dolaresPendientes += usd
  if (usd > 0) {
    await update($, sesion, s => ({ ...s, ruteoAhorroUsd: (s.ruteoAhorroUsd ?? 0) + usd }))
    await alaSemana($, { ruteo: usd })
  } else {
    await update($, sesion, s => ({ ...s, ruteoExtraUsd: (s.ruteoExtraUsd ?? 0) - usd }))
    await alaSemana($, { ruteoExtra: -usd })
  }
}

/**
 * Lo que vale la salida que Claude no escribió por las respuestas breves
 * (estimado con lo medido): a la sesión, la semana y el total.
 */
async function sumarBreve($: $, usd: number, tokens: number): Promise<void> {
  if (!Number.isFinite(usd) || usd <= 0) return
  vivo.dolaresPendientes += usd
  await update($, sesion, s => ({ ...s, breveUsd: (s.breveUsd ?? 0) + usd, breveTokens: Math.round((s.breveTokens ?? 0) + Math.max(0, tokens)) }))
  await alaSemana($, { ahorroUsd: usd, breve: usd })
}

/** La primera vez (desde siempre) que Toki pide respuestas breves, lo dice: qué hace, cuánto ahorra y cómo apagarlo. */
async function avisarBreve($: $): Promise<void> {
  if (vivo.breveAvisado) return
  vivo.breveAvisado = true
  try {
    if ((await $.store.get(CLAVE_AVISO_BREVE)) === true) return
    await $.store.set(CLAVE_AVISO_BREVE, true)
    $.ui.toast(tx().toastBreve(PCT_BREVE), { timeoutMs: 10_000 })
  } catch {
    // Sin store: no se avisa, para no repetirlo en cada sesión.
  }
}

/** La familia que habría hecho este trabajo sin Toki: la de tu modelo o la que habría tenido el subagente. */
function familiaSin(agente: string | undefined): Familia {
  const delAgente = agente === undefined ? undefined : vivo.familiaSinDeAgente.get(agente)
  return delAgente ?? familiaDe(vivo.modelo) ?? vivo.pedidoPrevio?.sin ?? 'opus'
}

/** El modelo que habría usado un subagente sin Toki (los más viejos se olvidan). */
function recordarAgente(id: string, familia: Familia): void {
  vivo.familiaSinDeAgente.set(id, familia)
  if (vivo.familiaSinDeAgente.size <= 200) return
  const primero = vivo.familiaSinDeAgente.keys().next().value
  if (primero !== undefined) vivo.familiaSinDeAgente.delete(primero)
}

/** La familia que habría respondido este pedido sin Toki. */
function familiaSinDelPedido(e: TurnStepInput, u: TurnUsage): Familia {
  const real = familiaDe(u.model) ?? familiaDe(e.model) ?? 'opus'
  if (e.agentId === undefined) return familiaDe(e.model) ?? real
  const sin = vivo.familiaSinDeAgente.get(e.agentId)
  if (sin !== undefined) return sin
  // Un subagente que Toki no tocó (o una tarea interna de Claude Code): sin Toki, lo mismo.
  recordarAgente(e.agentId, real)
  return real
}

/** Suma a lo medido del mensaje en curso. */
function sumarCuenta(real: number, sin: number): void {
  if (!Number.isFinite(real) || !Number.isFinite(sin)) return
  vivo.cuentaRuteo = { real: vivo.cuentaRuteo.real + real, sin: vivo.cuentaRuteo.sin + sin }
}

/** Las cifras de uso de un `$.model.*`, si las trae. */
function usoDe(r: unknown): UsoMedido | undefined {
  const u = (r as { usage?: Record<string, unknown> | null } | null)?.usage
  if (u === undefined || u === null) return undefined
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return { entrada: n(u['input_tokens']), leido: n(u['cache_read_input_tokens']), escrito: n(u['cache_creation_input_tokens']), salida: n(u['output_tokens']) }
}

/**
 * Cada pedido contra el mismo pedido sin Toki: tu modelo, tu esfuerzo y el caché
 * que tu modelo habría tenido. Va a la cuenta del mensaje, que se acredita al terminarlo.
 */
function medirPedido(e: TurnStepInput, pedido: TurnStepInput, u: TurnUsage, sin: Familia, ahora: number): { real: number; sin: number } {
  const familia = familiaDe(u.model) ?? familiaDe(pedido.model) ?? 'opus'
  const uso: UsoMedido = { entrada: u.input_tokens, leido: u.cache_read_input_tokens, escrito: u.cache_creation_input_tokens, salida: u.output_tokens }
  if (e.agentId !== undefined) {
    // Un subagente empieza de cero con o sin Toki: mismo caché, otro modelo. A precio de 5 min, para no inflar.
    const c = { real: costoMedido(familia, uso, false), sin: costoSinTokiPedido({ familia: sin, uso, ttl1h: false }) }
    sumarCuenta(c.real, c.sin)
    return c
  }
  const p = vivo.pedidoPrevio
  const tamano = uso.entrada + uso.leido + uso.escrito
  const ttl1h = ttl1hSesion()
  // Tras /clear o compactar (o al empezar otra conversación) solo queda en común el comienzo.
  const limpio = p !== undefined && ((vivo.trasLimpiar && tamano < p.tamano) || (p.tamano >= CONTEXTO_RELEVANTE && tamano < p.tamano * 0.5))
  const leido = leidoCacheSinToki({
    previo: p,
    familia,
    sin,
    leido: uso.leido,
    cacheable: uso.leido + uso.escrito,
    ahora,
    ttlMs: ttlMs(),
    trasLimpiar: limpio,
    comienzo: vivo.prefijoSistema ?? COMIENZO_TIPICO,
    conPings: vivo.conPings,
  })
  const fSalida = factorSalida(e.effort, pedido.effort)
  const c = { real: costoMedido(familia, uso, ttl1h), sin: costoSinTokiPedido({ familia: sin, uso, ttl1h, factorSalida: fSalida, leido }) }
  sumarCuenta(c.real, c.sin)
  // Con respuestas breves, la salida que Claude no escribió (en tu modelo y con tu esfuerzo habría sido más),
  // menos lo que costó mandar la sección: leída del caché, o escrita si el pedido reescribió la conversación.
  if (breveActivo(vivo.breve)) {
    const escrita = !vivo.breveEnCache || uso.escrito > uso.leido
    vivo.breveEnCache = true
    const usd = ahorroBreve(uso.salida, sin, tamano, fSalida) - costoSeccionBreve(familia, escrita, ttl1h, tamano)
    vivo.cuentaBreve = { usd: vivo.cuentaBreve.usd + usd, tokens: vivo.cuentaBreve.tokens + salidaEvitadaBreve(uso.salida, fSalida) }
  }
  // El primer pedido tras limpiar, en el mismo modelo: lo que lee del caché es el comienzo.
  if (limpio && p !== undefined && p.familia === familia && uso.leido > 0) vivo.prefijoSistema = uso.leido
  vivo.pedidoPrevio = { familia, sin, tamano, cuando: ahora }
  vivo.trasLimpiar = false
  vivo.conPings = false
  // Desde aquí la conversación está en el caché de este modelo.
  ruta.soloComienzo = false
  ruta.alIniciar = false
  return c
}

/**
 * Al terminar cada mensaje (y al cerrar la sesión): lo que costó de verdad contra
 * lo que habría costado sin Toki va al ahorro por modelo (o a lo que costó de más),
 * y el ahorro en dólares pendiente, al total y al día. Nunca falla: es estadística.
 */
async function acreditar($: $): Promise<void> {
  const { real, sin } = vivo.cuentaRuteo
  vivo.cuentaRuteo = { real: 0, sin: 0 }
  const breve = vivo.cuentaBreve
  // Si mandar la sección costó más que lo que ahorró (respuestas de una palabra), la cuenta sigue en el próximo.
  vivo.cuentaBreve = breve.usd < 0 ? breve : { usd: 0, tokens: 0 }
  try {
    if (real > 0) {
      await update($, sesion, s => ({ ...s, gastoMedidoUsd: (s.gastoMedidoUsd ?? 0) + real }))
      await alaSemana($, { gastoUsd: real })
    }
    await sumarRuteo($, sin - real)
  } catch {
    // Sin cifras esta vez.
  }
  try {
    await sumarBreve($, breve.usd, breve.tokens)
  } catch {
    // Sin cifras esta vez.
  }
  const pendientes = vivo.dolaresPendientes
  vivo.dolaresPendientes = 0
  if (pendientes === 0 || !Number.isFinite(pendientes)) return
  try {
    const total = Number((await $.store.get(CLAVE_AHORRO_USD)) ?? 0)
    const nuevo = (Number.isFinite(total) ? total : 0) + pendientes
    await $.store.set(CLAVE_AHORRO_USD, nuevo)
    await $.store.set(CLAVE_HISTORIAL_USD, sumarAlDia(await leerHistorialUsd($), await $.clock.now(), pendientes))
    vivo.totalUsd = nuevo
    // El primer ahorro también puede ser en dólares (un mensaje a un modelo más barato).
    if (pendientes > 0) await revisarLogros($)
  } catch {
    // Sin store: la cifra de la sesión sigue en la barra.
  }
}

/** El último pedido, para la próxima sesión: si su caché sigue vivo, cambiar de modelo al empezar cuesta. */
async function guardarUltimoPedido($: $): Promise<void> {
  if (vivo.pedidoPrevio === undefined) return
  try {
    await $.store.set(CLAVE_ULTIMO_PEDIDO, { ...vivo.pedidoPrevio, prefijo: vivo.prefijoSistema })
  } catch {
    // La próxima sesión mide desde su primer pedido.
  }
}

/** Cada pedido al modelo: lo que costó de verdad y lo que Toki evitó que se releyera (`familia`: la que lo habría hecho sin Toki). */
async function alPedido($: $, subagente: boolean, u: UsoPedido, familia: Familia): Promise<void> {
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
  await sumarRelecturas($, c.evitadas + tt.evitadas, familia)
  // Llegó un pedido sin el /clear que Toki propuso: ya no se cuenta.
  vivo.limpioPropuesto = undefined
  if (vivo.limpio === undefined) return
  const l = contarLimpio(vivo.limpio, contexto)
  if (l.l === undefined) {
    await terminarLimpio($, 'la conversación nueva ya pesa como la de antes, o la de antes ya se habría compactado')
    return
  }
  vivo.limpio = l.l
  await sumarLimpio($, l.relecturas, l.reescritura, familia, l.sinToki)
}

/** La ventana se recalcula en varios momentos: al registro solo llega cuando cambia. */
let ultimaVentana = ''
function anotarVentana($: $, linea: string): void {
  if (linea === ultimaVentana) return
  ultimaVentana = linea
  void anotarDiagnostico($, linea)
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
        // Aún sin desglose, o la variable es de Toki y no quedó guardada la nativa:
        // se reintenta al empezar el próximo turno. Se muestra a cuánto compacta, no el millón del modelo.
        vivo.ventana = b?.rawMaxTokens ?? ctx.window
        vivo.ventanaFuente = undefined
      } else {
        vivo.ventana = b?.rawMaxTokens ?? ctx.window
        vivo.ventanaNativa = nativa ?? vivo.ventana
        vivo.ventanaFuente = decision.motivo === 'tuya' ? 'tuya' : esDeToki ? 'toki' : 'nativa'
      }
      anotarVentana($, `ventana: ${decision.motivo}, compacta a ${vivo.ventana} (nativa ${vivo.ventanaNativa})`)
      return
    }
    const r = await $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', String(decision.poner))
    if (r.deny !== undefined) {
      vivo.ventana = b?.rawMaxTokens ?? ctx.window
      vivo.ventanaNativa = vivo.ventana
      vivo.ventanaFuente = 'nativa'
      anotarVentana($, `ventana: no se pudo poner (${r.deny})`)
      return
    }
    await $.store.set(CLAVE_VENTANA, String(decision.poner))
    if (!esDeToki && nativa !== undefined) await $.store.set(claveNativa, nativa)
    // Claude Code la limita a la ventana del modelo: se lee la que quedó de verdad.
    const efectiva = (await leer()).breakdown?.rawMaxTokens ?? decision.poner
    vivo.ventana = efectiva
    vivo.ventanaNativa = nativa ?? efectiva
    vivo.ventanaFuente = efectiva === decision.poner && (nativa ?? 0) > efectiva ? 'toki' : 'nativa'
    anotarVentana($, `ventana: compacta a ${efectiva} (Claude Code: ${nativa ?? '?'})`)
    // El aviso, una sola vez por valor: no en cada sesión.
    const claveAviso = `ventanaAvisada:${efectiva}`
    if (avisar && !esDeToki && vivo.ventanaFuente === 'toki' && (await $.store.get(claveAviso)) !== true) {
      await $.store.set(claveAviso, true)
      $.ui.toast(tx().toastVentana(formatearTokens(efectiva), formatearTokens(vivo.ventanaNativa)), { timeoutMs: 9000 })
    }
  } catch (err) {
    anotarVentana($, `ventana: sin cambios (${String(err)})`)
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
  await sumarAhorro($, ahorrado, comando, agente, 'repetida')
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
  // Tras compactar, del caché solo sigue sirviendo el comienzo: cambiar de modelo ahí cuesta solo eso.
  vivo.trasLimpiar = true
  ruta.soloComienzo = true
  vivo.tokensVistos = undefined
  // Lo de antes ya no está en el contexto: no hay relecturas que evitar ni salidas que repetir.
  const antes = vivo.contextoMax
  vivo.contextoMax = 0
  vivo.relecturas = alCompactar()
  vivo.repetidas = {}
  vivo.temprana = undefined
  // Compactada la conversación nueva, deja de contarse contra la de antes (lo que siga, si acaso, es de la compactación).
  await terminarLimpio($, 'se compactó la conversación nueva')
  // ¿La adelantó la ventana de Toki? Claude Code no habría compactado hasta la nativa.
  if (vivo.ventanaFuente === 'toki' && vivo.ventana !== undefined && vivo.ventanaNativa !== undefined && antes >= vivo.ventana * 0.7 && antes < vivo.ventanaNativa * 0.9) {
    const inicio = iniciarTemprana(antes, vivo.ventanaNativa)
    vivo.temprana = inicio.t
    await sumarRelecturas($, inicio.evitadas, familiaSin(undefined))
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
  elegisteModelo(modelo)
  // Otro modelo, otra ventana: se vuelve a calcular a cuánto compacta.
  await ajustarVentana($, false)
  await avisarCambioModelo($, anterior, modelo, vivo.tokensUltimoTurno, undefined)
}

/**
 * Elegiste modelo (/model): manda el tuyo desde el próximo pedido. Sonnet primero
 * sigue si elegiste Sonnet; con otro, espera hasta /toki-sonnet sí.
 */
function elegisteModelo(modelo: string): void {
  ruta.modeloPrincipal = undefined
  if (ruta.sonnetPrimero) ruta.sonnetPausado = familiaDe(modelo) !== 'sonnet'
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
    // Lo que cuesta el ping lo paga el ahorro de Toki: va como gasto real.
    const usoPing = usoDe(r)
    if (usoPing !== undefined) sumarCuenta(costoMedido(vivo.pedidoPrevio?.familia ?? familiaDe(vivo.modelo) ?? 'opus', usoPing, ttl1hSesion()), 0)
    const { sirvio, leidos } = evaluarPing(r)
    if (!sirvio) {
      // El caché ya estaba frío o no había nada que reusar: se para hasta tu próximo mensaje.
      vivo.apagadoEnPausa = true
      $.ui.log(`mantener caché: se detiene (${r.isAnswered ? 'sin lectura de caché' : r.reason})`, { to: 'debug' })
      return
    }
    vivo.pingsEnPausa += 1
    vivo.pingsTotales += 1
    vivo.conPings = true
    vivo.tokensLeidosPing += leidos
    vivo.ultimoUsoCache = await $.clock.now()
    $.ui.invalidate('ui.render')
  } catch {
    vivo.apagadoEnPausa = true
  } finally {
    vivo.pingEnCurso = false
  }
}

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

/**
 * Un registro de lo que hace Toki: qué dibuja la superficie y qué decidió con cada
 * mensaje (nunca su texto). Sigue entre sesiones, hasta LINEAS_DIAGNOSTICO líneas:
 * sirve para saber por qué no se ve y para calibrar las decisiones con uso real.
 * Las escrituras van en fila para que dos avisos seguidos no se pisen.
 */
let filaDiagnostico: Promise<void> = Promise.resolve()
async function anotarDiagnostico($: $, linea: string): Promise<void> {
  filaDiagnostico = filaDiagnostico.then(async () => {
    try {
      const nueva = `${new Date(await $.clock.now()).toISOString()} ${linea}`
      await asegurarCarpeta($)
      const archivo = `${CARPETA}/diagnostico.txt`
      const previo = (await $.fs.exists(archivo)) ? await $.fs.read(archivo) : ''
      await $.fs.write(archivo, agregarAlRegistro(previo, nueva))
    } catch {
      // Sin diagnóstico no pasa nada.
    }
  })
  return filaDiagnostico
}

/** Cada 5 s: cifras del contexto (y compactaciones a mitad de turno) y el modelo. */
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
async function compactarFallo($: $, comando: string, texto: string, captura: Captura | undefined, agente: string | undefined): Promise<string | undefined> {
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
  await sumarAhorro($, ahorrado, comando, agente)
  anotar(comando, 'compactado', tx().detalleCompactado(kb(c.caracteresAntes), kb(c.caracteresDespues), copia.existe), tokensAprox(ahorrado))
  registrarSalidaGrande($, cuerpo.length)
  return [salida?.[1], encabezado(c, ruta, copia.existe, tokensAprox(ahorrado), idioma), c.texto].filter(Boolean).join('\n')
}

/** Un comando que terminó bien. Devuelve el stdout y stderr nuevos, o nada si se deja igual. */
async function compactarExito($: $, comando: string, r: SalidaShell, captura: Captura | undefined, agente: string | undefined): Promise<{ stdout: string; stderr: string } | undefined> {
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
  await sumarAhorro($, ahorrado, comando, agente)
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
  agente: string | undefined,
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
  await sumarAhorro($, ahorrado, comando, agente, 'busqueda')
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
  /** La cifra única: neto en dólares a precio de API, cuánto costó y cuánto habría costado sin Toki. */
  ahorro: ReturnType<typeof resumenAhorro>
  /** Lo ahorrado en dólares (neto) hoy, en 7 y 30 días y desde siempre. */
  hoyUsd: number
  semanaUsd: number
  mesUsd: number
  totalUsd: number
  /** Del total en dólares, lo estimado de antes de 0.17. */
  estimadoUsd: number
  /** De dónde sale el ahorro de la sesión. */
  desglose: string[]
  suscripcion: boolean
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

/** Si Toki no ahorró nada pero la sesión gastó bastante, explica dónde se fue. */
function explicarCero(x: Textos, s: Sesion, g: Gasto): string | undefined {
  const hubo = s.tokensAhorrados > 0 || Math.abs(resumenAhorro(s).neto) >= CENTAVO || (s.ruteoAhorroUsd ?? 0) + (s.ruteoExtraUsd ?? 0) >= CENTAVO
  if (hubo || totalGasto(g) < 100_000) return undefined
  return x.porQueCero(formatearTokens(g.cacheLeido), porcentajeRelectura(g))
}

/** "~290.0k", "−290.0k" (lo que costó compactar, antes de recuperarlo). */
function tokensFirmados(n: number): string {
  return n < 0 ? `−${formatearTokens(-n)}` : formatearTokens(n)
}

/** De dónde sale el ahorro de la sesión: cada fuente en dólares, y lo que costó contra lo que habría costado. */
function lineasDesglose(x: Textos, s: Sesion): string[] {
  const lineas: string[] = []
  const relecturas = s.relecturasUsd ?? 0
  if (Math.abs(relecturas) >= CENTAVO) {
    lineas.push(relecturas > 0 ? x.desgloseRelecturas(cifraUsd(relecturas), tokensFirmados(s.relecturasEvitadas ?? 0)) : x.desgloseCompactar(cifraUsdFirmada(relecturas)))
  }
  if ((s.limpioUsd ?? 0) >= CENTAVO) lineas.push(x.desgloseLimpio(cifraUsd(s.limpioUsd ?? 0), formatearTokens(s.limpioTokens ?? 0)))
  if ((s.breveUsd ?? 0) >= CENTAVO) lineas.push(x.desgloseBreve(cifraUsd(s.breveUsd ?? 0), formatearTokens(s.breveTokens ?? 0), PCT_BREVE))
  if ((s.recorteUsd ?? 0) >= CENTAVO) lineas.push(x.desgloseRecorte(cifraUsd(s.recorteUsd ?? 0), formatearTokens(s.tokensAhorrados)))
  const a = s.ruteoAhorroUsd ?? 0
  const e = s.ruteoExtraUsd ?? 0
  if (a >= CENTAVO || e >= CENTAVO) lineas.push(x.desgloseRuteo(cifraUsdFirmada(a - e), a >= CENTAVO ? cifraUsd(a) : undefined, e >= CENTAVO ? cifraUsd(e) : undefined))
  const r = resumenAhorro(s)
  if (r.gastado >= CENTAVO) lineas.push(x.desgloseCosto(cifraUsd(r.gastado), cifraUsd(r.sinToki)))
  return lineas
}

/** Lo de la sesión para la cabecera: en dólares si llega a un centavo, si no en tokens; si costó de más, lo dice. */
function cifraSesion(x: Textos, s: Sesion): string {
  const r = resumenAhorro(s)
  if (r.neto <= -CENTAVO) return x.costoDeMasSesion(cifraUsd(-r.neto))
  if (r.neto >= 0.01) return x.ahorroSesion(cifraUsd(r.neto), r.pct)
  return x.ahorroSesion(s.tokensAhorrados > 0 ? `~${formatearTokens(s.tokensAhorrados)} tokens` : cifraUsd(r.neto), undefined)
}

/**
 * La cifra de la barra: lo ahorrado en la sesión en dólares, con el "−18 %";
 * en tokens si aún no llega a un centavo; si en neto costó de más, lo dice.
 */
function chipAhorro(x: Textos, s: Sesion, angosto = false): { etiqueta: string; valor: string; color: 'success' | 'warning' } {
  const r = resumenAhorro(s)
  if (r.neto <= -CENTAVO) return { etiqueta: x.costoDeMas, valor: cifraUsd(-r.neto), color: 'warning' }
  if (r.neto >= 0.01) return { etiqueta: x.ahorrado, valor: `${cifraUsd(r.neto)}${r.pct !== undefined && !angosto ? ` ${x.menosPct(r.pct)}` : ''}`, color: 'success' }
  return { etiqueta: x.ahorrado, valor: s.tokensAhorrados > 0 ? `~${formatearTokens(s.tokensAhorrados)} tokens` : cifraUsd(r.neto), color: 'success' }
}

/** Las notas bajo la cifra: de dónde salen los dólares y lo estimado de antes de 0.17. */
function notasAhorro(x: Textos, r: Pick<Reporte, 'ahorro' | 'suscripcion' | 'estimadoUsd' | 'totalUsd' | 'sesion'>): string[] {
  const notas: string[] = []
  const breve = (r.sesion.breveUsd ?? 0) >= CENTAVO ? PCT_BREVE : undefined
  if (Math.abs(r.ahorro.neto) >= CENTAVO || r.ahorro.gastado >= CENTAVO || r.totalUsd >= CENTAVO) notas.push(x.aPrecioApi(r.suscripcion, breve))
  if (r.estimadoUsd >= CENTAVO) notas.push(x.estimadoPrevio(cifraUsd(r.estimadoUsd)))
  return notas
}

async function reporte($: $, anchoBarra = 24): Promise<Reporte> {
  const x = tx()
  const s = await read($, sesion)
  const ahora = await $.clock.now()
  const historial = await leerHistorial($)
  const historialUsd = await leerHistorialUsd($)
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  const totalUsd = Number((await $.store.get(CLAVE_AHORRO_USD)) ?? 0)
  const estimadoUsd = Number((await $.store.get(CLAVE_USD_ESTIMADO)) ?? 0)
  // Lo de este mensaje que aún no se acreditó ya está en la sesión: también va en el día y el total.
  const pendiente = Number.isFinite(vivo.dolaresPendientes) ? vivo.dolaresPendientes : 0
  const r: Reporte = {
    sesion: s,
    total,
    hoy: totalDesde(historial, ahora, 1),
    semana: totalDesde(historial, ahora, 7),
    mes: totalDesde(historial, ahora, 30),
    ahorro: resumenAhorro(s),
    hoyUsd: totalDesde(historialUsd, ahora, 1) + pendiente,
    semanaUsd: totalDesde(historialUsd, ahora, 7) + pendiente,
    mesUsd: totalDesde(historialUsd, ahora, 30) + pendiente,
    totalUsd: (Number.isFinite(totalUsd) ? totalUsd : 0) + pendiente,
    estimadoUsd: Number.isFinite(estimadoUsd) ? estimadoUsd : 0,
    desglose: lineasDesglose(x, s),
    suscripcion: vivo.usoCache?.esSuscripcion === true,
    racha: racha(hayAhorro(historial, historialUsd), ahora),
    logros: await leerLogros($),
    grafica: filasGrafica(pendiente === 0 ? historialUsd : sumarAlDia(historialUsd, ahora, pendiente), ahora, 14, anchoBarra, vivo.idioma, cifraUsdDia),
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
    if (r.contexto.esSuscripcion) r.suscripcion = true
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
  // Con respuestas breves ya puestas (o con un estilo tuyo) el consejo sobra.
  if (!breveActivo(vivo.breve) && vivo.breve !== 'tuyo') r.sugerencias.push(x.sugConciso)
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
  pie.push('', ...textoRuta(xr(), s))
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
    x.reporteCabecera(cifraSesion(x, r.sesion), cifraUsdFirmada(r.hoyUsd), cifraUsdFirmada(r.semanaUsd), cifraUsdFirmada(r.totalUsd)),
    ...notasAhorro(x, r),
  ]
  if (r.desglose.length > 0) {
    lineas.push('', `${x.desgloseTitulo}:`)
    for (const l of r.desglose) lineas.push(`  ${l}`)
    lineas.push('')
  }
  lineas.push(
    x.resumenSesion(r.sesion.compactaciones, r.sesion.llamadas, r.sesion.bucles),
    r.racha > 0 ? x.rachaDias(r.racha) : x.rachaNinguna,
    `${x.logros}: ${lineaLogros(x, r.logros)}`,
  )
  if (r.contexto) {
    lineas.push(x.contextoLinea(r.contexto.pct === undefined ? x.sinDatos : `${r.contexto.pct}% ${x.usado}`, formatearTokens(r.contexto.ventana)))
  }
  if (vivo.pingsTotales > 0) lineas.push(x.cacheMantenido(vivo.pingsTotales, formatearTokens(vivo.tokensLeidosPing)))
  const cuentas = lineasGasto(x, r.gasto)
  // Las relecturas ya están en el desglose, en dólares; sin desglose van aquí, en tokens.
  if ((r.sesion.relecturasEvitadas ?? 0) > 0 && r.desglose.length === 0) cuentas.push(x.relecturasLinea(formatearTokens(r.sesion.relecturasEvitadas)))
  if (r.ventanaTexto !== undefined) cuentas.push(r.ventanaTexto)
  if (r.porQueCero !== undefined) cuentas.push(r.porQueCero)
  if (cuentas.length > 0) {
    lineas.push('', `${x.gastoTitulo}:`)
    for (const l of cuentas) lineas.push(`  ${l}`)
  }
  // El balance del modelo ya está en el desglose.
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
  vivo.limpio = undefined
  vivo.repetidas = {}
}

// ---------- Modelo y esfuerzo por mensaje ----------

type Eleccion = { modelo: string; esfuerzo: Esfuerzo }
type DecisionRuta = {
  cuando: number
  nivel: Nivel
  motivo: MotivoRuta
  antes: Eleccion
  despues: Eleccion
  como: 'auto' | 'elegido' | 'recordado' | 'deshecho'
  dif: number
}

const CLAVE_MODO_RUTA = 'modoModeloEsfuerzo'
const CLAVE_SONNET = 'sonnetPrimero'
/** El esfuerzo que Claude Code usó para cada modelo sin que nadie lo fijara (el de tu organización), si no es el de fábrica. */
const CLAVE_ESFUERZO = 'esfuerzoPorDefecto'
/** Cuántos modelos recuerda con un esfuerzo por defecto distinto del de fábrica. */
const MAX_DEFECTOS = 8
/** Del más fuerte al más débil, como los junta Claude Code. */
const FUENTES_DE_CONFIGURACION = ['policy', 'flag', 'local', 'project', 'user'] as const
/** De dónde sale el esfuerzo: la variable de entorno, tu configuración o nadie lo fijó (el por defecto). */
type FuenteEsfuerzo = 'entorno' | 'config' | 'defecto'
/** Cuánto espera Toki a Haiku en la zona dudosa antes de seguir con la heurística. */
const ESPERA_CLASIFICADOR = 2_000
/** Por debajo de esto el contexto real (sistema + herramientas) aún no se midió: se usa este piso. */
const CONTEXTO_BASE = 35_000

/**
 * Lo que Toki planeó para tu mensaje y con qué esfuerzo creía que iba. En el
 * primer pedido Claude Code dice el de verdad: si es otro, se decide de nuevo.
 */
type PlanTurno = {
  /** El esfuerzo que Toki supuso al planear. */
  supuesto: Esfuerzo
  /** El modelo con que iba la conversación. */
  modelo: string
  usada: Opcion
  como: DecisionRuta['como']
  /** Te preguntó: vale lo que respondiste. */
  preguntado: boolean
  nivel: Nivel
  motivo: MotivoRuta
  propuesta: Omit<Parameters<typeof proponer>[0], 'esfuerzo'>
  estado: EstadoRuta
  /** El cambio en el historial, si lo hubo. */
  entrada?: DecisionRuta
  /** El turno del mensaje: se ata en `turn.start`. */
  turno?: string
  revisado?: boolean
}

/**
 * Un mensaje tuyo: lo que Toki estimó al planearlo y lo que de verdad usó, pedido
 * por pedido. Al terminar va al diagnóstico (solo cifras, nunca tu texto), para
 * calibrar las estimaciones con sesiones reales.
 */
type Medicion = {
  nivel: Nivel
  /** Con qué lo planeó Toki. */
  modelo: string
  esfuerzo: Esfuerzo
  estimado: number
  pedidosEstimados: number
  contexto: number
  ttl1h: boolean
  frio: boolean
  /** El turno que lo mide: se reclama en `turn.start`. */
  turno?: string
  /** Con qué respondió de verdad (el primer pedido). */
  modeloReal?: string
  esfuerzoReal?: string
  pedidos: number
  entrada: number
  leido: number
  escrito: number
  salida: number
  usd: number
  /** Lo mismo sin Toki: tu modelo, tu esfuerzo y el caché que habría tenido. */
  sin: number
}

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
  /**
   * De dónde sale ese esfuerzo, para el modelo (canónico) en que se calculó:
   * la variable de entorno, tu configuración o nadie lo fijó (el por defecto).
   */
  fuenteEsfuerzo?: { modelo: string; fuente: FuenteEsfuerzo }
  /** Lo que el entorno y tu configuración decían la última vez: si cambia, el esfuerzo se calcula de nuevo. */
  vistoEsfuerzo?: { modelo: string; entorno: Esfuerzo | null | undefined; config: Esfuerzo | undefined }
  /** Lo que Claude Code usó sin que nadie fijara un esfuerzo, por modelo, si no es el de fábrica (lo fija tu organización). */
  defectos: Record<string, Esfuerzo>
  plan?: PlanTurno
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
  /** Del caché solo sirve el comienzo (sesión nueva, /clear, recién compactado): cambiar de modelo reescribe solo eso. */
  soloComienzo: boolean
  /** Aún no hubo pedidos en este proceso: una conversación reanudada sí tiene su caché. */
  alIniciar: boolean
  /** Lo que Toki leyó en el último mensaje, aunque no haya cambiado nada: para que puedas comprobarlo. */
  ultima?: { nivel: Nivel; motivo: MotivoRuta; actual: Opcion; recomendada: Opcion; decision: DecisionMensaje }
  /** "Solo Sonnet hasta que haga falta" (/plugin o /toki-sonnet). */
  sonnetPrimero: boolean
  /** Elegiste otro modelo con /model: Sonnet primero espera hasta /toki-sonnet sí. */
  sonnetPausado: boolean
  /** El mensaje anterior decía que algo no funcionó: un "dale" sigue con esa tarea. */
  atascadoPrevio: boolean
  /** La última respuesta de Claude terminaba con una pregunta: un "ok" es un sí, no un cierre. */
  preguntoAntes: boolean
  /** Lo que deshiciste, por nivel: no se vuelve a aplicar solo en esta sesión. */
  deshechos: Partial<Record<Nivel, Eleccion>>
  /** En qué modelo fue cada mensaje de esta sesión. */
  mensajesEn: Partial<Record<Familia, number>>
  medicion?: Medicion
  /** El modelo que Toki pidió para el hilo principal y la API confirmó que respondió (el ✓ de la barra). */
  confirmado?: string
  /** Toki cambió el esfuerzo de algún pedido en esta sesión: la barra de Claude Code no lo muestra. */
  cambioEsfuerzo: boolean
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
  soloComienzo: true,
  alIniciar: true,
  sonnetPrimero: false,
  sonnetPausado: false,
  atascadoPrevio: false,
  preguntoAntes: false,
  deshechos: {},
  mensajesEn: {},
  cambioEsfuerzo: false,
  defectos: {},
}

function xr(): TextosRuta {
  return textosRuta[vivo.idioma]
}

/** Con qué va la conversación ahora: tu modelo o el que Toki eligió, y el esfuerzo de la sesión. */
function eleccionActual(): Eleccion | undefined {
  const modelo = ruta.modeloPrincipal ?? vivo.modelo
  if (modelo === undefined) return undefined
  // Claude Code calcula el esfuerzo para tu modelo, aunque Toki mande el pedido a otro.
  return { modelo, esfuerzo: ruta.esfuerzoSesion ?? esfuerzoDeFabrica(vivo.modelo ?? modelo) }
}

function reiniciarRuta(): void {
  ruta.modeloPrincipal = undefined
  ruta.pendiente = undefined
  ruta.plan = undefined
  ruta.turno = undefined
  ruta.esfuerzo = undefined
  ruta.nivelPrevio = undefined
  ruta.atascadoPrevio = false
  ruta.preguntoAntes = false
  ruta.aviso = undefined
  ruta.soloComienzo = true
  ruta.mensajesEn = {}
  ruta.medicion = undefined
  ruta.confirmado = undefined
}

/** La línea del diagnóstico para un mensaje medido. */
function lineaUso(m: Medicion, interrumpido: boolean): string {
  const modelo = m.modeloReal ?? m.modelo
  const esfuerzo = m.esfuerzoReal ?? m.esfuerzo
  const otroPlan = modelo !== m.modelo || esfuerzo !== m.esfuerzo ? `, para ${m.modelo}/${m.esfuerzo}` : ''
  const estimacion = `${m.pedidosEstimados} pedidos, contexto ${Math.round(m.contexto / 1000)}k, caché ${m.ttl1h ? '1 h' : '5 min'}${m.frio ? ', frío' : ''}${otroPlan}`
  return [
    `uso: ${m.nivel} ${modelo}/${esfuerzo}`,
    `${m.pedidos} ${m.pedidos === 1 ? 'pedido' : 'pedidos'}`,
    `entrada ${m.entrada}`,
    `salida ${m.salida}`,
    `caché escrito ${m.escrito}`,
    `leído ${m.leido}`,
    `$${m.usd.toFixed(4)}`,
    `sin Toki $${m.sin.toFixed(4)}`,
    `Toki estimó $${m.estimado.toFixed(4)} (${estimacion})${interrumpido ? ' · interrumpido' : ''}`,
  ].join(' · ')
}

/** Sonnet primero, si está prendido y no lo pausaste con /model. */
function sonnetActivo(): boolean {
  return ruta.sonnetPrimero && !ruta.sonnetPausado
}

async function leerNivel($: $, texto: string): Promise<{ nivel: Nivel; motivo: MotivoRuta }> {
  const l = nivelHeuristico(texto, ruta.nivelPrevio, ruta.preguntoAntes)
  if (l.seguro || limpiarPrompt(texto).length < 40) return l
  // Zona dudosa: una pregunta corta a Haiku, con tiempo límite. Si tarda, gana la heurística.
  try {
    const enviado = recortar(limpiarPrompt(texto), 2_000)
    // Lo que cuesta preguntarle a Haiku va del lado de Toki (la API no lo devuelve: se estima).
    sumarCuenta(costoClasificador(tokensAprox(enviado.length)), 0)
    const etiqueta = await Promise.race([
      $.model.classify(enviado, Object.keys(ETIQUETAS_CLASIFICADOR)),
      new Promise<undefined>(resolver => $.clock.after(ESPERA_CLASIFICADOR, () => resolver(undefined))),
    ])
    const nivel = etiqueta === undefined ? undefined : ETIQUETAS_CLASIFICADOR[etiqueta]
    if (nivel !== undefined) return { nivel, motivo: nivel === l.nivel ? l.motivo : 'clasificador' }
  } catch {
    // Sin clasificador: la heurística.
  }
  return l
}

// ---------- El esfuerzo con que pide Claude Code ----------

/** `CLAUDE_CODE_EFFORT_LEVEL`, como lo lee Claude Code: `null` si dice `auto` (lo de fábrica, aunque tu configuración diga otro). */
async function esfuerzoDelEntorno($: $): Promise<Esfuerzo | null | undefined> {
  let v: string | undefined
  try {
    v = await $.env.get('CLAUDE_CODE_EFFORT_LEVEL')
  } catch {
    return undefined
  }
  if (v === undefined) return undefined
  const t = v.toLowerCase()
  return t === 'auto' || t === 'unset' ? null : leerEsfuerzo(t)
}

/**
 * El esfuerzo que fijaste para este modelo (`/effort` lo guarda en tu configuración),
 * juntado como Claude Code: de la fuente más fuerte a la más débil, lo de ese modelo
 * o el `effortLevel` de arriba. El de arriba de tu configuración personal solo vale
 * para los modelos de antes. `undefined` si nadie lo fijó.
 */
async function esfuerzoDeConfiguracion($: $, modelo: string): Promise<Esfuerzo | undefined> {
  const canon = modeloCanonico(modelo)
  // Sin versión (un alias) no se puede saber a qué modelo apunta.
  if (!/\d/.test(canon)) return undefined
  try {
    let personal: unknown
    for (const source of FUENTES_DE_CONFIGURACION) {
      const s = await $.settings.read({ source })
      const porModelo = s.modelSettings
      if (typeof porModelo === 'object' && porModelo !== null) {
        let valor: unknown
        for (const [clave, ajustes] of Object.entries(porModelo)) {
          const nivel: unknown = typeof ajustes === 'object' && ajustes !== null ? (ajustes as { effortLevel?: unknown }).effortLevel : undefined
          if (nivel === undefined || modeloCanonico(clave) !== canon) continue
          // Gana la clave con el nombre exacto; si no, la primera.
          if (clave === canon || valor === undefined) valor = nivel
        }
        if (valor !== undefined) return esfuerzoGuardado(valor)
      }
      if (source === 'user') personal = s.effortLevel
      else if (s.effortLevel !== undefined) return esfuerzoGuardado(s.effortLevel)
    }
    return usaEsfuerzoHeredado(modelo) ? esfuerzoGuardado(personal) : undefined
  } catch {
    return undefined
  }
}

/**
 * Antes de planear: con qué esfuerzo va a pedir Claude Code en tu modelo. Solo se
 * calcula de nuevo si cambió el modelo, la variable de entorno o tu configuración;
 * si no, vale lo que dijo el último pedido (también un `--effort` que Toki no ve).
 */
async function refrescarEsfuerzo($: $, modelo: string): Promise<void> {
  const canon = modeloCanonico(modelo)
  const entorno = await esfuerzoDelEntorno($)
  const config = entorno === null ? undefined : await esfuerzoDeConfiguracion($, modelo)
  const visto = ruta.vistoEsfuerzo
  if (visto !== undefined && visto.modelo === canon && visto.entorno === entorno && visto.config === config) return
  ruta.vistoEsfuerzo = { modelo: canon, entorno, config }
  if (typeof entorno === 'string') {
    ruta.esfuerzoSesion = entorno
    ruta.fuenteEsfuerzo = { modelo: canon, fuente: 'entorno' }
  } else if (config !== undefined) {
    ruta.esfuerzoSesion = config
    ruta.fuenteEsfuerzo = { modelo: canon, fuente: 'config' }
  } else {
    ruta.esfuerzoSesion = ruta.defectos[canon] ?? esfuerzoDeFabrica(modelo)
    ruta.fuenteEsfuerzo = { modelo: canon, fuente: 'defecto' }
  }
}

/**
 * Nadie fijó el esfuerzo y Claude Code pidió con este: es el por defecto de ese
 * modelo (tu organización puede fijar otro que el de fábrica). Se recuerda para
 * la próxima sesión, solo si no es el de fábrica.
 */
function recordarDefecto($: $, canon: string, esfuerzo: Esfuerzo): void {
  // `max` solo se elige para la sesión: no es un por defecto.
  if (esfuerzoGuardado(esfuerzo) === undefined) return
  const antes = ruta.defectos[canon]
  const otros = Object.entries(ruta.defectos).filter(([clave]) => clave !== canon)
  ruta.defectos = Object.fromEntries(esfuerzo === esfuerzoDeFabrica(canon) ? otros : [...otros, [canon, esfuerzo] as const].slice(-MAX_DEFECTOS))
  if (ruta.defectos[canon] === antes) return
  void $.store.set(CLAVE_ESFUERZO, ruta.defectos).catch(() => undefined)
}

/** /effort: lo que elegiste vale desde tu próximo mensaje (`max`, solo en esta sesión). */
async function alElegirEsfuerzo($: $, args: string): Promise<void> {
  const modelo = vivo.modelo
  if (modelo === undefined) return
  // Con la variable de entorno puesta, /effort no cambia lo que se pide.
  if ((await esfuerzoDelEntorno($)) !== undefined) return
  const arg = args.trim().toLowerCase()
  const nivel = leerEsfuerzo(arg)
  if (nivel !== undefined) {
    const canon = modeloCanonico(modelo)
    ruta.esfuerzoSesion = nivel
    ruta.fuenteEsfuerzo = { modelo: canon, fuente: 'config' }
    // Tu configuración ya trae lo que /effort guardó (`max` no se guarda): el próximo mensaje no lo pisa.
    ruta.vistoEsfuerzo = { modelo: canon, entorno: undefined, config: await esfuerzoDeConfiguracion($, modelo) }
  } else if (arg === 'auto' || arg === 'unset') {
    // Vuelve a lo de tu configuración o al por defecto: se calcula de nuevo antes del próximo mensaje.
    ruta.vistoEsfuerzo = undefined
  }
  // Sin nivel (el selector): si lo guarda en tu configuración, se nota antes del próximo mensaje; si no, en su primer pedido.
}

/**
 * El primer pedido de tu mensaje trae el esfuerzo de verdad. Si no es el que Toki
 * supuso al planear, decide de nuevo con la misma regla, ya sin preguntar (lo que
 * respondiste vale), antes de que salga el pedido.
 */
async function corregirPlan($: $, plan: PlanTurno, real: Esfuerzo, turnId: string): Promise<void> {
  const supuesto = plan.supuesto
  if (real === supuesto) return
  const p = proponer({ ...plan.propuesta, esfuerzo: real })
  let envio: Opcion
  let como = plan.como
  if (plan.preguntado) {
    envio = como === 'elegido' ? plan.usada : p.actual
    if (ruta.ultima !== undefined) ruta.ultima = { ...ruta.ultima, actual: p.actual }
  } else {
    const d = decidirRuta(p, { ...plan.estado, interactivo: false })
    envio = d.modo === 'auto' ? d.elegida : p.actual
    como = d.como
    ruta.ultima = { nivel: plan.nivel, motivo: plan.motivo, actual: p.actual, recomendada: d.elegida, decision: d.decision }
  }
  const cambia = !igual(envio, p.actual)
  const dif = diferencia(envio, p.actual)
  void anotarDiagnostico($, `ruta corregida: esfuerzo ${real}, Toki supuso ${supuesto} → ${envio.modelo}/${envio.esfuerzo} ${cambia ? textoDiferencia(dif, xr()) : 'sin cambio'}`)
  // Lo que se manda desde este pedido.
  ruta.modeloPrincipal = envio.modelo === vivo.modelo ? undefined : envio.modelo
  ruta.turno = turnId
  ruta.esfuerzo = envio.esfuerzo !== real ? envio.esfuerzo : undefined
  const m = ruta.medicion
  if (m !== undefined && m.turno === turnId) {
    m.modelo = envio.modelo
    m.esfuerzo = envio.esfuerzo
    m.estimado = envio.usd + envio.cambio
  }
  const antes = familiaDe(plan.usada.modelo)
  const ahora = familiaDe(envio.modelo)
  if (antes !== ahora) {
    if (antes !== undefined) ruta.mensajesEn[antes] = Math.max(0, (ruta.mensajesEn[antes] ?? 0) - 1)
    if (ahora !== undefined) ruta.mensajesEn[ahora] = (ruta.mensajesEn[ahora] ?? 0) + 1
  }
  // El historial y el aviso dicen lo que de verdad se aplicó.
  const vieja = plan.entrada
  const avisoViejo = vieja !== undefined && ruta.aviso?.deshacer === vieja.antes
  if (!cambia) {
    plan.entrada = undefined
    if (vieja !== undefined) ruta.historial = ruta.historial.filter(h => h !== vieja)
    if (avisoViejo) ruta.aviso = undefined
  } else {
    const momento = await $.clock.now()
    const nueva: DecisionRuta = { cuando: vieja?.cuando ?? momento, nivel: plan.nivel, motivo: plan.motivo, antes: { modelo: p.actual.modelo, esfuerzo: real }, despues: { modelo: envio.modelo, esfuerzo: envio.esfuerzo }, como, dif }
    ruta.historial = vieja !== undefined ? ruta.historial.map(h => (h === vieja ? nueva : h)) : [...ruta.historial, nueva].slice(-12)
    plan.entrada = nueva
    ruta.aviso = { texto: textoAviso(nueva), hasta: momento + 12_000, deshacer: nueva.antes }
    if (!avisoViejo) sonar($, 'aviso')
  }
  plan.supuesto = real
  plan.usada = envio
  plan.como = como
  $.ui.invalidate('ui.render')
}

/** Otro hook frenó tu mensaje: lo que Toki planeó para él no pasa al siguiente. */
function descartarPlan(): void {
  const plan = ruta.plan
  ruta.plan = undefined
  ruta.pendiente = undefined
  if (ruta.medicion?.turno === undefined) ruta.medicion = undefined
  modeloPorContar.pendiente = false
  if (plan === undefined) return
  const familia = familiaDe(plan.usada.modelo)
  if (familia !== undefined) ruta.mensajesEn[familia] = Math.max(0, (ruta.mensajesEn[familia] ?? 0) - 1)
  const entrada = plan.entrada
  if (entrada === undefined) return
  ruta.historial = ruta.historial.filter(h => h !== entrada)
  ruta.modeloPrincipal = plan.modelo === vivo.modelo ? undefined : plan.modelo
  if (ruta.aviso?.deshacer === entrada.antes) ruta.aviso = undefined
}

/** Lee el mensaje antes de mandarlo y decide (o te pregunta) con qué modelo y esfuerzo va. */
async function planearTurno($: $, textoCrudo: string, silenciar = false): Promise<void> {
  ruta.plan = undefined
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  if (ruta.modo === 'no' || texto === '' || texto.startsWith('/')) return
  // Antes de elegir: ¿cambiaste de modelo desde el último mensaje?
  await revisarModelo($)
  const tuModelo = vivo.modelo
  if (tuModelo === undefined) return
  // ¿Y el esfuerzo? /effort, el selector de /model u otra sesión pueden haberlo cambiado en tu configuración.
  await refrescarEsfuerzo($, tuModelo)
  const actual = eleccionActual()
  // Haiku no tiene esfuerzo, y no hay nada más barato a qué bajar.
  if (actual === undefined || familiaDe(actual.modelo) === 'haiku') return
  const leido = await leerNivel($, texto)
  // "No era eso", "sigue fallando": lo anterior no salió. Una corrección no va en simple y cuenta como atascado.
  const corrige = esCorreccion(texto)
  const nivel: Nivel = corrige && leido.nivel === 'trivial' ? 'normal' : leido.nivel
  const motivo = leido.motivo
  // Un "gracias" no es una tarea: el "dale" que venga después sigue con la de antes.
  const cierre = motivo === 'cierre'
  if (!cierre) ruta.nivelPrevio = nivel
  // "Dale", "sigue": si lo anterior no funcionaba, esto sigue con lo mismo.
  const atascado = corrige || motivo === 'atascado' || (motivo === 'seguimiento' && ruta.atascadoPrevio)
  if (!cierre) ruta.atascadoPrevio = atascado
  const tuFamilia = familiaDe(tuModelo)
  const base = sonnetActivo() && (tuFamilia === 'opus' || tuFamilia === 'sonnet') ? hermano(tuModelo, 'sonnet') : undefined
  const contexto = Math.max(CONTEXTO_BASE, vivo.contextoPedido ?? vivo.tokensUltimoTurno)
  const ttl1h = ttl1hSesion()
  // ¿El modelo con que va la conversación tiene caché? Solo si el último pedido fue a él y no venció.
  const p0 = vivo.pedidoPrevio
  const cacheFrio = p0 === undefined || p0.familia !== familiaDe(actual.modelo) || (await $.clock.now()) - Math.max(vivo.ultimoUsoCache, p0.cuando) > ttlMs()
  // Recién empezada, tras /clear o compactar, cambiar de modelo reescribe solo el comienzo (lo demás es nuevo igual).
  // Una conversación reanudada ya tiene su caché entero.
  const comienzo = vivo.prefijoSistema ?? COMIENZO_TIPICO
  const reanudada = ruta.alIniciar && (vivo.usoCache?.tokens ?? 0) >= Math.max(CONTEXTO_RELEVANTE, 2 * comienzo)
  const reescribe = ruta.soloComienzo && !reanudada ? Math.min(contexto, comienzo) : undefined
  const propuesta: PlanTurno['propuesta'] = {
    nivel,
    modelo: actual.modelo,
    contexto,
    ttl1h,
    // Tras un cierre no se sabe qué viene: cambiar de modelo por un mensaje no se paga.
    permitirModelo: !ruta.modeloRoto && !cierre,
    cacheFrio,
    reescribe,
    sonnetPrimero: base !== undefined,
    atascado,
  }
  const p = proponer({ ...propuesta, esfuerzo: actual.esfuerzo })
  const estado: EstadoRuta = {
    modo: ruta.modo,
    silenciado: ruta.silenciado || silenciar,
    interactivo: ruta.interactivo,
    base,
    // Modo ahorro por límite (lo elegiste al 90 %) o por presupuesto: la opción barata, sin preguntar.
    enAhorro: guardia.ahorroHasta > (await $.clock.now()) || tarea.p?.ahorro === true,
    recordada: ruta.preferencias[nivel],
    deshecha: ruta.deshechos[nivel],
  }
  const d = decidirRuta(p, estado)
  const { modo, elegida, decision, sinCache } = d
  let como: DecisionRuta['como'] = d.como
  // En /toki-modelo, lo que de verdad se aplicó (o se habría aplicado).
  ruta.ultima = { nivel, motivo, actual: p.actual, recomendada: elegida, decision }
  const soloEsfuerzo = sinCache !== undefined ? `, sin tocar el caché: ${sinCache.esfuerzo} ${textoDiferencia(diferencia(sinCache, p.actual), xr())}` : ''
  void anotarDiagnostico(
    $,
    `ruta: ${nivel} (${motivo}${atascado && motivo !== 'atascado' ? ', atascado' : ''}) ${actual.modelo}/${actual.esfuerzo} → ${p.recomendada.modelo}/${p.recomendada.esfuerzo} ${textoDiferencia(diferencia(p.recomendada, p.actual), xr())} [${decision}${soloEsfuerzo}${base !== undefined ? ', sonnet primero' : ''}]${corrige ? ' · corrige el anterior' : ''}`,
  )
  let usada: Opcion = modo === 'nada' ? p.actual : elegida
  if (modo === 'preguntar') usada = await preguntarRuta($, p, nivel, motivo)
  if (modo === 'preguntar' && !igual(usada, p.actual)) como = 'elegido'
  // Para calibrar: lo que Toki estima de este mensaje; sus pedidos dirán lo que de verdad usó.
  ruta.medicion = {
    nivel,
    modelo: usada.modelo,
    esfuerzo: usada.esfuerzo,
    estimado: usada.usd + usada.cambio,
    pedidosEstimados: PEDIDOS_POR_NIVEL[nivel],
    contexto,
    ttl1h,
    frio: cacheFrio,
    pedidos: 0,
    entrada: 0,
    leido: 0,
    escrito: 0,
    salida: 0,
    usd: 0,
    sin: 0,
  }
  // Cada mensaje cuenta: también los que siguen en el modelo que Toki eligió antes.
  const familia = familiaDe(usada.modelo)
  if (familia !== undefined) ruta.mensajesEn[familia] = (ruta.mensajesEn[familia] ?? 0) + 1
  // Si Claude Code pide otro esfuerzo que el supuesto, el primer pedido lo dice y el plan se corrige.
  const plan: PlanTurno = { supuesto: actual.esfuerzo, modelo: actual.modelo, usada, como, preguntado: modo === 'preguntar', nivel, motivo, propuesta, estado }
  ruta.plan = plan
  // Lo que ahorró (o costó de más) se mide pedido por pedido y se acredita al terminar el mensaje.
  if (igual(usada, p.actual)) return
  plan.entrada = await aplicarEleccion($, { nivel, motivo, antes: actual, despues: usada, como, dif: diferencia(usada, p.actual) })
}

/** El diálogo de modelo y esfuerzo: lo que elijas, o como estaba si lo cierras o lo dejas. */
async function preguntarRuta($: $, p: Propuesta, nivel: Nivel, motivo: MotivoRuta): Promise<Opcion> {
  const x = xr()
  const { opciones, dejar } = etiquetas(p, x)
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta(x.nivel[nivel], x.motivo[motivo]), { header: 'Toki', options: [...opciones.map(o => o.etiqueta), dejar].slice(0, 4) })
  } catch {
    // Cerraste el diálogo: el mensaje va como estaba.
    return p.actual
  }
  const opcion = opciones.find(o => o.etiqueta === respuesta)?.opcion ?? interpretarRespuesta(respuesta, p)
  if (opcion === undefined || igual(opcion, p.actual)) {
    ruta.preferencias[nivel] = 'actual'
    ruta.rechazos += 1
    if (ruta.rechazos >= 3 && !ruta.silenciado) {
      ruta.silenciado = true
      $.ui.toast(x.callado, { timeoutMs: 9000 })
    }
    return p.actual
  }
  ruta.rechazos = 0
  ruta.preferencias[nivel] = opcion.tipo
  return opcion
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

/** Aplica el cambio desde el próximo pedido, lo anota en el historial y avisa. Devuelve lo anotado. */
async function aplicarEleccion($: $, d: Omit<DecisionRuta, 'cuando'>): Promise<DecisionRuta> {
  const ahora = await $.clock.now()
  const entrada: DecisionRuta = { ...d, cuando: ahora }
  ruta.modeloPrincipal = d.despues.modelo === vivo.modelo ? undefined : d.despues.modelo
  ruta.pendiente = { nivel: d.nivel, esfuerzo: d.despues.esfuerzo !== d.antes.esfuerzo ? d.despues.esfuerzo : undefined }
  ruta.historial = [...ruta.historial, entrada].slice(-12)
  void anotarDiagnostico($, `ruta aplicada: ${d.antes.modelo}/${d.antes.esfuerzo} → ${d.despues.modelo}/${d.despues.esfuerzo} [${d.como}]`)
  ruta.aviso = { texto: textoAviso(entrada), hasta: ahora + 12_000, deshacer: d.antes }
  sonar($, 'aviso')
  $.ui.invalidate('ui.render')
  return entrada
}

/** "⚡ Este mensaje va con … · esfuerzo … (−18 %)". */
function textoAviso(d: Pick<DecisionRuta, 'despues' | 'dif' | 'como'>): string {
  const x = xr()
  return x.cambio(nombreCorto(d.despues.modelo), x.esfuerzo[d.despues.esfuerzo], `${textoDiferencia(d.dif, x)}${d.como === 'recordado' ? `, ${x.comoAntes}` : ''}`)
}

/**
 * Deshacer (el botón o /toki-modelo deshacer): vuelve al modelo y esfuerzo de
 * antes del último cambio desde el próximo pedido, y para ese nivel no lo repite
 * solo en esta sesión. Si el mensaje aún no terminó, su cuenta vuelve atrás.
 */
async function deshacerEleccion($: $): Promise<Eleccion | undefined> {
  const ultima = ruta.historial[ruta.historial.length - 1]
  // Solo el último cambio, y si sigue vigente (con /model ya mandas tú).
  if (ultima === undefined || ultima.como === 'deshecho' || (ruta.modeloPrincipal ?? vivo.modelo) !== ultima.despues.modelo) return undefined
  ruta.modeloPrincipal = ultima.antes.modelo === vivo.modelo ? undefined : ultima.antes.modelo
  ruta.esfuerzo = undefined
  ruta.pendiente = undefined
  ruta.historial = [...ruta.historial.slice(0, -1), { ...ultima, como: 'deshecho' }]
  ruta.preferencias[ultima.nivel] = 'actual'
  ruta.deshechos[ultima.nivel] = ultima.despues
  ruta.aviso = undefined
  void anotarDiagnostico($, `ruta deshecha: ${ultima.despues.modelo}/${ultima.despues.esfuerzo} → ${ultima.antes.modelo}/${ultima.antes.esfuerzo} (${ultima.nivel})`)
  $.ui.invalidate('ui.render')
  return ultima.antes
}

function textoRuta(x: TextosRuta, s?: Pick<Sesion, 'ruteoAhorroUsd' | 'ruteoExtraUsd'>): string[] {
  const lineas = [`${x.titulo}: ${x.modo[ruta.modo]}${ruta.silenciado ? ` (${x.silenciado})` : ''}`]
  const ahorro = s?.ruteoAhorroUsd ?? 0
  const extra = s?.ruteoExtraUsd ?? 0
  if (ahorro >= 0.005 || extra >= 0.005) lineas.push(`  ${x.balance(usdTexto(ahorro), extra >= 0.005 ? usdTexto(extra) : undefined, vivo.usoCache?.esSuscripcion === true)}`)
  if (ruta.sonnetPrimero) lineas.push(`  ${x.sonnet.titulo}: ${x.sonnet.estado(true)}${ruta.sonnetPausado ? ` (${x.sonnet.pausa})` : ''}`)
  if (ruta.modeloPrincipal !== undefined) {
    lineas.push(`  ${nombreCorto(ruta.modeloPrincipal)} ${x.porToki}`)
    if (ruta.confirmado === ruta.modeloPrincipal) lineas.push(`  ${x.confirmado(nombreCorto(ruta.modeloPrincipal))}`)
  }
  if (ruta.cambioEsfuerzo) lineas.push(`  ${x.notaEsfuerzo}`)
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
  /** El periodo frío ya contado en la tarjeta semanal (se cuenta una vez, aunque el mensaje vuelva). */
  frioContado: number
  frioRechazos: number
  pegadoRechazos: number
  /** Hasta cuándo va el modo ahorro por límite (0 = apagado). */
  ahorroHasta: number
  ahorroVentana?: VentanaLimite
  /** Tu mensaje (con lo importante de antes), para devolverlo al cuadro después de /clear. */
  devolver?: string
} = { muestras: {}, proyeccion: {}, hechos: [], hechosLeidos: false, frioVisto: 0, frioContado: 0, frioRechazos: 0, pegadoRechazos: 0, ahorroHasta: 0 }

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
  await sumarAhorro($, texto.length - recorte.texto.length, vivo.idioma === 'en' ? 'pasted text' : 'texto pegado', undefined, 'pegado')
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
  proponerLimpio(f.contexto, true, ahora)
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
  // Ya compactado: cuenta como mensaje tuyo, no como uno que salió con el caché vencido.
  await contarMensaje($, texto).catch(() => undefined)
  await $.prompt.submit({ text: texto, asUser: true }).catch(async () => {
    await $.prompt.fill({ text: texto, mode: 'replace' }).catch(() => undefined)
  })
}

// ---------- Tarjeta semanal: tus mensajes ----------

/** El modelo de cada mensaje tuyo se cuenta en su primer pedido: el que de verdad respondió. */
const modeloPorContar: { pendiente: boolean; turno?: string } = { pendiente: false }

/** ¿Este mensaje sale con el caché vencido y mucho contexto? Devuelve el periodo frío, para contarlo una sola vez. */
async function mensajeFrio($: $): Promise<number | undefined> {
  if (vivo.ultimoUsoCache <= 0 || vivo.ultimoUsoCache === guardia.frioContado) return undefined
  const f = evaluarCacheFrio({
    ahora: await $.clock.now(),
    ultimoUsoCache: vivo.ultimoUsoCache,
    ttlMin: ttlMinutos(),
    contexto: vivo.usoCache?.tokens ?? vivo.tokensUltimoTurno,
    familia: familiaDe(ruta.modeloPrincipal ?? vivo.modelo) ?? 'opus',
    ttl1h: vivo.usoCache?.esSuscripcion ?? true,
  })
  return f === undefined ? undefined : vivo.ultimoUsoCache
}

/** Un mensaje tuyo que sale hacia Claude: a la tarjeta, con si corregía lo anterior y si salió frío. */
async function contarMensaje($: $, textoCrudo: string, frio?: number): Promise<void> {
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  if (texto === '' || texto.startsWith('/')) return
  const contarFrio = frio !== undefined && frio !== guardia.frioContado
  if (contarFrio) guardia.frioContado = frio
  modeloPorContar.pendiente = true
  await alaSemana($, { mensajes: 1, correcciones: esCorreccion(texto) ? 1 : 0, frios: contarFrio ? 1 : 0 })
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

// ---------- Pedidos grandes: entrevista y consejos para pedir mejor ----------

const CLAVE_ENTREVISTA = 'modoEntrevista'
const CLAVE_CONSEJOS = 'consejosVistos'

const entrevista: {
  modo: ModoEntrevista
  /** Mensajes tuyos en esta conversación (vuelve a 0 con /clear). */
  mensajes: number
  recientes: string[]
  /** Veces seguidas que dijiste "sin preguntas" o enviaste así; a la tercera Toki se calla. */
  saltos: number
  silenciada: boolean
  /** El último pedido grande: con entrevista o sin ella (para comparar las correcciones que siguen). */
  grupo?: 'con' | 'sin'
  /** La última tarea de verdad (no un "sí" ni una corrección) y las correcciones que lleva. */
  tarea?: string
  correcciones: string[]
  consejos: Partial<Record<Consejo, number>>
  consejosLeidos: boolean
  limpioRechazos: number
  /** Tu mensaje lleva la instrucción de preguntar: espera su turno (si no entra, se descarta). */
  pendiente?: { porque: PorQueEntrevistar }
  /** El turno de ese mensaje: ¿Claude ya preguntó? y cuántos cambios frenó Toki antes. */
  turno?: { turnId: string; porque: PorQueEntrevistar; frenos: number; pregunto: boolean }
} = { modo: 'auto', mensajes: 0, recientes: [], saltos: 0, silenciada: false, correcciones: [], consejos: {}, consejosLeidos: false, limpioRechazos: 0 }

function xe(): TextosEntrevista {
  return textosEntrevista[vivo.idioma]
}

function reiniciarEntrevista(): void {
  entrevista.mensajes = 0
  entrevista.recientes = []
  entrevista.grupo = undefined
  entrevista.tarea = undefined
  entrevista.correcciones = []
  entrevista.limpioRechazos = 0
  entrevista.pendiente = undefined
  entrevista.turno = undefined
}

/**
 * Terminó el turno del pedido con entrevista: ¿Claude preguntó (con AskUserQuestion o en el
 * texto)? Lo anota en el diagnóstico y lo cuenta con o sin entrevista. Un turno cortado
 * (lo interrumpiste, un error) sin preguntas no cuenta: no se sabe si Claude iba a preguntar.
 */
async function cerrarEntrevista($: $, turnId: string, respuesta: string, motivo: string): Promise<void> {
  const t = entrevista.turno
  if (t === undefined || t.turnId !== turnId) return
  entrevista.turno = undefined
  const frenos = t.frenos > 0 ? ` · frenó ${t.frenos}` : ''
  if (!t.pregunto && motivo !== 'answer') {
    entrevista.grupo = undefined
    void anotarDiagnostico($, `entrevista: ${motivo === 'aborted' ? 'interrumpida' : `turno cortado (${motivo})`}${frenos}`)
    return
  }
  const enTexto = !t.pregunto && terminaEnPregunta(respuesta)
  const con = t.pregunto || enTexto
  void anotarDiagnostico($, `entrevista: ${t.pregunto ? 'hecha' : enTexto ? 'preguntó en el texto' : 'Claude no preguntó'}${frenos}`)
  entrevista.grupo = con ? 'con' : 'sin'
  await contarEntrevista($, con ? 'con' : 'sin')
}

type CuentaEntrevista = 'con' | 'conCorr' | 'sin' | 'sinCorr' | 'consejos'

async function contarEntrevista($: $, campo: CuentaEntrevista): Promise<void> {
  await update($, sesion, s => {
    const e = s.entrevista ?? { con: 0, conCorr: 0, sin: 0, sinCorr: 0, consejos: 0 }
    return { ...s, entrevista: { ...e, [campo]: e[campo] + 1 } }
  })
  await alaSemana($, campo === 'consejos' ? { consejos: 1 } : { entrevista: campo })
}

/** /clear y tu mensaje (o el pedido mejorado) de vuelta al cuadro. */
function limpiarYDevolver($: $, texto: string): void {
  const x = xe()
  guardia.devolver = texto
  $.clock.after(100, () => {
    void $.command.run({ command: 'clear' }).catch(async () => {
      await $.prompt.fill({ text: '/clear', mode: 'replace' }).catch(() => undefined)
      $.ui.toast(x.pulsaEnter, { timeoutMs: 10_000 })
    })
  })
  $.ui.toast(x.limpiando, { timeoutMs: 6_000 })
}

/** `contexto`: lo que pesa la conversación que se deja (si dices que sí, eso se deja de releer). */
async function ofrecerLimpio($: $, pregunta: string, si: string, no: string, texto: string, contexto: number): Promise<boolean> {
  let respuesta: string
  try {
    respuesta = await $.ui.ask(pregunta, { header: 'Toki', options: [si, no] })
  } catch {
    return false
  }
  if (respuesta !== si) {
    entrevista.limpioRechazos += 1
    return false
  }
  const ahora = await $.clock.now()
  // Con el caché vencido (contado con el plazo largo, para no inflar), sin Toki tu mensaje la reescribía entera.
  proponerLimpio(contexto, vivo.ultimoUsoCache > 0 && ahora - vivo.ultimoUsoCache > ttlMs(), ahora)
  limpiarYDevolver($, texto)
  return true
}

/** Entre decir que sí y el /clear: si tarda más (pulsaste Enter mucho después), ese /clear no se cuenta como de Toki. */
const LIMPIO_PLAZO_MS = 10 * 60_000

/** Dijiste que sí a empezar en limpio: lo que pesaba la conversación de antes, para contar lo que ya no se relee tras el /clear. */
function proponerLimpio(antes: number, frio: boolean, ahora: number): void {
  vivo.limpioPropuesto = antes > 0 ? { antes, frio, cuando: ahora } : undefined
}

/** Llegó el /clear que Toki propuso: desde el próximo pedido se cuenta lo que ya no se relee. */
function empezarLimpio($: $, ahora: number): void {
  const p = vivo.limpioPropuesto
  vivo.limpioPropuesto = undefined
  // Un /clear mucho después de decir que sí ya es tuyo, no de Toki.
  if (p === undefined || ahora - p.cuando > LIMPIO_PLAZO_MS) return
  // Sin Toki la conversación de antes habría seguido hasta que Claude Code la compactara (con tu ventana o la suya).
  const ventana = vivo.ventanaNativa ?? vivo.ventana ?? vivo.usoCache?.ventana ?? 0
  vivo.limpio = { antes: p.antes, tope: topeLimpio(ventana), frio: p.frio }
  vivo.limpioAvisado = false
  void anotarDiagnostico($, `empezar en limpio: se deja ${formatearTokens(p.antes)}${p.frio ? ' con el caché vencido' : ''}; se cuenta hasta ${formatearTokens(vivo.limpio.tope)}`)
}

/** Dejó de contarse lo de empezar en limpio: cuánto ahorró, al diagnóstico. */
async function terminarLimpio($: $, motivo: string): Promise<void> {
  if (vivo.limpio === undefined) return
  vivo.limpio = undefined
  const s = await read($, sesion)
  void anotarDiagnostico($, `empezar en limpio: ${motivo}; ahorró ${cifraUsd(s.limpioUsd ?? 0)} (~${formatearTokens(s.limpioTokens ?? 0)} tokens)`)
}

function contarSalto($: $): void {
  entrevista.saltos += 1
  if (entrevista.saltos >= SALTOS_PARA_CALLAR && !entrevista.silenciada) {
    entrevista.silenciada = true
    $.ui.toast(xe().callada, { timeoutMs: 8_000 })
  }
}

/**
 * Lo que Toki hace con un mensaje tuyo antes de que llegue a Claude: ofrecer empezar en
 * limpio (cambio de tema con mucho contexto, o dos correcciones seguidas), pedirle a Claude
 * que te entreviste si el pedido es grande y vago, o un consejo corto para pedir mejor.
 */
async function entrevistaYConsejos($: $, textoCrudo: string): Promise<{ contexto?: string; drop?: string }> {
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  entrevista.pendiente = undefined
  if (texto === '' || texto.startsWith('/')) return {}
  const e = entrevista
  const previos = e.mensajes
  const recientes = e.recientes
  e.mensajes += 1
  e.recientes = [...recientes, texto.slice(0, 600)].slice(-3)
  if (e.modo === 'no' || !ruta.interactivo) return {}
  if (!e.consejosLeidos) {
    e.consejosLeidos = true
    try {
      const guardado = await $.store.get(CLAVE_CONSEJOS)
      if (guardado !== null && typeof guardado === 'object') e.consejos = guardado as Partial<Record<Consejo, number>>
    } catch {
      // Sin memoria de consejos: se muestran de nuevo.
    }
  }
  const x = xe()
  const lectura = nivelHeuristico(texto, ruta.nivelPrevio, ruta.preguntoAntes)
  const contexto = vivo.usoCache?.tokens ?? vivo.tokensUltimoTurno
  // Si el aviso de caché vencido ya preguntó por este periodo, no se pregunta dos veces.
  const yaPregunto = vivo.ultimoUsoCache > 0 && guardia.frioVisto === vivo.ultimoUsoCache

  // Segunda corrección sobre lo mismo: la conversación está llena de intentos fallidos.
  if (esCorreccion(texto)) {
    if (e.grupo !== undefined) await contarEntrevista($, e.grupo === 'con' ? 'conCorr' : 'sinCorr')
    e.correcciones.push(texto)
    if (e.correcciones.length === 2 && e.tarea !== undefined && contexto >= CONTEXTO_PARA_LIMPIAR && e.limpioRechazos < 2 && !yaPregunto) {
      const pedido = armarPedidoMejorado(e.tarea, e.correcciones, vivo.idioma)
      if (await ofrecerLimpio($, x.correccion.pregunta(formatearTokens(contexto)), x.correccion.si, x.correccion.no, pedido, contexto)) return { drop: x.limpiando }
    }
    return {}
  }

  const seguimiento = lectura.motivo === 'seguimiento'
  if (!seguimiento) e.correcciones = []
  if (!seguimiento && lectura.nivel !== 'trivial' && texto.split(/\s+/).length >= 8) e.tarea = texto

  // Cambio de tema con mucho contexto a cuestas: mejor empezar en limpio (y la entrevista, ya sin lastre).
  // «Esto hay que solucionarlo…» retoma lo anterior: limpiar borraría lo que necesita.
  const otroTema = !seguimiento && lectura.nivel !== 'trivial' && previos > 0 && !retomaLoAnterior(texto) && cambioDeTema(recientes, texto)
  if (otroTema && contexto >= CONTEXTO_CAMBIO_DE_TEMA && e.limpioRechazos < 2 && !yaPregunto) {
    if (await ofrecerLimpio($, x.tema.pregunta(formatearTokens(contexto)), x.tema.si, x.tema.no, texto, contexto)) return { drop: x.limpiando }
  }

  const entrada = { texto, nivel: lectura.nivel, motivo: lectura.motivo, interactivo: ruta.interactivo, mensajes: previos, recientes }
  const ev = e.silenciada ? { entrevistar: false as const } : evaluarEntrevista(entrada)
  let instruccion: string | undefined
  if ('omitido' in ev && ev.omitido === 'sin-preguntas') {
    contarSalto($)
  } else if (ev.entrevistar) {
    let acepta = true
    if (e.modo === 'preguntar') {
      try {
        acepta = (await $.ui.ask(x.pregunta, { header: 'Toki', options: [x.opcionesPregunta.si, x.opcionesPregunta.no] })) === x.opcionesPregunta.si
      } catch {
        acepta = false
      }
      if (!acepta) contarSalto($)
    }
    if (acepta) {
      e.saltos = 0
      instruccion = x.instruccion(ev.porque)
      if (e.modo === 'auto') $.ui.toast(x.aviso, { timeoutMs: 9_000 })
      // Con o sin entrevista se cuenta al terminar el turno: según Claude haya preguntado o no.
      e.grupo = undefined
      e.pendiente = { porque: ev.porque }
      void anotarDiagnostico($, `entrevista: ${ev.porque}`)
    }
  }
  if (instruccion === undefined && esPedidoGrande(entrada)) {
    e.grupo = 'sin'
    await contarEntrevista($, 'sin')
  }

  // Un consejo corto, solo si no hubo entrevista, y cada tipo un par de veces.
  if (instruccion === undefined && !seguimiento) {
    const c = consejoDe(texto, lectura.nivel, e.consejos)
    if (c !== undefined) {
      e.consejos[c] = (e.consejos[c] ?? 0) + 1
      void $.store.set(CLAVE_CONSEJOS, e.consejos).catch(() => undefined)
      $.ui.toast(x.consejos[c], { timeoutMs: 10_000 })
      await contarEntrevista($, 'consejos')
    }
  }
  return instruccion === undefined ? {} : { contexto: instruccion }
}

export const register: Register = (on, options) => {
  config.compresion = options['compresion'] !== false
  config.mapaAuto = options['mapaAutomatico'] !== false
  config.acompanante = options['acompanante'] !== false
  config.memoria = options['memoria'] !== false
  config.conciso = options['concisoAutomatico'] !== false
  // Las respuestas breves se deciden de nuevo con el primer system prompt.
  vivo.breve = undefined
  vivo.breveAvisado = false
  vivo.breveEnCache = false
  vivo.cuentaBreve = { usd: 0, tokens: 0 }
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
  ruta.sonnetPrimero = options['sonnetPrimero'] === true
  entrevista.modo = leerModoEntrevista(options['entrevista'])
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
    await $.command.register({ name: 'toki-modelo', description: xr().cmd, argumentHint: `preguntar | siempre | automatico | no | ${vivo.idioma === 'en' ? 'undo' : 'deshacer'}` })
    await $.command.register({ name: 'toki-sonnet', description: xr().sonnet.cmd, argumentHint: xr().sonnet.pista })
    await $.command.register({
      name: 'toki-semana',
      description: vivo.idioma === 'en' ? 'Toki: your weekly savings card' : 'Toki: tu tarjeta semanal de ahorro',
      argumentHint: vivo.idioma === 'en' ? '[last] [md]' : '[pasada] [md]',
    })
    await $.command.register({ name: 'toki-entrevista', description: xe().cmd, argumentHint: 'auto | preguntar | no' })
    await $.command.register({ name: 'toki-presupuesto', description: xp().cmd, argumentHint: xp().pista })
    ruta.interactivo = e.isInteractive === true
    try {
      const guardado = await $.store.get(CLAVE_MODO_RUTA)
      if (typeof guardado === 'string') ruta.modo = leerModo(guardado)
    } catch {
      // Sin preferencia guardada: la de /plugin.
    }
    try {
      const guardado = await $.store.get(CLAVE_SONNET)
      if (typeof guardado === 'boolean') ruta.sonnetPrimero = guardado
    } catch {
      // Sin preferencia guardada: la de /plugin.
    }
    try {
      const guardada = await $.store.get(CLAVE_ENTREVISTA)
      if (typeof guardada === 'string') entrevista.modo = leerModoEntrevista(guardada)
    } catch {
      // Sin preferencia guardada: la de /plugin.
    }
    try {
      const guardado: unknown = await $.store.get(CLAVE_ESFUERZO)
      if (typeof guardado === 'object' && guardado !== null) {
        ruta.defectos = Object.fromEntries(Object.entries(guardado).filter((par): par is [string, Esfuerzo] => esfuerzoGuardado(par[1]) !== undefined).slice(-MAX_DEFECTOS))
      }
    } catch {
      // Sin dato: el de fábrica, hasta el primer pedido.
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
    // El caché que dejó la sesión anterior: si sigue vivo, cambiar de modelo al empezar reescribe el comienzo.
    try {
      const guardado: unknown = await $.store.get(CLAVE_ULTIMO_PEDIDO)
      if (esPedidoPrevio(guardado)) {
        vivo.pedidoPrevio = { familia: guardado.familia, sin: guardado.sin, tamano: guardado.tamano, cuando: guardado.cuando }
        const prefijo = (guardado as { prefijo?: unknown }).prefijo
        if (typeof prefijo === 'number' && Number.isFinite(prefijo) && prefijo > 0) vivo.prefijoSistema = prefijo
      }
    } catch {
      // Sin dato: se mide desde el primer pedido.
    }
    vivo.trasLimpiar = false
    vivo.conPings = false
    vivo.breveEnCache = false
    vivo.cuentaBreve = { usd: 0, tokens: 0 }
    ruta.soloComienzo = true
    ruta.alIniciar = true
    // Claude Code lee la ventana de compactación al empezar: puesta a mitad de un turno no cuenta.
    ultimaVentana = ''
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
    await sembrarAhorroUsd($)
    await revisarLogros($)
    vivo.costoContado = 0
    await alaSemana($, { sesiones: 1 })
    if (e.isInteractive) await avisarSemana($, ahora)
    if (e.isInteractive && config.acompanante && vivo.mensaje === undefined) decir(ahora, x.saludo(totalAhorrado(), vivo.racha), 'normal', 15_000)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // Lo medido de esta conversación se acredita antes de olvidarla.
    await acreditar($)
    await guardarUltimoPedido($)
    await terminarLimpio($, 'terminó la conversación')
    reiniciarSeguimiento()
    if (e.reason === 'clear') {
      // El caché del pedido anterior sigue vivo, pero la conversación nueva solo comparte el comienzo.
      vivo.trasLimpiar = true
      vivo.conPings = false
      vivo.familiaSinDeAgente.clear()
      tarea.p = undefined
      reiniciarConversacion()
      reiniciarRuta()
      reiniciarEntrevista()
      await update($, sesion, () => SESION_VACIA)
      await update($, gasto, () => GASTO_VACIO)
      await update($, fallos, () => ({}))
      await update($, avisoMapaDado, () => false)
      empezarLimpio($, await $.clock.now())
      devolverMensaje($)
    }
    // Otro final (salir, reanudar otra): lo propuesto ya no aplica.
    vivo.limpioPropuesto = undefined
    return next(e)
  })

  // Antes de mandar tu mensaje: ¿qué modelo y esfuerzo merece? Solo lo que tú escribes.
  on('prompt.submit', async ($, e, next) => {
    const deLaPersona = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (e.command !== undefined || e.isMeta === true || e.turnId !== undefined || !deLaPersona) return next(e)
    // Antes de las guardias: si sale frío pese a todo, la tarjeta lo cuenta.
    let frio: number | undefined
    try {
      frio = await mensajeFrio($)
    } catch {
      frio = undefined
    }
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
    let contexto: string | undefined
    try {
      const r = await entrevistaYConsejos($, texto)
      if (r.drop !== undefined) return { drop: r.drop }
      contexto = r.contexto
    } catch (err) {
      $.ui.log(`Toki, entrevista: ${String(err)}`, { to: 'debug' })
    }
    try {
      await planearTurno($, texto, silenciar)
    } catch (err) {
      $.ui.log(`Toki, modelo y esfuerzo: ${String(err)}`, { to: 'debug' })
    }
    try {
      await contarMensaje($, texto, frio)
    } catch {
      // Solo estadística.
    }
    const base = texto === e.text ? e : { ...e, text: texto }
    // La instrucción va como contexto: Claude la lee junto a tu mensaje y tú no ves nada distinto.
    const r = await next(contexto === undefined ? base : { ...base, context: [...(e.context ?? []), contexto] })
    // Otro hook lo frenó: no hay turno, y ni la entrevista ni el plan pueden quedar para el de otro mensaje.
    if ('drop' in r) {
      entrevista.pendiente = undefined
      descartarPlan()
    }
    return r
  })

  // Subagentes con encargos simples: Sonnet. Empiezan sin contexto, no se pierde caché.
  on('agent.spawn', async ($, e, next) => {
    if (!ruta.subagentes || ruta.modo === 'no' || e.model !== undefined) return next(e)
    const modelo = modeloSubagente(e.subagentType, e.prompt, e.parentModel, sonnetActivo())
    if (modelo === undefined) return next(e)
    const r = await next({ ...e, model: modelo })
    // Sin Toki habría ido en el modelo de la conversación: contra ese se mide.
    const id = (r as { agentId?: string }).agentId
    if (id !== undefined) recordarAgente(id, familiaDe(e.parentModel) ?? familiaDe(vivo.modelo) ?? 'opus')
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
      // Si este turno es un mensaje tuyo ya contado, su primer pedido dice qué modelo respondió.
      modeloPorContar.turno = modeloPorContar.pendiente ? e.turnId : undefined
      modeloPorContar.pendiente = false
      // El esfuerzo que se eligió para este mensaje vale para todos sus pedidos, y solo para ellos.
      ruta.turno = ruta.pendiente !== undefined ? e.turnId : undefined
      ruta.esfuerzo = ruta.pendiente?.esfuerzo
      ruta.pendiente = undefined
      // La entrevista pedida vale para este turno y solo para él.
      const porque = entrevista.pendiente?.porque
      entrevista.turno = porque === undefined ? undefined : { turnId: e.turnId, porque, frenos: 0, pregunto: false }
      entrevista.pendiente = undefined
      // La medición del mensaje que se acaba de planear es de este turno; una vieja sin terminar se descarta.
      const medicion = ruta.medicion
      if (medicion !== undefined && medicion.turno === undefined) medicion.turno = e.turnId
      else ruta.medicion = undefined
      // El plan también: su primer pedido dirá con qué esfuerzo iba de verdad.
      const plan = ruta.plan
      if (plan !== undefined && plan.turno === undefined) plan.turno = e.turnId
      else ruta.plan = undefined
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
      // Solo sobre tu modelo: si Claude Code cayó a otro (sobrecarga), se respeta.
      const sobreTuModelo = familiaDe(e.model) !== undefined && familiaDe(e.model) === familiaDe(vivo.modelo)
      // El primer pedido de tu mensaje trae el esfuerzo de la sesión (antes de que una skill lo cambie):
      // si Toki supuso otro al planear, el plan se corrige antes de que salga.
      const plan = ruta.plan
      if (e.index === 0 && plan !== undefined && plan.turno === e.turnId && plan.revisado !== true && sobreTuModelo && esEsfuerzo(e.effort)) {
        plan.revisado = true
        const f = ruta.fuenteEsfuerzo
        if (f?.fuente === 'defecto' && vivo.modelo !== undefined && f.modelo === modeloCanonico(vivo.modelo)) recordarDefecto($, f.modelo, e.effort)
        ruta.esfuerzoSesion = e.effort
        try {
          await corregirPlan($, plan, e.effort, e.turnId)
        } catch (err) {
          $.ui.log(`Toki, corregir el plan: ${String(err)}`, { to: 'debug' })
        }
      }
      // Red de seguridad: si lo que Toki bajó de esfuerzo se alarga o entra en bucle, no era simple.
      // Lo que queda del turno va con tu esfuerzo (el modelo sigue: cambiarlo a mitad reescribiría el caché).
      const bajado = ruta.esfuerzo
      if (bajado !== undefined && ruta.turno === e.turnId && esEsfuerzo(e.effort) && ESFUERZOS.indexOf(bajado) < ESFUERZOS.indexOf(e.effort) && (e.index >= PEDIDOS_PARA_SUBIR || vivo.bucleReciente)) {
        ruta.esfuerzo = undefined
        if (ruta.nivelPrevio === 'trivial') ruta.nivelPrevio = 'normal'
        void anotarDiagnostico($, `esfuerzo restaurado: ${bajado} → ${e.effort} (${vivo.bucleReciente ? 'bucle' : `${e.index} pedidos`})`)
        $.ui.toast(xr().esfuerzoRestaurado(xr().esfuerzo[e.effort]), { timeoutMs: 6000 })
      }
      const modelo = ruta.modeloPrincipal !== undefined && !ruta.modeloRoto && sobreTuModelo ? ruta.modeloPrincipal : e.model
      const esfuerzo = ruta.esfuerzo !== undefined && ruta.turno === e.turnId && e.effort !== undefined ? ruta.esfuerzo : e.effort
      if (modelo !== e.model || esfuerzo !== e.effort) {
        pedido = { ...e, model: modelo, effort: esfuerzo }
        if (e.index === 0) void anotarDiagnostico($, `pedido: ${e.model}/${String(e.effort)} → ${modelo}/${String(esfuerzo)}`)
      }
    }
    const respuesta = yield* next(pedido)
    if (e.agentId === undefined && e.index === 0 && e.turnId === modeloPorContar.turno) {
      modeloPorContar.turno = undefined
      const familia = familiaDe(respuesta.usage?.model ?? pedido.model)
      if (familia !== undefined) await alaSemana($, { modelo: familia })
    }
    // Cada pedido lee o escribe el caché: desde aquí corre su vida (1 h o 5 min).
    if (e.agentId === undefined && respuesta.usage !== null) vivo.ultimoUsoCache = await $.clock.now()
    // ¿Respondió el modelo que Toki pidió? Si no, se deja de cambiar el modelo (el esfuerzo sigue).
    if (pedido.model !== e.model && respuesta.usage !== null && familiaDe(respuesta.usage.model) !== familiaDe(pedido.model)) {
      ruta.modeloRoto = true
      ruta.modeloPrincipal = undefined
      $.ui.toast(xr().modeloNoDisponible(nombreCorto(pedido.model)), { timeoutMs: 8000 })
      void anotarDiagnostico($, `modelo pedido ${pedido.model}, respondió ${respuesta.usage.model}`)
    } else if (e.agentId === undefined && pedido.model !== e.model && respuesta.usage !== null && ruta.confirmado !== pedido.model) {
      // La API dice qué modelo respondió: el ✓ de la barra no es una suposición.
      ruta.confirmado = pedido.model
      $.ui.invalidate('ui.render')
    }
    if (e.agentId === undefined && pedido.effort !== e.effort) ruta.cambioEsfuerzo = true
    if (respuesta.usage !== null) {
      const u = respuesta.usage
      const sin = familiaSinDelPedido(e, u)
      try {
        await alPedido($, e.agentId !== undefined, u, sin)
      } catch {
        // Sin cifras de este pedido: no cambia nada para Claude.
      }
      try {
        // Después de alPedido: si este pedido trae la compactación, ya quedó anotada.
        const c = medirPedido(e, pedido, u, sin, await $.clock.now())
        const m = ruta.medicion
        if (e.agentId === undefined && m !== undefined && m.turno === e.turnId) {
          m.pedidos += 1
          m.entrada += u.input_tokens
          m.leido += u.cache_read_input_tokens
          m.escrito += u.cache_creation_input_tokens
          m.salida += u.output_tokens
          m.usd += c.real
          m.sin += c.sin
          if (m.modeloReal === undefined) {
            m.modeloReal = u.model ?? pedido.model
            m.esfuerzoReal = String(pedido.effort)
          }
        }
      } catch {
        // Solo estadística.
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
      ruta.preguntoAntes = terminaEnPregunta(e.answer)
      try {
        await cerrarEntrevista($, e.turnId, e.answer, e.isAborted ? 'aborted' : e.reason)
      } catch (err) {
        $.ui.log(`Toki, entrevista: ${String(err)}`, { to: 'debug' })
      }
      const medicion = ruta.medicion
      if (medicion !== undefined && medicion.turno === e.turnId) {
        ruta.medicion = undefined
        void anotarDiagnostico($, lineaUso(medicion, e.isAborted))
      }
      // Lo que ahorró (o costó de más) este mensaje, medido, a la sesión, la semana y el total.
      await acreditar($)
      if (vivo.breve === 'agregar') await avisarBreve($)
      await guardarUltimoPedido($)
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
      // Solo si el motor no dejó poner las respuestas breves en el system prompt.
      if (config.conciso && vivo.breve === undefined && !vivo.nudgeConciso && (uso?.tokens ?? 0) >= umbralConciso) {
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

  // Respuestas breves desde el primer mensaje: una sección fija al final del system prompt.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    try {
      const d = decidirBreve({ activo: config.conciso, estilo: e.outputStyle?.name ?? null, traits: e.traits })
      // /context mide sin mandar nada y un compañero arma el prompt de su líder: no cuentan para tu conversación.
      if (!e.traits.includes('analysis') && !e.traits.includes('teammate')) vivo.breve = d
      if (d !== 'agregar' || r.sections.some(sec => sec.id === ID_BREVE)) return r
      return { sections: [...r.sections, { id: ID_BREVE, text: SECCION_BREVE, scope: 'session' as const }] }
    } catch {
      return r
    }
  })

  // La entrevista se cumple: hasta que Claude pregunte, Toki frena los cambios y los subagentes
  // (leer para preparar las preguntas pasa). A lo sumo FRENOS_ENTREVISTA veces por turno.
  on('tool.check', async ($, e, next) => {
    const t = entrevista.turno
    // Lo que hace un subagente que ya corre sigue: la entrevista es de tu conversación.
    if (t === undefined || t.pregunto || t.frenos >= FRENOS_ENTREVISTA || e.agentId !== undefined) return next(e)
    if (!frenaAntesDePreguntar(e.tool, e.isReadOnly === true)) return next(e)
    const consulta = e.tool_use_id === undefined
    // La llamada de otro plugin no es Claude saltándose la entrevista.
    if (!consulta && next.origin.plugin !== 'engine') return next(e)
    const r = await next(e)
    // Si ya se rechazaba (modo plan, una regla tuya), el motivo de siempre basta.
    if (r.decision === 'deny') return r
    // Una consulta recibe el mismo veredicto, sin contar como freno: así la captura no envuelve
    // un comando de solo lectura en uno que se frenaría (envolver cambiaría el veredicto).
    if (!consulta) {
      t.frenos += 1
      void anotarDiagnostico($, `entrevista: frenó ${e.tool} antes de preguntar`)
    }
    return { decision: 'deny', reason: xe().frenada }
  })

  // Claude preguntó (el AskUserQuestion del modelo, no un $.ui.ask de Toki u otro plugin): desde aquí no frena nada.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const t = entrevista.turno
    if (t !== undefined && !t.pregunto && e.agentId === undefined && next.origin.plugin === 'engine') t.pregunto = true
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
    if (busqueda !== undefined && ran.isError !== true) {
      const nuevo = await resumirBusquedaShell($, comando, busqueda, ran.result, captura, e.agentId)
      if (nuevo !== undefined) return { result: { ...ran.result, ...nuevo, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    const aviso = await despuesDeEjecutar($, comando, ran.isError === true, ran.text)
    if (ran.isError !== true) {
      const repetida = await revisarRepetida($, 'Bash', comando, e.agentId, ran.result, envuelto)
      if (repetida !== undefined) return { result: { ...ran.result, ...repetida, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    if (compactable) {
      if (ran.isError === true) {
        const texto = await compactarFallo($, comando, ran.text ?? '', captura, e.agentId)
        if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
      } else {
        const nuevo = await compactarExito($, comando, ran.result, captura, e.agentId)
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
      if (r !== undefined) {
        const repetida = await revisarRepetida($, 'PowerShell', comando, e.agentId, r, envuelto)
        if (repetida !== undefined) return conSalida(repetida)
      }
      if (compactable) {
        if (ran.isError === true) {
          const texto = await compactarFallo($, comando, ran.text ?? '', captura, e.agentId)
          if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
        } else if (r === undefined) anotarMotivo(comando, 'formato')
        else {
          const nuevo = await compactarExito($, comando, r, captura, e.agentId)
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
    const palabras = e.args
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(p => p !== '')
    const pasada = palabras.some(p => /^(pasada|last|anterior|prev)/.test(p))
    // "md" (o "exportar", "guardar"…): la tarjeta en Markdown, en un archivo para guardarla o compartirla.
    const md = palabras.some(p => /^(md|markdown|export\w*|guard\w*|archivo|file|save)$/.test(p))
    const actual = lunesDe(ahora)
    const lunes = pasada
      ? (Object.keys(semanas)
          .filter(k => k < actual)
          .sort()
          .pop() ?? actual)
      : actual
    const historial = await leerHistorial($)
    const suscripcion = vivo.usoCache?.esSuscripcion === true
    const opciones = { idioma: vivo.idioma, mostrarCosto: !suscripcion, suscripcion, racha: await rachaDe($, ahora), sonnetPrimero: sonnetActivo() }
    if (!md || semanas[lunes] === undefined) return { text: tarjetaSemana(semanas, lunes, ahora, historial, opciones) }
    const archivo = `${CARPETA}/semana-${lunes}.md`
    try {
      await asegurarCarpeta($)
      await $.fs.write(archivo, tarjetaSemana(semanas, lunes, ahora, historial, { ...opciones, formato: 'md' }))
    } catch (err) {
      return { text: tarjetaNoGuardada(String(err), vivo.idioma) }
    }
    const donde = await $.session
      .cwd()
      .then(c => `${c.replace(/[\\/]$/, '')}/${archivo}`)
      .catch(() => archivo)
    return { text: tarjetaGuardada(donde, vivo.idioma) }
  })

  on('command.run', { command: 'toki-por-que' }, async $ => ({ text: await textoDecisiones($) }))

  on('command.run', { command: 'toki-modelo' }, async ($, e) => {
    const x = xr()
    const arg = e.args.trim().toLowerCase()
    if (/^(deshacer|deshaz|undo)$/.test(arg)) {
      const ultima = ruta.historial[ruta.historial.length - 1]
      const antes = await deshacerEleccion($)
      if (antes === undefined || ultima === undefined) return { text: x.nadaQueDeshacer }
      return { text: x.deshacerHecho(nombreCorto(antes.modelo), x.esfuerzo[antes.esfuerzo], x.nivel[ultima.nivel]) }
    }
    if (/^(preguntar|siempre|autom[aá]tico|auto|no|off|apagado)$/.test(arg)) {
      ruta.modo = leerModo(arg)
      ruta.silenciado = false
      ruta.rechazos = 0
      ruta.preferencias = {}
      ruta.deshechos = {}
      guardia.ahorroHasta = 0
      // Apagado: de vuelta a tu modelo y tu esfuerzo desde el próximo pedido.
      if (ruta.modo === 'no') reiniciarRuta()
      await $.store.set(CLAVE_MODO_RUTA, ruta.modo).catch(() => undefined)
      $.ui.invalidate('ui.render')
      return { text: x.modoCambiado(x.modo[ruta.modo]) }
    }
    return { text: [...textoRuta(x, await read($, sesion)), '', x.uso].join('\n') }
  })

  // /model: aunque sea el mismo que ya tenías, lo elegiste tú.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const r = await next(e)
    await revisarModelo($)
    if (vivo.modelo !== undefined) elegisteModelo(vivo.modelo)
    $.ui.invalidate('ui.render')
    return r
  })

  // /effort: Toki planea tu próximo mensaje con el esfuerzo que elegiste.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const r = await next(e)
    try {
      await alElegirEsfuerzo($, e.args)
    } catch {
      // Lo dirá el primer pedido del próximo mensaje.
    }
    return r
  })

  on('command.run', { command: 'toki-sonnet' }, async ($, e) => {
    const x = xr()
    const xs = x.sonnet
    const arg = e.args.trim().toLowerCase().normalize('NFC')
    // «Actívalo o apágalo», como dice la ayuda: con tilde o sin ella.
    const prender = conAcentos(/^(s[ií]|on|act[ií]v\w*|yes|true|1|pr[eé]nd\w*|enc(?:i[eé]|e)nd\w*)$/).test(arg)
    const apagar = conAcentos(/^(no|off|ap[aá]g\w*|false|0|desact[ií]v\w*)$/).test(arg)
    if (prender || apagar) {
      ruta.sonnetPrimero = prender
      ruta.sonnetPausado = false
      // Otra manera de elegir: lo que Toki aprendió de tus respuestas empieza de cero.
      ruta.preferencias = {}
      ruta.silenciado = false
      ruta.rechazos = 0
      ruta.deshechos = {}
      await $.store.set(CLAVE_SONNET, prender).catch(() => undefined)
      $.ui.invalidate('ui.render')
      if (prender) return { text: [xs.activado, ...(ruta.modo === 'no' ? [xs.sinRuteo] : [])].join('\n') }
      // Apagado: de vuelta a tu modelo desde el próximo pedido.
      const vuelve = ruta.modeloPrincipal !== undefined && vivo.modelo !== undefined ? nombreCorto(vivo.modelo) : undefined
      ruta.modeloPrincipal = undefined
      return { text: xs.apagado(vuelve) }
    }
    const tuFamilia = familiaDe(vivo.modelo)
    const lineas = [`${xs.titulo}: ${xs.estado(ruta.sonnetPrimero)}${ruta.sonnetPrimero && ruta.sonnetPausado ? ` (${xs.pausa})` : ''}`]
    if (ruta.sonnetPrimero && ruta.modo === 'no') lineas.push(`  ${xs.sinRuteo}`)
    if (ruta.sonnetPrimero && vivo.modelo !== undefined && tuFamilia !== 'opus' && tuFamilia !== 'sonnet') lineas.push(`  ${xs.soloEsfuerzo(nombreCorto(vivo.modelo))}`)
    lineas.push(`  ${xs.conteo(ruta.mensajesEn.sonnet ?? 0, ruta.mensajesEn.opus ?? 0)}`, '', xs.explicacion, '', xs.uso)
    return { text: lineas.join('\n') }
  })

  on('command.run', { command: 'toki-entrevista' }, async ($, e) => {
    const x = xe()
    const arg = e.args.trim().toLowerCase()
    if (/^(auto|autom[aá]tic[oa]|preguntar|no|off|apagad[oa])$/.test(arg)) {
      entrevista.modo = leerModoEntrevista(arg)
      entrevista.silenciada = false
      entrevista.saltos = 0
      await $.store.set(CLAVE_ENTREVISTA, entrevista.modo).catch(() => undefined)
      return { text: x.modoCambiado(x.modos[entrevista.modo]) }
    }
    const s = (await read($, sesion)).entrevista ?? { con: 0, conCorr: 0, sin: 0, sinCorr: 0, consejos: 0 }
    return { text: [...x.estado(entrevista.modo, s), '', x.uso].join('\n') }
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
        ahorradoUsd: r.ahorro.neto,
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
    const ahorroChip = chipAhorro(x, s)
    const medidores = `${x.contexto} ${uso?.pct === undefined ? '—' : `${uso.pct}%`} · ${x.cache} ${relojCache(cacheRestante, ttl)} ${cacheRestante === undefined ? '—' : cacheRestante <= 0 ? x.frio : formatearMinutos(cacheRestante, vivo.idioma)} · ${ahorroChip.etiqueta} ${ahorroChip.valor}`
    const notas = notasAhorro(x, r)
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
          {cifra(ahorroChip.etiqueta === x.costoDeMas ? `${x.estaSesion} · ${x.costoDeMas}` : x.estaSesion, ahorroChip.valor, ahorroChip.color === 'warning' ? 'text' : 'success')}
          {cifra(x.hoy, cifraUsdFirmada(r.hoyUsd))}
          {cifra(x.dias7, cifraUsdFirmada(r.semanaUsd))}
          {cifra(x.dias30, cifraUsdFirmada(r.mesUsd))}
          {cifra(x.historico, cifraUsdFirmada(r.totalUsd), 'claude')}
        </Box>
        <Text dimColor wrap="wrap">
          {x.tokensLinea(formatearTokens(r.sesion.tokensAhorrados), formatearTokens(r.total), (r.sesion.relecturasEvitadas ?? 0) > 0 ? formatearTokens(r.sesion.relecturasEvitadas ?? 0) : undefined)}
        </Text>
        {notas.map(l => (
          <Text dimColor wrap="wrap">
            {l}
          </Text>
        ))}
        {r.desglose.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{x.desgloseTitulo}</Text>
            {r.desglose.map((l, i) => (
              <Text color={i === r.desglose.length - 1 && r.ahorro.gastado >= CENTAVO ? 'text' : 'success'} wrap="wrap">
                {'  '}
                {l}
              </Text>
            ))}
          </Box>
        )}
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
            {textoRuta(xr(), r.desglose.length > 0 ? undefined : r.sesion).map((l, i) =>
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
            {(r.sesion.relecturasEvitadas ?? 0) > 0 && r.desglose.length === 0 && (
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
              <Text color={f.tokens >= CENTAVO ? 'success' : 'inactive'} mono>
                {f.barra}
              </Text>
              <Text dimColor={!f.esHoy} color={f.tokens <= -CENTAVO ? 'warning' : undefined}>
                {f.valor}
              </Text>
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
        ahorradoUsd: resumenAhorro(s).neto,
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
    // ✓: la API confirmó que respondió el modelo que Toki pidió.
    const modeloChip = ruta.modeloPrincipal !== undefined ? `${nombreCorto(ruta.modeloPrincipal)}${ruta.confirmado === ruta.modeloPrincipal ? ' ✓' : ''}` : undefined
    const partesChip = [modeloChip, esfuerzoToki !== undefined ? xr().esfuerzo[esfuerzoToki] : undefined].filter((p): p is string => p !== undefined)
    const ahorroChip = chipAhorro(x, s, angosto)
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
          <Text color={ahorroChip.color}>
            {ahorroChip.etiqueta === x.costoDeMas ? `${x.costoDeMas} ${ahorroChip.valor}` : `${ahorroChip.valor} ${x.ahorrados}`}
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
      // Una sola cifra: el desglose (relecturas, recortes, modelo) está en /toki.
      chip('ahorrado', [
        <Text dimColor>· {ahorroChip.etiqueta}</Text>,
        <Text color={ahorroChip.color} bold>
          {ahorroChip.valor}
        </Text>,
      ]),
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
              {uso?.costo !== undefined && !uso.esSuscripcion ? ` · $${uso.costo.toFixed(2)}` : ''} · {x.historico} {totalAhorrado() ?? '$0.00'} · /toki
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
