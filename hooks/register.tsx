// Toki: tu acompañante de ahorro de tokens para Claude Code. Cada token cuenta.
// Corre dentro de Claude Code como mod: cero instrucciones fijas en el contexto,
// cero dependencias, y si algo falla, Claude sigue trabajando normal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderNode, ResolveInput, ToolCallResult, TurnStepInput, TurnUsage } from 'claude-code'

import type { Sesion } from '../types'
import {
  ahorroBreve,
  CADA_TESTIGO,
  CENTAVO,
  cifraUsd,
  cifraUsdDia,
  cifraUsdFirmada,
  claveEsfuerzo,
  COMIENZO_TIPICO,
  contarCandidato,
  costoClasificador,
  costoSeccionBreve,
  costoSinTokiPedido,
  esPedidoPrevio,
  estimarAhorroPrevio,
  factorCalibrado,
  leerCalibracion,
  leidoSinToki as leidoCacheSinToki,
  resumenAhorro,
  SALIDA_BREVE,
  salidaEvitadaBreve,
  salidaMedida,
  sumarACalibracion,
  TESTIGOS_META,
  tocaTestigo,
  valorEscritura,
  valorLectura,
} from './ahorro'
import type { CalibracionEsfuerzo, CeldaEsfuerzo, GrupoMedido, PedidoPrevio, UsoMedido } from './ahorro'
import { breveActivo, decidirBreve, ID_BREVE, SECCION_BREVE } from './breve'
import type { DecisionBreve } from './breve'
import { avisoBucle, registrar, UMBRAL_FALLOS } from './bucles'
import { debeMantenerCache, evaluarPing } from './cache'
import {
  compactar,
  salidaMcp,
  esMcpRuidosa,
  encabezado,
  esCorta,
  esRuidoso,
  porQueNoCompactable,
  rescatarErrores,
  separarCorte,
  agrandarCorte,
  caracteresRecortados,
  LIMITES,
  LIMITES_CUIDADO,
  TOPE_CORTE,
  tokensAprox,
  ultimasLineas,
} from './compresor'
import type { Compactado, LimitesCompactacion } from './compresor'
import {
  anotarOportunidad,
  aprendidas,
  enteraHasta,
  familiaDeComando,
  leerAprendizaje,
  leerExtras,
  leerOportunidades,
  mejoresOportunidades,
  nivelDe,
  normalizarFamilia,
  olvidar,
  textosFamilias,
  trasAbrir,
  trasCompactar,
  trasLeerEntera,
} from './familias'
import type { Aprendizaje, CambioFamilia, NivelFamilia, Oportunidad, Oportunidades, TextosFamilias } from './familias'
import { detectarEmpresa, DIAS_REVISION_EMPRESA, leerEstadoEmpresa, OPCION_EMPRESA, revisarEmpresa, terminarRevision } from './empresa'
import type { EstadoEmpresa } from './empresa'
import { anotar as anotarReescritura, clasificarEscritura, conSesion, costoReescritura, leerCachePorSesion, leerLibro, lineaReescritura, porCausa, totalLibro } from './escrituras'
import type { LibroCache, PedidoCache } from './escrituras'
import { agregarAlRegistro, agregarLeccion, filasGrafica, fusionarHistorial, hayAhorro, leccionCambioModelo, LOGROS, logrosNuevos, nombreModelo, racha, sumarAlDia, totalDesde } from './historial'
import type { Historial, Leccion, Logro } from './historial'
import { detectarIdioma, idiomaDeTexto, quitarEtiquetasDeSistema, t } from './idioma'
import type { Idioma, Textos } from './idioma'
import { avisoMapa, CARPETAS_IGNORADAS, construirMapa, esBusqueda, extraerFicha, extraerFrameworks, leeDetector, lenguaje, LIMITES_MAPA, RUTA_MAPA } from './mapa'
import type { FichaArchivo, FichaFramework } from './mapa'
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
  leerPedidosMedidos,
  limpiarPrompt,
  modeloCanonico,
  modeloSubagente,
  NIVELES,
  nivelHeuristico,
  nombreCorto,
  PEDIDOS_PARA_SUBIR,
  PEDIDOS_POR_NIVEL,
  pedidosEsperados,
  PESO_FABRICA,
  proponer,
  sumarPedidos,
  terminaEnPregunta,
  textoDiferencia,
  textosRuta,
  usaEsfuerzoHeredado,
  usd as usdTexto,
} from './modelo'
import { EXPLORACION_VACIA, pasoExploracion, sumarPaso, tocaDelegar } from './exploracion'
import { anotarRespuesta, CADA_PREGUNTA, calidadVacia, esBajado, GRUPOS_CALIDAD, leerCalidad, marcarPregunta, sumarMensaje, sumarSiguiente, tocaPreguntar } from './calidad'
import type { Calidad, GrupoCalidad, RespuestaCalidad } from './calidad'
import type { Exploracion } from './exploracion'
import type { Decision as DecisionMensaje, Esfuerzo, EstadoRuta, Familia, ModoRuta, Motivo as MotivoRuta, Nivel, Opcion, PedidosMedidos, Propuesta, ResultadoRuta, TextosRuta, TipoOpcion } from './modelo'
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
  devolver,
  sumarPedido,
  tamanoDelPedido,
  topeLimpio,
  totalGasto,
} from './gasto'
import type { Gasto, Limpio, Relecturas, Repetida, Temprana, UsoPedido } from './gasto'
import { anilloSvg, tokiSvg } from './toki-svg'
import { TRAMO_GENERADO, textosGenerados, tipoGenerado } from './generados'
import { PEGADO, recortarPegado, textosPegado } from './pegados'
import { resumirBusqueda, tipoBusqueda } from './busquedas'
import type { TipoBusqueda } from './busquedas'
import { conAcentos } from './palabras'
import {
  anotarUso,
  armarDieta,
  arreglos,
  cifraFina,
  cmdDieta,
  DIAS_SIN_USO,
  esDiferido,
  leerDiferidos,
  leerRespaldos,
  leerUsoMcp,
  leerUsoSkills,
  mcpSinUso,
  medirTexto,
  nombreSkill,
  OPCION_DIFERIDOS,
  pedidoMemoria,
  textoDieta,
  txDieta,
} from './dieta'
import type { ArchivoMemoria, Arreglos, Dieta, OpcionesDieta } from './dieta'
import { activarTtl, anotarPaso, fueraTtl, juntarDias, leerEstadoTtl, medirPaso, prendida, quitarTtl, revisarTtl, textoTtl, txTtl, veredicto as veredictoTtl } from './subagentes'
import type { Capa, DiasTtl, EstadoTtl, Fuera, Regimen } from './subagentes'
import { anotarTarea, CADA, elegir as elegirAyuda, leerTestigos, lineaCierre, reanudar as reanudarAyudas, textoTestigos, txTestigos, vence } from './testigos'
import type { Ayuda, Brazo, Cierre, Intervencion } from './testigos'
import { comandoScript, contarScript, contenidoScript, marcarGuardado, nombreScript, rutaScript, scriptCorrido, SCRIPTS_VACIO, txScripts } from './scripts'
import type { Scripts } from './scripts'
import { avisoSemana, CONTEXTO_LARGO, fecha as fechaCorta, leerSemanas, lunesDe, sumarSemana, tarjetaGuardada, tarjetaNoGuardada, tarjetaPendiente, tarjetaSemana } from './semana'
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
  esTareaNueva,
  evaluarEntrevista,
  FRENOS_ENTREVISTA,
  frenaAntesDePreguntar,
  leerModoEntrevista,
  retomaLoAnterior,
  RUTA_SPEC,
  SALTOS_PARA_CALLAR,
  textosEntrevista,
  VECES_POR_CONSEJO,
} from './entrevista'
import type { Consejo, ModoEntrevista, PorQueEntrevistar, TextosEntrevista } from './entrevista'
import {
  ARCHIVOS_DE_COMPROBACION,
  CARPETAS_PARA_PREGUNTAR,
  comprobacionesDe,
  contarRespuesta,
  criterioDeSpec,
  esCarpetaDeBusqueda,
  esLaTarea,
  esRaizDeProyecto,
  estaCallada,
  leerEstadoPreguntas,
  opcionesDonde,
  opcionesFallos,
  opcionesListo,
  partirTareas,
  PCT_PARA_RECORDAR,
  pideDonde,
  pideListo,
  textosPreguntas,
  TIPOS_PREGUNTA,
} from './preguntas'
import type { Carpeta, EstadoPreguntas, Tarea, TextosPreguntas, TipoPregunta } from './preguntas'
import { agregarMuestra, claveVentana, DURACION, evaluarCacheFrio, FRIO, hora, opcionesFrio, preguntaFrio, proyectar, textosGuardia, VENTANAS } from './guardia'
import type { Muestra, OpcionLimite, Proyeccion, TextosGuardia, VentanaLimite } from './guardia'

/** Cambia en cada versión: así Claude Code recompila el módulo al recargar. */
export const VERSION = '0.17.6'

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
/** Lo que dejó en el caché el último pedido de cada sesión: al reanudarla se mide contra eso. */
const CLAVE_CACHE_SESIONES = 'cachePorSesion'
const CLAVE_SEMANAS = 'semanas'
const CLAVE_TARJETA = 'tarjetaSemanalMostrada'
/** El valor que Toki puso en la variable, para no confundirlo con uno tuyo. */
const CLAVE_VENTANA = 'ventanaPuestaPorToki'
/** La ventana que Claude Code usaría sin Toki, por modelo. */
const CLAVE_VENTANA_NATIVA = 'ventanaNativa'
/** Ya se avisó (una vez, desde siempre) que Toki pide respuestas breves. */
const CLAVE_AVISO_BREVE = 'avisoBreveDado'
const CLAVE_AVISO_SIN_SECCION = 'avisoSinSeccionDado'
/** Lo que Toki recuerda del guardia de empresa (EstadoEmpresa). */
const CLAVE_EMPRESA = 'guardiaEmpresa'
/** Lo aprendido por familia de comando (Aprendizaje) y las salidas largas que Toki no compactó (Oportunidades). */
const CLAVE_FAMILIAS = 'familiasAprendidas'
const CLAVE_OPORTUNIDADES = 'oportunidadesPerdidas'
/** La caché de los subagentes: lo medido por día, si Toki la tiene en 1 hora y si ya avisó (EstadoTtl). */
const CLAVE_TTL = 'cacheSubagentes'
/** La opción «Compactar también»: familias que Toki compacta aunque no sean de su lista. */
const OPCION_TAMBIEN = 'compactarTambien'
const RANURAS = 40
/** Lo que Claude Code entrega de una salida exitosa sin ayuda: 30 KB. */
const LIMITE_CLAUDE_CODE = 30_000
/** Si pasa de eso, Claude Code la guarda en un archivo y muestra una vista previa de ~2 KB. */
const VISTA_PREVIA_CLAUDE_CODE = 2200
const HORAS_MAPA_VIGENTE = 24
/** Por debajo de esto, una compactación o un cambio de modelo cuestan poco: Toki no avisa. */
const CONTEXTO_RELEVANTE = 20_000
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
  guardarScripts: true,
  avisoCacheFrio: true,
  guardiaLimites: true,
  guardiaGenerados: true,
  guardiaPegados: true,
  busquedas: true,
  /** El guardia de empresa se salta prompt.compose y otros hooks: Toki no los registra. */
  guardiaEmpresa: false,
  /** Servidores MCP que Toki deja tras ToolSearch (/toki-dieta mcp). */
  mcpDiferidos: [] as string[],
  /** Familias de comandos que Toki compacta aunque no sean de su lista (/toki-por-que las propone). */
  compactarTambien: [] as string[],
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
  /** Los últimos límites guardados o leídos del store, y cuándo se leyeron. */
  limitesGuardados?: Limites
  limitesLeidos: number
  avisoLimitesAjenos: boolean
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
  /** Búsquedas y lecturas seguidas del turno, sin editar ni delegar. */
  exploracion: Exploracion
  /** Se sugirió delegar la exploración (una vez por conversación) y si Claude lo hizo. */
  avisoExploracion?: 'dado' | 'seguido'
  /** Lecturas enteras pedidas por archivo generado: 1 = frenada, 2 = tramo, 3+ = entera. */
  generadosFrenados: Map<string, number>
  /** Comandos largos que corrieron igual más de una vez, y los que Toki guardó como archivo. */
  scripts: Scripts
  /** Los originales que Toki archivó al compactar, por ruta: si Claude los lee, se descuenta. */
  archivados: Map<string, Archivado>
  /** Herramientas MCP y comandos cuyo original Claude tuvo que leer: ya no se compactan en esta sesión. */
  sinCompactar: Set<string>
  salidasGrandesEnTurno: number
  modelo?: string
  modeloUltimoTurno?: string
  /** El modelo que respondió el último pedido del hilo principal (puede ser el que Toki eligió para este mensaje). */
  modeloEnUso?: string
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
  /** Lo que el último pedido de esta conversación dejó en el caché: contra él se mide si el siguiente lo reescribió. */
  cachePrevio?: PedidoCache
  /** Cuándo un ping de Toki leyó el caché por última vez. */
  ultimoPing?: number
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
  /** prompt.compose corrió en esta activación: el guardia de empresa no lo salta. */
  composeVisto: boolean
  /** El último turno principal que esta activación vio empezar: uno visto a medias no prueba nada. */
  turnoVisto?: string
  /** Ya se intentó prender «Guardia de empresa» en esta activación. */
  empresaIntentada: boolean
  /** Ya se revisó el plazo de «Guardia de empresa» en esta activación. */
  empresaRevisada: boolean
  /** Lo que Toki recuerda del guardia de empresa, leído al empezar. */
  empresa: EstadoEmpresa
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
  limitesLeidos: 0,
  avisoLimitesAjenos: false,
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
  exploracion: EXPLORACION_VACIA,
  generadosFrenados: new Map<string, number>(),
  scripts: SCRIPTS_VACIO,
  archivados: new Map<string, Archivado>(),
  sinCompactar: new Set<string>(),
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
  composeVisto: false,
  empresaIntentada: false,
  empresaRevisada: false,
  empresa: {},
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
  const ruta = `${CARPETA}/salidas/salida-${String(n).padStart(2, '0')}.txt`
  // La ranura se reusa: lo que guardaba antes ya no es de ninguna compactación.
  vivo.archivados.delete(ruta)
  return ruta
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

/** Un `| tail` que Toki rehace: el comando que corre en su lugar, cuántas líneas habría visto Claude y con qué programa. */
type Corte = { comando: string; lineas: number; programa: string }

/**
 * Un test o build cortado con `| tail` (o `| Select-Object -Last N`): corre con el corte
 * agrandado a TOPE_CORTE líneas y Toki corta después (rehacerCorte). Solo si el comando nuevo
 * tiene la misma decisión de permisos que el original: nunca genera una pregunta nueva.
 */
async function planearCorte($: $, herramienta: 'Bash' | 'PowerShell', comando: string): Promise<Corte | undefined> {
  const powershell = herramienta === 'PowerShell'
  const partes = separarCorte(comando, powershell)
  if (partes === undefined || partes.lineas >= TOPE_CORTE || !(esRuidoso(partes.base) || config.compactarTambien.includes(familiaDeComando(partes.base)))) return undefined
  try {
    const original = await decisionDePermiso($, herramienta, comando)
    if (original === 'deny') return undefined
    const nuevo = `${partes.base} | ${agrandarCorte(partes.filtro, TOPE_CORTE)}`
    const permiso = await decisionDePermiso($, herramienta, nuevo)
    $.ui.log(`corte (${herramienta}): original=${original} agrandado=${permiso}`, { to: 'debug' })
    if (permiso === original) return { comando: nuevo, lineas: partes.lineas, programa: powershell ? 'Select-Object -Last' : 'tail' }
  } catch (err) {
    $.ui.log(`corte falló: ${String(err)}`, { to: 'debug' })
  }
  return undefined
}

/** La decisión de permisos de Claude Code para un comando (allow, ask o deny). */
async function decisionDePermiso($: $, herramienta: 'Bash' | 'PowerShell', command: string): Promise<string> {
  // PowerShell existe en Windows (o con CLAUDE_CODE_USE_POWERSHELL_TOOL), pero los tipos solo nombran Bash.
  const r = herramienta === 'Bash' ? await $.tool.check({ tool: 'Bash', input: { command } }) : await $.tool.check({ tool: 'PowerShell', input: { command } } as never)
  return String((r as { decision?: unknown }).decision)
}

/**
 * La salida entera. Claude Code guarda en un archivo la que pasa de su límite y entrega solo el
 * comienzo: se lee de ahí. Nada si no se puede leer (más de 4 MiB).
 */
async function salidaEntera<T extends SalidaShell>($: $, r: T): Promise<T | undefined> {
  if (r.persistedOutputPath === undefined) return r
  try {
    return { ...r, stdout: await $.fs.read(r.persistedOutputPath) }
  } catch {
    return undefined
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
async function sumarAhorro(
  $: $,
  caracteres: number,
  comando: string,
  agente: string | undefined,
  tipo: TipoAhorro = 'salida',
  archivo?: { ruta: string; caracteres: number; familia?: string; nivel?: NivelFamilia },
): Promise<void> {
  // Si después Claude lee el original archivado, lo leído se descuenta (contarRecuperacion).
  if (archivo !== undefined) vivo.archivados.set(archivo.ruta, { origen: comando.trim(), tipo, caracteres: archivo.caracteres, leidos: 0, familia: archivo.familia, nivel: archivo.nivel })
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

/**
 * prompt.compose no corre (Claude Code lo administra tu organización, u otro plugin lo frenó):
 * sin la sección, lo mismo va como nota a Claude, y otra vez tras compactar. Con «Guardia de
 * empresa» va antes de tu primer mensaje; si Toki recién nota el guardia, después de él.
 * Si elegiste un estilo, se respeta. Una vez (desde siempre) sugiere el estilo Concise de Claude
 * Code, que no depende de hooks y, medido, corta tanto como la sección; la nota, mucho menos
 * (evals/modo-breve). Lo que ahorre la nota no se cuenta: no se puede medir contra la sección.
 */
async function respaldoBreve($: $): Promise<void> {
  vivo.nudgeConciso = true
  const estilo = await estiloDeConfiguracion($)
  void anotarDiagnostico($, `respuestas breves: sin prompt.compose, ${estilo === undefined ? 'van como nota' : `estilo ${estilo}`}`)
  if (estilo !== undefined) return
  const x = tx()
  await notaParaClaude($, x.notaConciso)
  try {
    if ((await $.store.get(CLAVE_AVISO_SIN_SECCION)) === true) return
    await $.store.set(CLAVE_AVISO_SIN_SECCION, true)
    $.ui.toast(x.toastConciso, { timeoutMs: 10_000 })
  } catch {
    // Sin store: no se avisa, para no repetirlo en cada sesión.
  }
}

/**
 * Con «Guardia de empresa» prendida Toki ya sabe que prompt.compose no corre: la nota va antes
 * de tu primer mensaje, no después. Si ya se mandó en esta conversación antes de recargar el
 * plugin, no se repite.
 */
async function notaAntesDelMensaje($: $): Promise<void> {
  if (!config.guardiaEmpresa || !config.conciso || vivo.nudgeConciso) return
  try {
    const id = await $.session.id()
    if (id !== undefined && leerEstadoEmpresa(await $.store.get(CLAVE_EMPRESA)).nota === id) {
      vivo.nudgeConciso = true
      return
    }
  } catch {
    // Sin id ni store: la nota va.
  }
  await respaldoBreve($)
}

/**
 * Hay alguien mirando: la terminal o la app (que llega con isInteractive en false). Un -p o una
 * eval no: ahí Toki no cambia tu configuración.
 */
async function hayAlguien($: $): Promise<boolean> {
  return ruta.interactivo || (await $.session.surfaces().catch(() => [])).length > 0
}

/**
 * Cambia una opción de Toki como si lo hicieras en /plugin; Claude Code recarga el plugin.
 * Devuelve por qué no se pudo, o nada si se pudo.
 */
async function cambiarOpcion($: $, campo: string, valor: boolean | string): Promise<string | undefined> {
  const propia = `${$.plugin.name}.${campo}`
  let clave = propia
  try {
    clave = (await $.config.list()).find(f => f.key === propia || (f.key.endsWith(`.${campo}`) && f.provider.plugin === $.plugin.name))?.key ?? propia
  } catch {
    // Sin la lista: la clave de siempre.
  }
  try {
    return (await $.config.set({ key: clave, value: valor })).deny
  } catch (err) {
    return String(err)
  }
}

/** Cambia «Guardia de empresa»; devuelve si se pudo. */
async function cambiarOpcionEmpresa($: $, valor: boolean): Promise<boolean> {
  const motivo = await cambiarOpcion($, OPCION_EMPRESA, valor)
  if (motivo !== undefined) void anotarDiagnostico($, `guardia de empresa: Claude Code no dejó ${valor ? 'prender' : 'apagar'} la opción (${motivo})`)
  return motivo === undefined
}

/**
 * Una vez por activación, con alguien mirando (al empezar, al recargar tras cambiar la opción o,
 * si la app aún no se veía, al final del primer mensaje): corre el plazo de «Guardia de empresa»,
 * la apaga cumplidos los 30 días para ver si el guardia sigue y avisa si Toki la prendió.
 */
async function revisarGuardiaEmpresa($: $, ahora: number): Promise<void> {
  vivo.empresaRevisada = true
  try {
    const antes = leerEstadoEmpresa(await $.store.get(CLAVE_EMPRESA))
    const r = revisarEmpresa(antes, config.guardiaEmpresa, ahora)
    const { nota, ...estado } = r.estado
    // La nota de respuestas breves se mandó en esta conversación antes de recargar: no se repite.
    if (nota !== undefined && nota === (await $.session.id().catch(() => undefined))) vivo.nudgeConciso = true
    vivo.empresa = estado
    if (JSON.stringify(estado) !== JSON.stringify(antes)) await $.store.set(CLAVE_EMPRESA, estado)
    if (r.avisar) $.ui.toast(tx().toastEmpresa, { timeoutMs: 12_000 })
    if (r.apagar) {
      void anotarDiagnostico($, `guardia de empresa: ${DIAS_REVISION_EMPRESA} días con la opción prendida; Toki la apaga para ver si sigue`)
      // Fuera de session.start: cambiar la opción recarga el plugin.
      $.clock.after(1_000, () => void cambiarOpcionEmpresa($, false))
    }
  } catch {
    // Sin store: la opción queda como está.
  }
}

/**
 * Un turno entero sin prompt.compose: el guardia de empresa se salta los hooks de Toki y le
 * avisa a Claude cada vez. Toki prende «Guardia de empresa»: al recargar ya no los registra.
 */
async function prenderGuardiaEmpresa($: $, ahora: number): Promise<void> {
  const antes = vivo.empresa
  try {
    // La nota de respuestas breves ya va en esta conversación: al recargar no se repite.
    const nota = vivo.nudgeConciso ? await $.session.id().catch(() => undefined) : undefined
    await $.store.set(CLAVE_EMPRESA, detectarEmpresa(antes, ahora, nota))
    void anotarDiagnostico($, 'guardia de empresa: prompt.compose no corrió en un turno entero; Toki prende la opción')
    if (await cambiarOpcionEmpresa($, true)) return
    vivo.empresa = { ...antes, negada: true }
    await $.store.set(CLAVE_EMPRESA, vivo.empresa)
    if (antes.negada !== true) $.ui.toast(tx().toastEmpresaNegada, { timeoutMs: 12_000 })
  } catch {
    // Sin store ni sesión: se intenta en la próxima sesión.
  }
}

/** El estilo de respuesta que elegiste (/output-style lo guarda en tu configuración), si no es el de siempre. */
async function estiloDeConfiguracion($: $): Promise<string | undefined> {
  try {
    for (const source of FUENTES_DE_CONFIGURACION) {
      const estilo: unknown = (await $.settings.read({ source })).outputStyle
      if (typeof estilo === 'string' && estilo !== '') return estilo.toLowerCase() === 'default' ? undefined : estilo
    }
  } catch {
    // Sin configuración: como si no hubiera estilo.
  }
  return undefined
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
 * `reescritoPorToki`: lo que un cambio de esfuerzo de Toki hizo reescribir; sin Toki se habría leído.
 * `releidoPorToki`: en un subagente con la caché de 1 hora de Toki, lo que ella dejó leer.
 */
function medirPedido(
  e: TurnStepInput,
  pedido: TurnStepInput,
  u: TurnUsage,
  sin: Familia,
  ahora: number,
  reescritoPorToki = 0,
  releidoPorToki?: number,
): { real: number; sin: number } {
  const familia = familiaDe(u.model) ?? familiaDe(pedido.model) ?? 'opus'
  const uso: UsoMedido = { entrada: u.input_tokens, leido: u.cache_read_input_tokens, escrito: u.cache_creation_input_tokens, salida: u.output_tokens }
  if (e.agentId !== undefined) {
    // Un subagente empieza de cero con o sin Toki: mismo caché, otro modelo. A precio de 5 min, para no inflar;
    // con la caché de 1 hora de Toki, a ese precio, y sin Toki se habría reescrito lo que ella dejó leer.
    const c =
      releidoPorToki === undefined
        ? { real: costoMedido(familia, uso, false), sin: costoSinTokiPedido({ familia: sin, uso, ttl1h: false }) }
        : { real: costoMedido(familia, uso, true), sin: costoSinTokiPedido({ familia: sin, uso, ttl1h: false, leido: uso.leido - releidoPorToki }) }
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
  // Al bajar el esfuerzo: cuánta más salida habría escrito el tuyo, con lo que miden los testigos de ese tipo de mensaje.
  const fSalida = factorCalibrado(e.effort, pedido.effort, celdaDelPedido(e, pedido))
  const c = { real: costoMedido(familia, uso, ttl1h), sin: costoSinTokiPedido({ familia: sin, uso, ttl1h, factorSalida: fSalida, leido: leido + reescritoPorToki }) }
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
      if (tareaAbierta !== undefined) tareaAbierta.usd += real
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

/** Lo que dejó en el caché el último pedido de esta sesión: si la reanudas, el primero se mide contra eso. */
async function guardarCacheSesion($: $): Promise<void> {
  const c = vivo.cachePrevio
  if (c === undefined) return
  try {
    const id = await $.session.id()
    await $.store.set(CLAVE_CACHE_SESIONES, conSesion(leerCachePorSesion(await $.store.get(CLAVE_CACHE_SESIONES)), id, c))
  } catch {
    // Al reanudarla, su primer pedido no se mide.
  }
}

/**
 * ¿Este pedido del hilo principal volvió a escribir lo que ya estaba en el caché? Lo anota con
 * su causa probable y lo que costó de más, en la sesión, la semana y el diagnóstico. Si fue por
 * un cambio de esfuerzo de Toki, Toki deja de cambiarlo en esta sesión y devuelve esos tokens:
 * sin Toki se habrían leído del caché.
 */
async function anotarEscritura($: $, e: TurnStepInput, pedido: TurnStepInput, u: TurnUsage, salida: number): Promise<number> {
  const previo = vivo.cachePrevio
  const actual: PedidoCache = { cacheado: u.cache_read_input_tokens + u.cache_creation_input_tokens, modelo: u.model ?? pedido.model, cuando: salida }
  if (pedido.effort !== undefined) actual.esfuerzo = String(pedido.effort)
  if (pedido.model !== e.model) actual.modeloToki = true
  if (pedido.effort !== e.effort) actual.esfuerzoToki = true
  vivo.cachePrevio = actual
  // /clear borra la última compactación: si la hay después del pedido anterior, se compactó.
  const limpio = !vivo.trasLimpiar ? undefined : vivo.ultimaCompactacion > (previo?.cuando ?? 0) ? 'compactacion' : 'clear'
  const r = clasificarEscritura({
    previo,
    actual,
    leido: u.cache_read_input_tokens,
    escrito: u.cache_creation_input_tokens,
    limpio,
    comienzo: vivo.prefijoSistema ?? COMIENZO_TIPICO,
    ttlMs: ttlMs(),
    ultimoPing: vivo.ultimoPing,
  })
  if (r === undefined || previo === undefined) return 0
  const usd = costoReescritura(r.tokens, familiaDe(actual.modelo) ?? 'opus', ttl1hSesion(), actual.cacheado)
  await update($, sesion, s => ({ ...s, reescrito: anotarReescritura(leerLibro(s.reescrito), r.causa, r.tokens, usd) }))
  await alaSemana($, { reescritura: { causa: r.causa, tokens: r.tokens, usd } })
  void anotarDiagnostico($, lineaReescritura(r, previo, actual, usd))
  if (r.causa !== 'esfuerzo') return 0
  // Con este modelo y proveedor, cambiar el esfuerzo vacía el caché (aunque lo hayas cambiado tú): Toki deja de cambiarlo.
  if (!ruta.esfuerzoRompe) {
    ruta.esfuerzoRompe = true
    void anotarDiagnostico($, 'esfuerzo: aquí cambiarlo reescribe el caché; Toki deja el tuyo en esta sesión')
    if (r.porToki === true) $.ui.toast(xr().esfuerzoReescribe, { timeoutMs: 8000 })
  }
  return r.porToki === true ? r.tokens : 0
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

// ---------- Caché de los subagentes ----------

/**
 * Lo que Toki lleva de la caché de los subagentes en este proceso (la variable vive en él):
 * con qué caché se mide (nada si no la toca), si la variable es de Toki, lo medido sin
 * guardar y lo que dejó en el caché el último pedido de cada subagente y de cada tipo.
 */
const ttlSub: {
  regimen?: Regimen
  puesta: boolean
  fuera?: Fuera
  porGuardar: DiasTtl
  agentes: Map<string, Capa>
  grupos: Map<string, { ms: number; primero?: number }>
  tipos: Map<string, string>
} = { puesta: false, porGuardar: {}, agentes: new Map(), grupos: new Map(), tipos: new Map() }

/** Anota en un mapa que olvida lo más viejo pasado cierto tamaño. */
function recordarEn<V>(mapa: Map<string, V>, clave: string, valor: V, maximo = 200): void {
  mapa.delete(clave)
  mapa.set(clave, valor)
  if (mapa.size <= maximo) return
  const primero = mapa.keys().next().value
  if (primero !== undefined) mapa.delete(primero)
}

/** Qué deja tocar la caché de los subagentes: la versión, el proveedor y lo que fijaste tú. */
async function entornoTtl($: $, e: EstadoTtl): Promise<Fuera | undefined> {
  const env = (leer: () => Promise<string | undefined>) => leer().catch(() => undefined)
  const version = await $.session.version().then(
    v => v.version,
    () => undefined,
  )
  const ajuste = await $.settings.read({ key: 'subagentPromptCacheTtl' }).catch(() => undefined)
  const variable = await env(() => $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL'))
  const otras = [
    { nombre: 'FORCE_PROMPT_CACHING_5M', valor: await env(() => $.env.get('FORCE_PROMPT_CACHING_5M')) },
    { nombre: 'ENABLE_PROMPT_CACHING_1H', valor: await env(() => $.env.get('ENABLE_PROMPT_CACHING_1H')) },
    { nombre: 'DISABLE_PROMPT_CACHING', valor: await env(() => $.env.get('DISABLE_PROMPT_CACHING')) },
  ]
  const proveedores = [await env(() => $.env.get('CLAUDE_CODE_USE_BEDROCK')), await env(() => $.env.get('CLAUDE_CODE_USE_VERTEX')), await env(() => $.env.get('CLAUDE_CODE_USE_FOUNDRY'))]
  // La de Toki: la puso en este proceso o, si se perdió la cuenta, es la que deja su activación. Con otro valor ya no es suya.
  ttlSub.puesta = variable === '1h' && (ttlSub.puesta || e.activa !== undefined)
  return fueraTtl({ version, ajuste, variable, puestaPorToki: ttlSub.puesta, otras, proveedor: proveedores.some(prendida) })
}

/** Pone la caché de 1 hora; devuelve por qué no se pudo, o nada. */
async function ponerTtl($: $): Promise<string | undefined> {
  try {
    const r = await $.env.set('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', '1h')
    if (r.deny !== undefined) return r.deny
  } catch (err) {
    return String(err)
  }
  ttlSub.puesta = true
  return undefined
}

/** Quita la variable si es de Toki: los subagentes vuelven a 5 minutos. */
async function soltarTtl($: $): Promise<void> {
  if (!ttlSub.puesta) return
  ttlSub.puesta = false
  await $.env.set('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', undefined).catch(() => undefined)
}

/**
 * Al empezar: si fijaste tú la caché, Toki no la toca ni la mide (y suelta la suya). Si no,
 * revisa si la de Toki paga y, si la activaste y sigue, la pone otra vez (la variable dura lo
 * que el proceso).
 */
async function iniciarTtl($: $, ahora: number): Promise<void> {
  ttlSub.regimen = undefined
  try {
    const e = leerEstadoTtl(await $.store.get(CLAVE_TTL))
    ttlSub.fuera = await entornoTtl($, e)
    if (ttlSub.fuera !== undefined) {
      await soltarTtl($)
      if (ttlSub.fuera.motivo === 'tuya' && e.activa !== undefined) {
        await $.store.set(CLAVE_TTL, quitarTtl(e, ahora, 'tuya'))
        void anotarDiagnostico($, `subagentes: la caché la fija ${ttlSub.fuera.nombre}; Toki suelta la suya`)
      }
      return
    }
    ttlSub.regimen = ttlSub.puesta ? 'l' : 'c'
    const revisado = (await guardarTtl($, ahora, false)) ?? e
    if (revisado.activa === undefined) await soltarTtl($)
    else {
      const motivo = await ponerTtl($)
      if (motivo !== undefined) void anotarDiagnostico($, `subagentes: no se pudo poner la caché de 1 h (${motivo})`)
    }
    ttlSub.regimen = ttlSub.puesta ? 'l' : 'c'
  } catch {
    // Sin store: no se mide.
  }
}

/**
 * Guarda lo medido y revisa: puesta por Toki y sin pagar en 14 días, la quita; sin poner y
 * si conviene, lo avisa una vez (con alguien mirando). Devuelve cómo quedó, si se pudo leer.
 */
async function guardarTtl($: $, ahora: number, avisar: boolean): Promise<EstadoTtl | undefined> {
  if (ttlSub.regimen === undefined) return undefined
  const nuevo = ttlSub.porGuardar
  ttlSub.porGuardar = {}
  try {
    const antes = leerEstadoTtl(await $.store.get(CLAVE_TTL))
    const r = revisarTtl({ ...antes, dias: juntarDias(antes.dias, nuevo, ahora) }, ahora, avisar && (await hayAlguien($)))
    if (Object.keys(nuevo).length > 0 || r.quitar || r.avisar) await $.store.set(CLAVE_TTL, r.estado)
    const x = txTtl(vivo.idioma)
    if (r.quitar) {
      await soltarTtl($)
      ttlSub.regimen = 'c'
      const mas = cifraUsd(-(r.estado.quitada?.neto ?? 0))
      void anotarDiagnostico($, `subagentes: caché de 1 h quitada, costó ${mas} más de lo que ahorró`)
      if (await hayAlguien($)) $.ui.toast(x.avisoQuitada(mas), { timeoutMs: 12_000 })
    }
    if (r.avisar) {
      const m = veredictoTtl(r.estado.dias, ahora).medida
      void anotarDiagnostico($, `subagentes: conviene la caché de 1 h (${m.pedidos} pedidos, ahorro ${cifraUsd(m.ahorro)}, prima ${cifraUsd(m.prima)})`)
      $.ui.toast(x.aviso(cifraUsd(m.ahorro - m.prima)), { timeoutMs: 10_000 })
    }
    return r.estado
  } catch {
    // Lo medido vuelve a la fila para la próxima.
    ttlSub.porGuardar = juntarDias(nuevo, ttlSub.porGuardar, ahora)
    return undefined
  }
}

/**
 * Un pedido de subagente medido con una y otra caché. Devuelve lo que la caché de 1 hora de
 * Toki dejó leer en vez de reescribir; nada si no está puesta.
 */
function medirCacheSubagente(agente: string, u: TurnUsage, familia: Familia, ms: number): number | undefined {
  const leido = u.cache_read_input_tokens
  const escrito = u.cache_creation_input_tokens
  // Los del mismo tipo y modelo comparten el comienzo (instrucciones y herramientas); sin tipo, cada uno el suyo.
  const clave = `${ttlSub.tipos.get(agente) ?? agente}|${familia}`
  const grupo = ttlSub.grupos.get(clave)
  const propia = ttlSub.agentes.get(agente)
  const regimen = ttlSub.regimen
  const comun = grupo?.primero !== undefined ? { ms: grupo.ms, tokens: grupo.primero } : undefined
  const r = regimen === undefined ? undefined : medirPaso({ familia, ms, leido, escrito, propia, comun, regimen })
  // Lo común no pasa del primer pedido más chico del grupo (el resto es el encargo de cada uno).
  const primero = propia === undefined ? Math.min(grupo?.primero ?? Infinity, leido + escrito) : grupo?.primero
  recordarEn(ttlSub.agentes, agente, { ms, tokens: leido + escrito })
  recordarEn(ttlSub.grupos, clave, { ms, primero }, 50)
  if (r === undefined || regimen === undefined) return undefined
  ttlSub.porGuardar = anotarPaso(ttlSub.porGuardar, ms, regimen, r.medida)
  return regimen === 'l' ? r.releidos : undefined
}

/** /toki-dieta subagentes: caché de 1 hora para tus subagentes, en todas tus sesiones con Toki, mientras pague. */
async function activarCacheSubagentes($: $): Promise<string> {
  const x = txTtl(vivo.idioma)
  try {
    const ahora = await $.clock.now()
    const e = leerEstadoTtl(await $.store.get(CLAVE_TTL))
    const f = await entornoTtl($, e)
    ttlSub.fuera = f
    if (f !== undefined) {
      ttlSub.regimen = undefined
      return f.motivo === 'tuya' ? x.tuya(f.nombre) : f.motivo === 'version' ? x.noVersion : x.noProveedor
    }
    if (e.activa !== undefined && ttlSub.puesta) return x.yaPuesta
    const motivo = await ponerTtl($)
    if (motivo !== undefined) return x.negada(motivo)
    ttlSub.regimen = 'l'
    await $.store.set(CLAVE_TTL, activarTtl(e, ahora))
    void anotarDiagnostico($, 'subagentes: caché de 1 h puesta')
    return x.hecho
  } catch (err) {
    return x.negada(String(err))
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
): Promise<{ stdout: string; stderr: string } | undefined> {
  if (!config.repetidas || r === undefined || vivo.sinCompactar.has(comando.trim())) return undefined
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
  const ruta = await archivar($, texto)
  if (ruta === undefined) return undefined
  const x = tx()
  const linea = x.salidaRepetida(Math.round((actual.cuando - (previa?.cuando ?? actual.cuando)) / 60_000), kb(texto.length), ruta)
  // Contrafactual honesto: sin Toki, Claude habría leído lo que entrega Claude Code (máx. 30 KB, o la vista previa).
  const leidoSinToki = r.persistedOutputPath !== undefined ? VISTA_PREVIA_CLAUDE_CODE : Math.min(texto.length, LIMITE_CLAUDE_CODE)
  const ahorrado = Math.max(0, leidoSinToki - linea.length)
  await sumarAhorro($, ahorrado, comando, agente, 'repetida', { ruta, caracteres: texto.length })
  anotar(comando, 'compactado', x.detalleRepetida, tokensAprox(ahorrado))
  return { stdout: linea, stderr: '' }
}

type Limites = { t: number; cincoHoras?: number; semana?: number; reinicios: Partial<Record<VentanaLimite, number>> }

/** Los últimos límites que vio alguna sesión: la cuenta es una sola, sus ventanas también. */
const CLAVE_LIMITES = 'ultimosLimites'
/** Pasado esto sin que otra sesión los renueve, ya no se muestran. */
const LIMITES_VIGENCIA = 6 * 60 * 60_000

/**
 * Los límites de 5 h y de la semana. La app de escritorio a veces no los trae en la sesión:
 * entonces van los últimos que guardó otra sesión, solo si su ventana sigue abierta.
 */
async function limitesCompartidos($: $, ahora: number, propios: Limites): Promise<Limites> {
  if (propios.cincoHoras !== undefined || propios.semana !== undefined) {
    const previos = vivo.limitesGuardados
    if (previos === undefined || previos.cincoHoras !== propios.cincoHoras || previos.semana !== propios.semana || ahora - previos.t > 60_000) {
      vivo.limitesGuardados = propios
      await $.store.set(CLAVE_LIMITES, propios).catch(() => undefined)
    }
    return propios
  }
  if (ahora - vivo.limitesLeidos >= 60_000) {
    vivo.limitesLeidos = ahora
    const guardado = (await $.store.get(CLAVE_LIMITES).catch(() => undefined)) as Limites | undefined
    if (guardado !== undefined && typeof guardado.t === 'number') vivo.limitesGuardados = guardado
  }
  const g = vivo.limitesGuardados
  if (g === undefined || ahora - g.t > LIMITES_VIGENCIA) return propios
  const vigente = (v: VentanaLimite) => (g.reinicios[v] ?? 0) > ahora
  const ajenos: Limites = {
    t: g.t,
    cincoHoras: vigente('five_hour') ? g.cincoHoras : undefined,
    semana: vigente('seven_day') ? g.semana : undefined,
    reinicios: Object.fromEntries(VENTANAS.filter(vigente).map(v => [v, g.reinicios[v]])),
  }
  if (!vivo.avisoLimitesAjenos && (ajenos.cincoHoras !== undefined || ajenos.semana !== undefined)) {
    vivo.avisoLimitesAjenos = true
    void anotarDiagnostico($, 'límites: la sesión no los trae; van los últimos de otra sesión')
  }
  return ajenos
}

/** Lee las cifras de la sesión como máximo cada 5 s (es la misma llamada barata de la status line). */
async function refrescarUso($: $, forzar = false): Promise<void> {
  const ahora = await $.clock.now()
  if (!forzar && ahora - vivo.usoLeido < 5000) return
  vivo.usoLeido = ahora
  try {
    const uso = await $.session.usage()
    const limite = (kind: string) => uso.rateLimits.find(r => r.kind === kind)?.percentUsed
    const limites = await limitesCompartidos($, ahora, { t: ahora, cincoHoras: limite('five_hour'), semana: limite('seven_day'), reinicios: reiniciosDe(uso.rateLimits) })
    // El % que importa es contra la ventana a la que se compacta, no contra el millón del modelo.
    const ventana = vivo.ventana ?? uso.context.window
    vivo.usoCache = {
      pct: uso.context.tokens !== undefined && ventana > 0 ? Math.round((uso.context.tokens / ventana) * 100) : uso.context.percent,
      ventana,
      tokens: uso.context.tokens,
      cincoHoras: limites.cincoHoras,
      semana: limites.semana,
      costo: uso.cost?.usd,
      inicio: uso.startedAt,
      esSuscripcion: uso.rateLimits.length > 0 || limites.cincoHoras !== undefined || limites.semana !== undefined,
      reinicios: limites.reinicios,
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

/**
 * Los archivos de memoria de esta sesión (`.json` el punto de control, `.txt` la
 * nota, `.compactada` la marca del hook): dos sesiones en el mismo proyecto no se
 * pisan la nota. Tras un /clear el id cambia y se empieza otra.
 */
async function rutaMemoria($: $): Promise<string | undefined> {
  try {
    const id = (await $.session.id()).replace(/[^A-Za-z0-9_-]/g, '')
    return id === '' ? undefined : `${CARPETA}/notas/${id}`
  } catch {
    return undefined
  }
}

/** Deja lista la nota que el hook SessionStart(compact) reinyecta tras compactar (solo en el hilo principal). */
async function guardarMemoria($: $): Promise<void> {
  try {
    const base = await rutaMemoria($)
    if (base === undefined) return
    await asegurarCarpeta($)
    vivo.memoria.cuando = await $.clock.now()
    await $.fs.write(`${base}.json`, JSON.stringify(vivo.memoria, null, 2))
    await $.fs.write(`${base}.txt`, estaVacia(vivo.memoria) ? '' : notaPostCompactacion(vivo.memoria, vivo.idioma))
  } catch {
    // Sin memoria guardada no pasa nada grave: Claude Code compacta como siempre.
  }
}

/** ¿El hook de comando ya le dio la nota a Claude después de `desde`? */
async function marcaFresca($: $, desde: number): Promise<boolean> {
  try {
    const base = await rutaMemoria($)
    if (base === undefined) return false
    const { mtimeMs } = await $.fs.stat(`${base}.compactada`)
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
  vivo.memoria.enfasis = undefined
  // Si las respuestas breves iban como nota, la nota se fue con lo compactado: se manda otra.
  vivo.nudgeConciso = false
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
    const base = await rutaMemoria($)
    if (base === undefined) return
    const { mtimeMs } = await $.fs.stat(`${base}.compactada`)
    if (mtimeMs <= vivo.marcaVista) return
    vivo.marcaVista = mtimeMs
    if (mtimeMs < vivo.inicio - 5_000) return // Marca de antes de abrir esta sesión (una reanudada).
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
    vivo.ultimoPing = vivo.ultimoUsoCache
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

// ---------- Familias: lo que Toki aprende de las copias que Claude abre ----------

/** Lo aprendido por familia de comando: se lee una vez por carga del plugin y se guarda en cada cambio. */
const familias: { leido: boolean; aprendizaje: Aprendizaje } = { leido: false, aprendizaje: {} }

function xf(): TextosFamilias {
  return textosFamilias[vivo.idioma]
}

async function cargarAprendizaje($: $): Promise<void> {
  if (familias.leido) return
  familias.leido = true
  try {
    familias.aprendizaje = leerAprendizaje(await $.store.get(CLAVE_FAMILIAS), await $.clock.now())
  } catch {
    // Sin store: se aprende desde cero.
  }
}

/** Un evento de la familia: lo aprendido se relee (otra sesión pudo cambiarlo), cambia y se guarda. Si cambió de nivel, avisa. */
async function aprender($: $, familia: string, cambiar: (a: Aprendizaje, ahora: number) => CambioFamilia): Promise<void> {
  try {
    const ahora = await $.clock.now()
    const r = cambiar(leerAprendizaje(await $.store.get(CLAVE_FAMILIAS), ahora), ahora)
    familias.aprendizaje = r.aprendizaje
    familias.leido = true
    await $.store.set(CLAVE_FAMILIAS, r.aprendizaje)
    if (r.nivel === undefined) return
    void anotarDiagnostico($, `aprendizaje: ${familia} → ${['normal', 'con más contexto', 'entera un mes'][r.nivel]}`)
    $.ui.toast(xf().aviso[r.nivel](familia), { timeoutMs: 8000 })
  } catch {
    // Es solo aprendizaje.
  }
}

/** Una familia cuya copia Claude ya abrió se compacta con más contexto. */
function limitesDe(nivel: NivelFamilia): LimitesCompactacion {
  return nivel === 1 ? LIMITES_CUIDADO : LIMITES
}

/** El detalle de /toki-por-que, con la nota si se compactó con más contexto. */
function detalleDe(nivel: NivelFamilia, detalle: string): string {
  return nivel === 1 ? `${detalle}${xf().detalleCuidado}` : detalle
}

/**
 * Un comando que Toki no conoce dejó una salida larga: cuánto habría ahorrado compactarla, con la
 * misma cuenta que una compactación de verdad. /toki-por-que lo lista y propone compactarlo.
 */
async function anotarOportunidadSalida($: $, comando: string, texto: string, sinToki: number): Promise<void> {
  if (!config.compresion || porQueNoCompactable(comando) !== 'familia') return
  const familia = familiaDeComando(comando)
  if (familia === '' || config.compactarTambien.includes(familia)) return
  const c = compactar(texto, vivo.idioma)
  if (c === null) return
  const tokens = tokensAprox(sinToki - c.caracteresDespues - 300)
  if (tokens <= 0) return
  try {
    const ahora = await $.clock.now()
    await $.store.set(CLAVE_OPORTUNIDADES, anotarOportunidad(leerOportunidades(await $.store.get(CLAVE_OPORTUNIDADES), ahora), familia, tokens, ahora))
  } catch {
    // Es solo estadística.
  }
}

/** La salida de un comando de terminal que Toki no compactó: ¿era una oportunidad? */
async function anotarOportunidadShell($: $, comando: string, fallo: boolean, texto: string | undefined, r: SalidaShell | undefined): Promise<void> {
  if (fallo) {
    const cuerpo = (texto ?? '').replace(/^Exit code \d+\n?/, '')
    return anotarOportunidadSalida($, comando, cuerpo, Math.min(cuerpo.length, LIMITE_CLAUDE_CODE))
  }
  if (r === undefined || r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) return
  // Sin Toki, Claude Code entrega hasta 30 KB; si es más, una vista previa de ~2 KB.
  const total = r.stdout.length + r.stderr.length
  return anotarOportunidadSalida($, comando, r.stdout, r.persistedOutputPath !== undefined || total > LIMITE_CLAUDE_CODE ? VISTA_PREVIA_CLAUDE_CODE : total)
}

/** Anota por qué no se compacta (si aplica) y recuerda el comando del hilo principal. ¿Se intenta compactar? */
function prepararComando(comando: string, agente: string | undefined): boolean {
  const familia = familiaDeComando(comando)
  const base = porQueNoCompactable(comando)
  // Una familia que no es de la lista, pero que pediste compactar también.
  const motivoNo = base === 'familia' && config.compactarTambien.includes(familia) ? undefined : base
  const recuperado = vivo.sinCompactar.has(comando.trim())
  // Claude leyó entera su copia aun con más contexto: la familia va entera un tiempo.
  const aprendido = nivelDe(familias.aprendizaje, familia) === 2
  if (!config.compresion) anotarMotivo(comando, 'apagado')
  else if (motivoNo !== undefined) anotarMotivo(comando, motivoNo)
  else if (recuperado) anotarMotivo(comando, 'recuperado')
  else if (aprendido) anotarMotivo(comando, 'aprendido')
  if (agente === undefined) vivo.memoria.comandosRecientes = recordar(vivo.memoria.comandosRecientes, recortar(comando, 80), LIMITES_MEMORIA.comandos)
  return config.compresion && motivoNo === undefined && !recuperado && !aprendido
}

/** Recuerda el primer error y vigila bucles. Devuelve el aviso de bucle si toca. */
async function despuesDeEjecutar($: $, comando: string, fallo: boolean, texto: string | undefined, agente: string | undefined): Promise<string | undefined> {
  if (fallo && agente === undefined) {
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

/**
 * Un comando que falló: Claude Code corta el medio de las salidas largas, y el error suele
 * estar ahí o al final. Con el límite ampliado llega entera hasta 150 KB.
 */
async function compactarFallo($: $, comando: string, texto: string, agente: string | undefined): Promise<string | undefined> {
  const idioma = vivo.idioma
  const familia = familiaDeComando(comando)
  const nivel = nivelDe(familias.aprendizaje, familia)
  const salida = texto.match(/^(Exit code \d+)\n?/)
  const cuerpo = salida ? texto.slice(salida[0].length) : texto
  const c = compactar(cuerpo, idioma, limitesDe(nivel))
  if (c === null) {
    anotarMotivo(comando, esCorta(cuerpo) ? 'corta' : 'pocoAhorro')
    return undefined
  }
  const ruta = await archivar($, texto)
  if (ruta === undefined) {
    anotarMotivo(comando, 'archivar')
    return undefined
  }
  const entera = c.recortadoAntes === 0
  // Contrafactual honesto: sin Toki (y sin el límite ampliado), Claude habría leído lo que entrega Claude Code.
  const ahorrado = Math.max(0, Math.min(texto.length, LIMITE_CLAUDE_CODE) - c.caracteresDespues - 200)
  await sumarAhorro($, ahorrado, comando, agente, 'salida', { ruta, caracteres: cuerpo.length, familia, nivel })
  await aprender($, familia, (a, ahora) => trasCompactar(a, familia, ahora))
  anotar(comando, 'compactado', detalleDe(nivel, tx().detalleCompactado(kb(c.caracteresAntes), kb(c.caracteresDespues), entera)), tokensAprox(ahorrado))
  registrarSalidaGrande($, cuerpo.length)
  return [salida?.[1], encabezado(c, ruta, entera, tokensAprox(ahorrado), idioma), c.texto].filter(Boolean).join('\n')
}

/** Un comando que terminó bien, con su salida entera. Devuelve el stdout y stderr nuevos, o nada si se deja igual. */
async function compactarExito($: $, comando: string, r: SalidaShell, agente: string | undefined): Promise<{ stdout: string; stderr: string } | undefined> {
  const idioma = vivo.idioma
  if (r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) {
    anotarMotivo(comando, 'segundoPlano')
    return undefined
  }
  const familia = familiaDeComando(comando)
  const nivel = nivelDe(familias.aprendizaje, familia)
  const cOut = compactar(r.stdout, idioma, limitesDe(nivel))
  const cErr = r.stderr ? compactar(r.stderr, idioma, limitesDe(nivel)) : null
  const principal: Compactado | null = cOut ?? cErr
  if (principal === null) {
    anotarMotivo(comando, esCorta(r.stdout) ? 'corta' : 'pocoAhorro')
    return undefined
  }
  const ruta = await archivar($, `=== stdout ===\n${r.stdout}\n\n=== stderr ===\n${r.stderr}`)
  if (ruta === undefined) {
    anotarMotivo(comando, 'archivar')
    return undefined
  }
  // Contrafactual honesto: sin Toki, Claude Code entrega hasta 30 KB; si es más, la guarda en
  // un archivo y entrega una vista previa de ~2 KB (también la que llegó entera por el límite ampliado).
  const total = r.stdout.length + r.stderr.length
  const leidoSinToki = r.persistedOutputPath !== undefined || total > LIMITE_CLAUDE_CODE ? VISTA_PREVIA_CLAUDE_CODE : total
  const leidoConToki = (cOut?.caracteresDespues ?? 0) + (cErr?.caracteresDespues ?? 0) + 300
  const ahorrado = Math.max(0, leidoSinToki - leidoConToki)
  await sumarAhorro($, ahorrado, comando, agente, 'salida', { ruta, caracteres: r.stdout.length, familia, nivel })
  await aprender($, familia, (a, ahora) => trasCompactar(a, familia, ahora))
  anotar(comando, 'compactado', detalleDe(nivel, tx().detalleCompactado(kb(principal.caracteresAntes), kb(principal.caracteresDespues), true)), tokensAprox(ahorrado))
  registrarSalidaGrande($, r.stdout.length)
  const cabecera = encabezado(principal, ruta, true, tokensAprox(ahorrado), idioma)
  return {
    stdout: cOut ? `${cabecera}\n${cOut.texto}` : r.stdout,
    stderr: cErr ? (cOut ? cErr.texto : `${cabecera}\n${cErr.texto}`) : r.stderr,
  }
}

/** Claude Code corta las salidas de MCP en ~25k tokens: es lo más que Claude habría leído sin Toki. */
const LIMITE_MCP = 100_000

/**
 * Una salida larga de texto de una herramienta MCP ruidosa (logs, tests, builds, comandos): lo
 * esencial y el original guardado. Las que leen datos van enteras, y también la que ya obligó
 * a Claude a leer el original.
 */
async function compactarMcp($: $, herramienta: string, resultado: unknown, agente: string | undefined): Promise<unknown> {
  if (!esMcpRuidosa(herramienta) || vivo.sinCompactar.has(herramienta)) return undefined
  await cargarAprendizaje($)
  const nivel = nivelDe(familias.aprendizaje, herramienta)
  if (nivel === 2) return undefined
  const salida = salidaMcp(resultado)
  if (salida === undefined) return undefined
  if ((await ayudar($, 'compactacion')) !== 'si') return undefined
  const idioma = vivo.idioma
  const c = compactar(salida.texto, idioma, limitesDe(nivel))
  if (c === null) return undefined
  const ruta = await archivar($, salida.texto)
  if (ruta === undefined) return undefined
  const ahorrado = Math.max(0, Math.min(salida.texto.length, LIMITE_MCP) - c.caracteresDespues - 300)
  await sumarAhorro($, ahorrado, herramienta, agente, 'salida', { ruta, caracteres: salida.texto.length, familia: herramienta, nivel })
  await aprender($, herramienta, (a, ahora) => trasCompactar(a, herramienta, ahora))
  anotar(herramienta, 'compactado', detalleDe(nivel, tx().detalleCompactado(kb(c.caracteresAntes), kb(c.caracteresDespues), true)), tokensAprox(ahorrado))
  registrarSalidaGrande($, salida.texto.length)
  return salida.con(`${encabezado(c, ruta, true, tokensAprox(ahorrado), idioma)}\n${c.texto}`)
}

/**
 * Un original que Toki archivó al compactar: de qué herramienta o comando, cuánto pesaba y cuánto
 * leyó Claude después. Las salidas compactadas llevan su familia y con qué nivel se compactaron.
 */
type Archivado = { origen: string; tipo: TipoAhorro; caracteres: number; leidos: number; familia?: string; nivel?: NivelFamilia }

/** `.claude/toki/salidas/salida-NN.txt`, con la ruta relativa o absoluta, también con barras de Windows. */
const RUTA_ARCHIVADA = /\.claude[\\/]toki[\\/]salidas[\\/]salida-\d+\.txt/

/** Lo contrario de sumarAhorro: lo que Claude volvió a leer de un original que Toki había recortado. */
async function descontarAhorro($: $, tokens: number, tipo: TipoAhorro, agente: string | undefined): Promise<void> {
  if (tokens <= 0) return
  const principal = agente === undefined
  const usd = valorEscritura(tokens, familiaSin(agente), principal && ttl1hSesion(), principal ? (vivo.contextoPedido ?? 0) : 0)
  await alaSemana($, { tipo, ahorro: -tokens, ahorroUsd: -usd })
  await update($, sesion, s => ({ ...s, tokensAhorrados: Math.max(0, s.tokensAhorrados - tokens), recorteUsd: (s.recorteUsd ?? 0) - usd }))
  vivo.dolaresPendientes -= usd
  // Lo leído vuelve al contexto: desde aquí se relee en cada pedido.
  if (principal) vivo.relecturas = devolver(vivo.relecturas, tokens)
  const total = Number((await $.store.get(CLAVE_TOTAL)) ?? 0)
  await $.store.set(CLAVE_TOTAL, Math.max(0, total - tokens))
  await $.store.set(CLAVE_HISTORIAL, sumarAlDia(await leerHistorial($), await $.clock.now(), -tokens))
}

/**
 * Claude leyó (con Read, Grep o la terminal) un original que Toki archivó al compactar: lo
 * leído se resta del ahorro, porque es lo que costó compactar. Si ya leyó la mitad o más, la
 * compactación no le sirvió: esa herramienta o ese comando va entero el resto de la sesión.
 * Y Toki aprende: la familia que Claude abrió va con más contexto la próxima vez.
 */
async function contarRecuperacion($: $, e: object, ran: ToolCallResult, agente: string | undefined): Promise<void> {
  const entrada = e as { file_path?: unknown; path?: unknown; command?: unknown }
  const donde = [entrada.file_path, entrada.path, entrada.command].find((v): v is string => typeof v === 'string' && RUTA_ARCHIVADA.test(v))
  const ruta = donde === undefined ? undefined : RUTA_ARCHIVADA.exec(donde)?.[0]?.replace(/\\/g, '/')
  const a = ruta === undefined ? undefined : vivo.archivados.get(ruta)
  if (a === undefined) return
  const leidos = tamanoResultado(ran)
  const primera = a.leidos === 0 && leidos > 0
  const mitad = a.caracteres * 0.5
  const cruzo = a.leidos < mitad && a.leidos + leidos >= mitad
  a.leidos += leidos
  const tokens = tokensAprox(leidos)
  await descontarAhorro($, tokens, a.tipo, agente)
  const vetar = a.leidos >= a.caracteres * 0.5 && !vivo.sinCompactar.has(a.origen)
  if (vetar) {
    vivo.sinCompactar.add(a.origen)
    reanotar(a.origen, 'sin-cambio', motivo('recuperado', vivo.idioma))
  }
  await anotarDiagnostico($, `recuperación: Claude leyó ${kb(leidos)} del original de ${recortar(a.origen, 60)} (−~${formatearTokens(tokens)} tokens del ahorro)${vetar ? '; ya no se compacta en esta sesión' : ''}`)
  const familia = a.familia
  if (familia === undefined) return
  if (primera) await aprender($, familia, (ap, ahora) => trasAbrir(ap, familia, ahora))
  if (cruzo) await aprender($, familia, (ap, ahora) => trasLeerEntera(ap, familia, a.nivel ?? 0, ahora))
}

/** Una búsqueda que pasó de 30 KB: resumen por archivo o carpeta, con la salida completa en la copia. */
async function resumirBusquedaShell(
  $: $,
  comando: string,
  tipo: TipoBusqueda,
  r: SalidaShell,
  agente: string | undefined,
): Promise<{ stdout: string; stderr: string } | undefined> {
  if (r.backgroundTaskId !== undefined || r.interrupted === true || r.isImage === true) return undefined
  const fuente = r.stdout
  if (fuente.length <= LIMITE_CLAUDE_CODE) return undefined
  const ruta = await archivar($, fuente)
  if (ruta === undefined) return undefined
  const resumen = resumirBusqueda(fuente, tipo, ruta, vivo.idioma)
  if (resumen === undefined) return undefined
  // Contrafactual honesto, como con las salidas ruidosas: sin Toki, como mucho 30 KB (o la vista previa de 2 KB).
  const leidoSinToki = r.persistedOutputPath !== undefined ? VISTA_PREVIA_CLAUDE_CODE : Math.min(r.stdout.length + r.stderr.length, LIMITE_CLAUDE_CODE)
  const ahorrado = Math.max(0, leidoSinToki - resumen.caracteresDespues)
  await sumarAhorro($, ahorrado, comando, agente, 'busqueda', { ruta, caracteres: fuente.length })
  anotar(comando, 'compactado', tx().detalleCompactado(kb(resumen.caracteresAntes), kb(resumen.caracteresDespues), true), tokensAprox(ahorrado))
  registrarSalidaGrande($, fuente.length)
  return { stdout: resumen.texto, stderr: r.stderr }
}

/**
 * Lo que Claude habría visto con su corte (las últimas líneas de la salida entera) y, si el
 * corte escondía errores, esos errores con su contexto y la ruta de la copia completa.
 */
async function rehacerCorte($: $, comando: string, corte: Corte, completa: string): Promise<string> {
  const visto = ultimasLineas(completa, corte.lineas)
  // Sin la salida entera (llegó al tope, o Claude Code le cortó el medio), solo lo que el corte dejaba ver.
  if (caracteresRecortados(completa) > 0 || completa.replace(/\n$/, '').split('\n').length >= TOPE_CORTE) return visto
  const r = rescatarErrores(completa, visto)
  if (r === undefined) return visto
  const x = tx()
  const lineas = [x.rescateEncabezado(corte.programa, r.errores, r.total), ...r.texto]
  // Sin copia guardada, igual van los errores: es más de lo que el corte dejaba ver.
  const ruta = await archivar($, completa)
  if (ruta !== undefined) {
    if (r.incluidos < r.errores) lineas.push(x.rescateMas(r.errores - r.incluidos))
    lineas.push(x.copiaCompleta(ruta))
  }
  reanotar(comando, 'rescatado', x.detalleRescate(r.errores))
  $.ui.toast(x.toastRescate(r.errores, recortar(comando, 40)), { timeoutMs: 7000 })
  if ((await revisarLogros($, { rescate: true })).length === 0) sonar($, 'ahorro')
  return `${visto.replace(/\n+$/, '')}\n\n${lineas.join('\n')}`
}

/** Lo mismo cuando el pipe salió con error (en PowerShell manda el comando; en bash, con pipefail): el código de salida va arriba. */
async function rehacerCorteFallido($: $, comando: string, corte: Corte, texto: string): Promise<string> {
  const salida = texto.match(/^(Exit code \d+)\n?/)
  const visto = await rehacerCorte($, comando, corte, salida ? texto.slice(salida[0].length) : texto)
  return salida ? `${salida[1]}\n${visto}` : visto
}

/**
 * Un comando de Bash del hilo principal: si corre un script que Toki guardó, lo anota; si es largo y
 * ya corrió igual, lo devuelve para guardarlo cuando termine bien.
 */
function revisarScript($: $, comando: unknown): { comando: string; veces: number } | undefined {
  if (typeof comando !== 'string') return undefined
  const guardado = scriptCorrido(comando)
  if (guardado !== undefined) {
    const largo = vivo.scripts.guardados[guardado]
    void anotarDiagnostico($, `scripts: Claude corrió ${guardado} desde su archivo${largo === undefined ? '' : ` (~${tokensAprox(largo - comando.trim().length)} tokens menos que escribirlo)`}`)
    return undefined
  }
  const c = contarScript(vivo.scripts, comando, vivo.compactaciones)
  vivo.scripts = c.s
  if (c.yaAvisado) void anotarDiagnostico($, `scripts: Claude volvió a escribir entero ${nombreScript(comando)} (${comando.trim().length} caracteres)`)
  return c.toca ? { comando, veces: c.veces } : undefined
}

/**
 * Un comando largo que ya corrió igual: Toki lo guarda tal cual y le dice a Claude cómo correrlo desde
 * el archivo. Solo si `source` recibe el mismo permiso que el original: nunca uno nuevo.
 */
async function guardarScript($: $, comando: string, veces: number): Promise<string | undefined> {
  try {
    const ruta = rutaScript(comando)
    const correr = comandoScript(`${(await $.session.cwd()).replace(/[\\/]$/, '')}/${ruta}`)
    const original = await decisionDePermiso($, 'Bash', comando)
    const permiso = await decisionDePermiso($, 'Bash', correr)
    if (original === 'deny' || permiso !== original) {
      void anotarDiagnostico($, `scripts: ${nombreScript(comando)} no se guardó: source pide otro permiso (original=${original}, source=${permiso})`)
      return undefined
    }
    // De testigo, el aviso queda para otra tarea.
    if ((await ayudar($, 'scripts')) !== 'si') return undefined
    const contenido = contenidoScript(comando)
    if (!(await $.fs.exists(ruta))) {
      await asegurarCarpeta($)
      await $.fs.write(ruta, contenido)
    } else if ((await $.fs.read(ruta)) !== contenido) return undefined // Otro comando con ese nombre, o alguien lo editó: no se toca.
    vivo.scripts = marcarGuardado(vivo.scripts, comando, vivo.compactaciones)
    void anotarDiagnostico($, `scripts: Toki guardó ${nombreScript(comando)} (${comando.trim().length} caracteres, corrió igual ${veces} veces)`)
    return txScripts(vivo.idioma).aviso(veces, comando.trim().length, correr)
  } catch {
    return undefined // Es una ayuda: si falla, Claude sigue como siempre.
  }
}

async function conAvisoMapa($: $, herramienta: string, comando: string | undefined, ran: ToolCallResult): Promise<ToolCallResult> {
  if (ran.deny !== undefined || ran.isError === true || !esBusqueda(herramienta, comando)) return ran
  if (await read($, avisoMapaDado)) return ran
  if (!(await $.fs.exists(RUTA_MAPA).catch(() => false))) return ran
  // De testigo, la nota queda para otra tarea.
  if ((await ayudar($, 'mapa')) !== 'si') return ran
  await update($, avisoMapaDado, () => true)
  return { ...ran, context: [...(ran.context ?? []), avisoMapa(vivo.idioma)] }
}

/** Lo que la llamada dejó en la conversación, en caracteres; 0 si no se puede medir. */
function tamanoResultado(ran: ToolCallResult): number {
  if (typeof ran.text === 'string') return ran.text.length
  try {
    return JSON.stringify(ran.result ?? '').length
  } catch {
    return 0
  }
}

/**
 * Cuenta la exploración del turno. Pasado el umbral, en una conversación ya grande, devuelve la
 * sugerencia de delegarla a un subagente Explore (una vez por conversación; no con Haiku, donde
 * releer cuesta poco). Promete Sonnet solo si Toki de verdad correrá el subagente ahí.
 */
async function seguirExploracion($: $, herramienta: string, e: object, ran: ToolCallResult): Promise<string | undefined> {
  const entrada = e as { command?: unknown; subagent_type?: unknown }
  const paso = pasoExploracion(herramienta, typeof entrada.command === 'string' ? entrada.command : undefined)
  if (paso === 'delegacion' && vivo.avisoExploracion === 'dado') {
    vivo.avisoExploracion = 'seguido'
    await anotarDiagnostico($, `exploración: Claude delegó tras el aviso (${typeof entrada.subagent_type === 'string' ? entrada.subagent_type : 'general-purpose'})`)
  }
  const caracteres = tamanoResultado(ran)
  vivo.exploracion = sumarPaso(vivo.exploracion, paso, caracteres)
  const contexto = vivo.contextoPedido ?? 0
  if (vivo.avisoExploracion !== undefined || !tocaDelegar(vivo.exploracion, contexto) || familiaDe(vivo.modelo) === 'haiku') return undefined
  // De testigo, el aviso queda para otra tarea.
  if ((await ayudar($, 'explore')) !== 'si') return undefined
  vivo.avisoExploracion = 'dado'
  const { llamadas } = vivo.exploracion
  const tokens = formatearTokens(tokensAprox(vivo.exploracion.caracteres))
  // Explore hereda el modelo de este pedido: Sonnet es más barato solo si el hilo principal va en Opus o Fable.
  const enSonnet = ruta.subagentes && ruta.modo !== 'no' && modeloSubagente('Explore', '', vivo.modeloEnUso ?? vivo.modelo ?? '') !== undefined
  const x = tx()
  vivo.lecciones = agregarLeccion(vivo.lecciones, { clave: 'exploracion', texto: x.leccionExploracion(llamadas, tokens, enSonnet) })
  await anotarDiagnostico($, `exploración: aviso de delegar (${llamadas} llamadas, ~${tokens} tokens, contexto ~${formatearTokens(contexto)}${enSonnet ? ', Explore irá en Sonnet' : ''})`)
  return x.nudgeExploracion(llamadas, tokens, enSonnet)
}

// ---------- Mapa del proyecto ----------

async function generarMapa($: $): Promise<{ archivos: number; truncado: boolean }> {
  const fichas: FichaArchivo[] = []
  const frameworks: FichaFramework[] = []
  let xmls = 0
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
      if (entrada.kind !== 'file' || entrada.size > LIMITES_MAPA.maxBytes) continue
      // Lo que solo leen los detectores de framework (p. ej. vistas .xml) no cuenta como código.
      if (leeDetector(ruta)) {
        if (xmls >= LIMITES_MAPA.maxXml) continue
        xmls += 1
        try {
          frameworks.push(...extraerFrameworks(ruta, await $.fs.read(ruta)))
        } catch {
          // Archivo ilegible: se omite.
        }
        continue
      }
      if (lenguaje(ruta) === undefined) continue
      if (fichas.length >= LIMITES_MAPA.maxArchivos) {
        truncado = true
        break
      }
      try {
        const texto = await $.fs.read(ruta)
        const ficha = extraerFicha(ruta, texto)
        if (ficha !== undefined) fichas.push(ficha)
        frameworks.push(...extraerFrameworks(ruta, texto))
      } catch {
        // Archivo ilegible: se omite.
      }
    }
  }
  if (fichas.length === 0) return { archivos: 0, truncado }
  await asegurarCarpeta($)
  const fecha = new Date(await $.clock.now()).toISOString().slice(0, 16).replace('T', ' ')
  await $.fs.write(RUTA_MAPA, construirMapa(fichas, fecha, truncado, vivo.idioma, frameworks))
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
  /** Lo que se podría ahorrar y aún no: no se suma al ahorro. */
  oportunidad: string[]
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

/** Lo que costó la sesión, con las cifras que la API reportó pedido por pedido, y lo que se reescribió del caché. */
function lineasGasto(x: Textos, g: Gasto, reescrito?: LibroCache): string[] {
  if (g.pedidos === 0) return []
  const lineas = [
    x.gastoLinea(formatearTokens(g.cacheLeido), porcentajeRelectura(g), formatearTokens(g.cacheEscrito), formatearTokens(g.entrada), formatearTokens(g.salida)),
    x.gastoPedidos(g.pedidos, formatearTokens(Math.round((g.entrada + g.cacheLeido + g.cacheEscrito) / g.pedidos))),
  ]
  if (g.subPedidos > 0) lineas.push(x.gastoSub(g.subPedidos, formatearTokens(g.subTokens)))
  const libro = leerLibro(reescrito)
  const r = totalLibro(libro)
  if (r.veces > 0) lineas.push(x.gastoReescrito(formatearTokens(r.tokens), cifraUsd(r.usd), porCausa(libro, vivo.idioma)))
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
    oportunidad: [],
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
      const sinUso = await oportunidadMcp($, desglose, ahora)
      if (sinUso !== undefined) r.oportunidad.push(sinUso)
      const mcp = desglose.mcpTools.filter(h => h.isLoaded).reduce((suma, h) => suma + h.tokens, 0)
      if (mcp > 10_000 && sinUso === undefined) r.sugerencias.push(x.sugMcp(formatearTokens(mcp)))
    }
    if (pct !== undefined && pct >= 50) r.sugerencias.push(x.sugContexto)
  } catch {
    // Sin cifras por ahora.
  }
  if (!config.mantenerCache && vivo.ultimoTurnoCompleto > 0 && vivo.usoCache !== undefined && !vivo.usoCache.esSuscripcion) r.sugerencias.push(x.sugCache)
  if (!r.hayMapa) r.sugerencias.push(x.sugMapa)
  if (await $.fs.exists('.claude/ahorro-tokens').catch(() => false)) r.sugerencias.push(x.sugCarpetaVieja)
  // Con respuestas breves ya puestas (o con un estilo tuyo) el consejo sobra. Sin prompt.compose, solo
  // si Toki ya sabe que no corre (el guardia de empresa) y no elegiste un estilo en tu configuración.
  const sugerirConciso = vivo.breve === undefined
    ? (config.guardiaEmpresa || vivo.nudgeConciso) && (await estiloDeConfiguracion($)) === undefined
    : !breveActivo(vivo.breve) && vivo.breve !== 'tuyo'
  if (sugerirConciso) r.sugerencias.push(x.sugConciso)
  return r
}

/** Oportunidad: los servidores MCP que no usaste en DIAS_SIN_USO días, y lo que pesaron esta semana. */
async function oportunidadMcp($: $, desglose: Parameters<typeof armarDieta>[0], ahora: number): Promise<string | undefined> {
  const uso = leerUsoMcp(await $.store.get(CLAVE_USO_MCP).catch(() => undefined), ahora)
  const servidores = mcpSinUso(armarDieta(desglose, uso), { ahora, desde: uso.desde })
  if (servidores.length === 0) return undefined
  const tokens = servidores.reduce((suma, s) => suma + s.tokens, 0)
  const pedidos = (await leerSemanasDe($).catch(() => ({}) as Semanas))[lunesDe(ahora)]?.pedidos ?? 0
  const familia = familiaDe(ruta.modeloPrincipal ?? vivo.modelo) ?? 'opus'
  const semana = pedidos > 0 ? cifraUsd(pedidos * valorLectura(tokens, familia)) : undefined
  const bajoDemanda = arreglos(armarDieta(desglose, uso), { ahora, desde: uso.desde, guardia: config.guardiaEmpresa }).mcp.length > 0
  return tx().oportunidadMcp(servidores.map(s => s.nombre).join(', '), formatearTokens(tokens), DIAS_SIN_USO, semana, bajoDemanda)
}

// ---------- Dieta que arregla ----------

/** Lo que /toki-dieta miró: el desglose, la memoria medida en disco (con su texto, para el respaldo) y lo que se puede arreglar. */
type RevisionDieta = {
  dieta?: Dieta
  opciones: OpcionesDieta
  arreglos: Arreglos
  textos: Map<string, string>
  /** La caché de los subagentes, con lo medido aún sin guardar. */
  ttl: EstadoTtl
  /** Conviene la de 1 hora, Toki la puede poner y nunca se quitó: va en la pregunta. */
  ofrecerTtl: boolean
}

async function revisarDieta($: $): Promise<RevisionDieta> {
  const ahora = await $.clock.now()
  const uso = leerUsoMcp(await $.store.get(CLAVE_USO_MCP).catch(() => undefined), ahora)
  let dieta: Dieta | undefined
  try {
    const desglose = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
    if (desglose !== undefined) dieta = armarDieta(desglose, uso)
  } catch {
    // Sin desglose: lo dice.
  }
  // Las líneas no vienen en el desglose: se cuentan en el disco. Los de la organización no se tocan.
  const medidos: ArchivoMemoria[] = []
  const textos = new Map<string, string>()
  for (const m of (dieta?.memoria ?? []).filter(m => m.tipo !== 'Managed').slice(0, MAX_MEDIDOS)) {
    try {
      const texto = await $.fs.read(m.ruta)
      textos.set(m.ruta, texto)
      medidos.push({ ...m, ...medirTexto(texto) })
    } catch {
      // Sin leer: no se mide ni se toca.
    }
  }
  const modelo = ruta.modeloPrincipal ?? vivo.modelo
  const familia = familiaDe(modelo) ?? 'opus'
  const opciones: OpcionesDieta = {
    ahora,
    idioma: vivo.idioma,
    modelo: modelo !== undefined ? nombreCorto(modelo) : 'Opus',
    desde: uso.desde,
    pedidosSemana: (await leerSemanasDe($).catch(() => ({}) as Semanas))[lunesDe(ahora)]?.pedidos ?? 0,
    lectura: t => valorLectura(t, familia),
    escritura: t => valorEscritura(t, familia, ttl1hSesion()),
    medidos,
    usoSkills: leerUsoSkills(await $.store.get(CLAVE_USO_SKILLS).catch(() => undefined), ahora),
    propio: $.plugin.name,
    diferidos: config.mcpDiferidos,
    guardia: config.guardiaEmpresa,
    suscripcion: vivo.usoCache?.esSuscripcion === true,
  }
  const guardado = leerEstadoTtl(await $.store.get(CLAVE_TTL).catch(() => undefined))
  const ttl = { ...guardado, dias: juntarDias(guardado.dias, ttlSub.porGuardar, ahora) }
  const ofrecerTtl = ttlSub.regimen === 'c' && ttl.activa === undefined && ttl.quitada === undefined && veredictoTtl(ttl.dias, ahora).tipo === 'conviene'
  return { dieta, opciones, arreglos: arreglos(dieta, opciones), textos, ttl, ofrecerTtl }
}

/** /toki-dieta mcp: los servidores sin uso quedan bajo demanda, en la opción de Toki (Claude Code recarga el plugin). */
function diferirMcp($: $, r: RevisionDieta): string {
  const x = txDieta(vivo.idioma)
  if (config.guardiaEmpresa) return x.mcpGuardia
  if (r.dieta !== undefined && !r.dieta.bajoDemanda) return x.mcpSinBusqueda
  const nombres = r.arreglos.mcp.map(s => s.nombre)
  if (nombres.length === 0) return x.mcpNinguno
  // Las herramientas cambian: el pedido siguiente vuelve a escribir todo el contexto en vez de leerlo.
  const total = r.dieta?.total ?? 0
  const extra = Math.max(0, r.opciones.escritura(total) - r.opciones.lectura(total))
  const lista = leerDiferidos([...config.mcpDiferidos, ...nombres])
  // Cambiar la opción recarga el plugin: después de responder.
  $.clock.after(100, () => void cambiarDiferidos($, lista))
  void anotarDiagnostico($, `dieta: MCP bajo demanda: ${nombres.join(', ')}`)
  return x.mcpHecho(nombres.join(', '), cifraFina(extra))
}

/** Escribe la lista en la opción; si Claude Code no deja, lo dice. */
async function cambiarDiferidos($: $, lista: readonly string[]): Promise<void> {
  const motivo = await cambiarOpcion($, OPCION_DIFERIDOS, lista.join(', '))
  if (motivo === undefined) return
  void anotarDiagnostico($, `dieta: Claude Code no dejó cambiar ${OPCION_DIFERIDOS} (${motivo})`)
  $.ui.toast(txDieta(vivo.idioma).mcpNegado(motivo), { timeoutMs: 12_000 })
}

/** Copia el archivo a .claude/toki/respaldos antes de tocarlo y lo anota para /toki-dieta restaurar. */
async function respaldar($: $, archivo: string, texto: string | undefined, ahora: number): Promise<string | undefined> {
  if (texto === undefined) return undefined
  try {
    await asegurarCarpeta($)
    const fecha = new Date(ahora).toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const respaldo = `${CARPETA}/respaldos/${fecha}-${archivo.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120)}`
    await $.fs.write(respaldo, texto)
    const antes = leerRespaldos(await $.store.get(CLAVE_RESPALDOS).catch(() => undefined))
    await $.store.set(CLAVE_RESPALDOS, [...antes, { ruta: archivo, respaldo, ms: ahora }].slice(-MAX_RESPALDOS))
    return respaldo
  } catch {
    return undefined
  }
}

/**
 * /toki-dieta memoria: un respaldo de cada archivo largo y el pedido para Claude en el cuadro de
 * texto. Toki no edita la memoria: la adelgaza Claude, mostrándote cada cambio, cuando envías el pedido.
 */
async function adelgazarMemoria($: $, r: RevisionDieta): Promise<string> {
  const x = txDieta(vivo.idioma)
  if (r.arreglos.memoria.length === 0) return x.memoriaNinguna
  const respaldados: { archivo: ArchivoMemoria; respaldo: string }[] = []
  for (const archivo of r.arreglos.memoria) {
    const respaldo = await respaldar($, archivo.ruta, r.textos.get(archivo.ruta), r.opciones.ahora)
    // Sin respaldo no se toca: nunca se pierde información.
    if (respaldo !== undefined) respaldados.push({ archivo, respaldo })
  }
  if (respaldados.length === 0) return x.sinRespaldo
  const pedido = pedidoMemoria(
    respaldados.map(h => h.archivo),
    vivo.idioma,
  )
  const lista = [x.respaldos, ...respaldados.map(h => `  ${h.archivo.ruta} → ${h.respaldo}`)]
  void anotarDiagnostico($, `dieta: memoria a adelgazar: ${respaldados.map(h => h.archivo.ruta).join(', ')}`)
  if (!(await hayAlguien($))) return [x.memoriaCopia, '', pedido, '', ...lista].join('\n')
  // El cuadro se vacía al correr el comando: el pedido va un momento después. Si no entra, va al historial.
  $.clock.after(100, async () => {
    const lleno = await $.prompt.fill({ text: pedido, mode: 'replace' }).then(f => f.isFilled, () => false)
    if (!lleno) $.ui.log([x.memoriaCopia, pedido].join('\n'))
  })
  return [x.memoriaPedido, ...lista].join('\n')
}

/** Entre comillas simples para la terminal. */
function comillas(texto: string): string {
  return `'${texto.replace(/'/g, `'\\''`)}'`
}

/** /toki-dieta restaurar: los MCP vuelven a cargarse; de la memoria, cómo volver al último respaldo de cada archivo. */
async function restaurarDieta($: $): Promise<string> {
  const x = txDieta(vivo.idioma)
  const partes: string[] = []
  if (config.mcpDiferidos.length > 0) {
    $.clock.after(100, () => void cambiarDiferidos($, []))
    void anotarDiagnostico($, `dieta: MCP cargados otra vez: ${config.mcpDiferidos.join(', ')}`)
    partes.push(x.restauradoMcp(config.mcpDiferidos.join(', ')))
  }
  const ttl = leerEstadoTtl(await $.store.get(CLAVE_TTL).catch(() => undefined))
  if (ttl.activa !== undefined || ttlSub.puesta) {
    await soltarTtl($)
    if (ttlSub.regimen === 'l') ttlSub.regimen = 'c'
    await $.store.set(CLAVE_TTL, quitarTtl(ttl, await $.clock.now(), 'restaurar')).catch(() => undefined)
    void anotarDiagnostico($, 'subagentes: caché de 1 h quitada con /toki-dieta restaurar')
    partes.push(txTtl(vivo.idioma).restaurada)
  }
  // Toki no copia encima: quizá cambiaste algo después. Te deja el comando.
  const ultimos = new Map(leerRespaldos(await $.store.get(CLAVE_RESPALDOS).catch(() => undefined)).map(h => [h.ruta, h]))
  if (ultimos.size > 0) partes.push(x.restaurarMemoria, ...[...ultimos.values()].map(h => `  cp ${comillas(h.respaldo)} ${comillas(h.ruta)}`))
  return partes.length > 0 ? partes.join('\n') : x.nadaQueRestaurar
}

/** Tras el informe, con alguien mirando: ¿lo arreglo ahora? Primero la memoria (llena el cuadro), luego la caché de los subagentes; al final los MCP, que recargan el plugin. */
async function ofrecerArreglos($: $, r: RevisionDieta): Promise<void> {
  // Ya mandaste otro mensaje: llegaría tarde.
  if (vivo.enTurno) return
  const x = txDieta(vivo.idioma)
  const opciones: { etiqueta: string; hacer: () => Promise<void> }[] = []
  if (r.arreglos.memoria.length > 0) {
    const nombres = r.arreglos.memoria.map(a => a.ruta.split(/[\\/]/).pop() ?? a.ruta)
    opciones.push({ etiqueta: x.opMemoria(nombres), hacer: async () => $.ui.log(await adelgazarMemoria($, r)) })
  }
  if (r.ofrecerTtl) opciones.push({ etiqueta: txTtl(vivo.idioma).op, hacer: async () => $.ui.log(await activarCacheSubagentes($)) })
  if (r.arreglos.mcp.length > 0) opciones.push({ etiqueta: x.opMcp(r.arreglos.mcp.map(s => s.nombre)), hacer: async () => $.ui.log(diferirMcp($, r)) })
  const [una] = opciones
  if (una === undefined) return
  let respuesta: string
  try {
    respuesta =
      opciones.length === 1
        ? await $.ui.ask(x.pregunta, { header: 'Toki', options: [una.etiqueta, x.ahoraNo] })
        : await $.ui.ask(x.preguntaVarios, { header: 'Toki', options: opciones.map(o => o.etiqueta), multiSelect: true })
  } catch {
    return
  }
  // Varias elegidas llegan separadas por comas; las etiquetas no llevan comas.
  const elegidas = respuesta.split(',').map(e => e.trim())
  for (const o of opciones) if (elegidas.includes(o.etiqueta)) await o.hacer()
}

/** Una skill más usada; los comandos de Toki no cuentan. */
async function anotarSkill($: $, nombre: unknown): Promise<void> {
  if (typeof nombre !== 'string') return
  const clave = nombreSkill(nombre)
  if (clave === '' || /^toki(-|$)/.test(clave)) return
  try {
    const ahora = await $.clock.now()
    await $.store.set(CLAVE_USO_SKILLS, anotarUso(leerUsoSkills(await $.store.get(CLAVE_USO_SKILLS), ahora), clave, ahora))
  } catch {
    // Es solo estadística.
  }
}

async function textoDecisiones($: $): Promise<string> {
  const x = tx()
  const s = await read($, sesion)
  const g = await read($, gasto)
  const cuentas = [...lineasGasto(x, g, s.reescrito)]
  if ((s.relecturasEvitadas ?? 0) > 0) cuentas.push(x.relecturasLinea(formatearTokens(s.relecturasEvitadas)))
  const ventana = textoVentana(x)
  if (ventana !== undefined) cuentas.push(ventana)
  const cero = explicarCero(x, s, g)
  const pie = [...(cero !== undefined ? ['', cero] : []), ...(cuentas.length > 0 ? ['', `${x.gastoTitulo}:`, ...cuentas.map(l => `  ${l}`)] : [])]
  pie.push('', ...textoRuta(xr(), s))
  const aprendido = [...(await textoFamilias($)), ...(await textoAyudas($))]
  if (vivo.decisiones.length === 0) return [x.sinComandos, ...aprendido, ...pie].join('\n')
  const lineas = [x.decisionesTitulo]
  for (const d of [...vivo.decisiones].reverse()) {
    const extra = d.ahorro !== undefined ? ` (${x.tokensAhorradosCorto(formatearTokens(d.ahorro))})` : ''
    const estado = d.resultado === 'compactado' ? x.compactado : d.resultado === 'rescatado' ? x.rescatado : x.sinCambio
    lineas.push(`  ${marcaDecision(d)} ${d.comando}`, `      ${estado}: ${d.motivo}${extra}`)
  }
  lineas.push('', x.decisionesPie, ...aprendido, ...pie)
  return lineas.join('\n')
}

async function oportunidadesGuardadas($: $): Promise<Oportunidades> {
  try {
    return leerOportunidades(await $.store.get(CLAVE_OPORTUNIDADES), await $.clock.now())
  } catch {
    return {}
  }
}

/** Para /toki-por-que: las familias que Toki trata distinto y las salidas largas que no compactó. */
async function textoFamilias($: $): Promise<string[]> {
  const x = xf()
  await cargarAprendizaje($)
  const lineas: string[] = []
  const lista = aprendidas(familias.aprendizaje)
  if (lista.length > 0) {
    lineas.push('', x.aprendidoTitulo)
    for (const [f, a] of lista) lineas.push(x.aprendida(f, a.nivel === 2 ? x.entera(fechaCorta(enteraHasta(a), vivo.idioma)) : x.conCuidado, a.abiertas, a.compactadas))
  }
  const mejores = mejoresOportunidades(await oportunidadesGuardadas($), config.compactarTambien, 5)
  if (mejores.length > 0) {
    lineas.push('', x.oportunidadesTitulo)
    for (const [f, o] of mejores) lineas.push(x.oportunidad(f, o.veces, formatearTokens(o.tokens), fechaCorta(o.desde, vivo.idioma)))
  }
  if (config.compactarTambien.length > 0) lineas.push('', x.tambien(config.compactarTambien.join(', ')))
  if (lineas.length > 0) lineas.push(x.pistaOlvidar)
  return lineas
}

/** Tras /toki-por-que, con alguien mirando: ¿compacto también las familias que más habrían ahorrado? */
async function ofrecerFamilias($: $, propuestas: readonly [string, Oportunidad][]): Promise<void> {
  // Ya mandaste otro mensaje: llegaría tarde.
  if (vivo.enTurno) return
  const x = xf()
  const [una] = propuestas
  if (una === undefined) return
  const etiquetas = new Map(propuestas.map(([f, o]) => [x.etiqueta(f, formatearTokens(o.tokens)), f]))
  let respuesta: string
  try {
    respuesta =
      propuestas.length === 1
        ? await $.ui.ask(x.pregunta(una[0], formatearTokens(una[1].tokens)), { header: 'Toki', options: [...etiquetas.keys(), x.ahoraNo] })
        : await $.ui.ask(x.preguntaVarias, { header: 'Toki', options: [...etiquetas.keys()], multiSelect: true })
  } catch {
    return
  }
  // Varias elegidas llegan separadas por comas; las etiquetas no llevan comas.
  const elegidas = respuesta.split(',').flatMap(r => etiquetas.get(r.trim()) ?? [])
  if (elegidas.length === 0) return
  $.ui.log(x.agregadas(elegidas.join(', ')))
  // Cambiar la opción recarga el plugin: después de responder.
  const lista = leerExtras([...config.compactarTambien, ...elegidas])
  $.clock.after(100, () => void cambiarExtras($, lista))
}

/** Escribe «Compactar también»; si Claude Code no deja, lo dice. */
async function cambiarExtras($: $, lista: readonly string[]): Promise<void> {
  const motivo = await cambiarOpcion($, OPCION_TAMBIEN, lista.join(', '))
  if (motivo === undefined) return
  void anotarDiagnostico($, `familias: Claude Code no dejó cambiar ${OPCION_TAMBIEN} (${motivo})`)
  $.ui.toast(xf().negado(motivo), { timeoutMs: 12_000 })
}

/** /toki-por-que olvidar [familia]: Toki olvida lo aprendido y, si la agregaste, deja de compactarla. */
async function olvidarFamilias($: $, argumento: string): Promise<string> {
  const x = xf()
  const familia = argumento.trim() === '' ? undefined : normalizarFamilia(argumento)
  let aprendizaje: Aprendizaje = {}
  try {
    aprendizaje = leerAprendizaje(await $.store.get(CLAVE_FAMILIAS), await $.clock.now())
  } catch {
    // Sin store: nada guardado.
  }
  const oportunidades = await oportunidadesGuardadas($)
  const quitada = familia !== undefined && config.compactarTambien.includes(familia)
  const habia =
    familia === undefined
      ? Object.keys(aprendizaje).length + Object.keys(oportunidades).length > 0
      : aprendizaje[familia] !== undefined || oportunidades[familia] !== undefined || quitada
  if (!habia) return x.nadaQueOlvidar(familia)
  familias.aprendizaje = olvidar(aprendizaje, familia)
  familias.leido = true
  try {
    await $.store.set(CLAVE_FAMILIAS, familias.aprendizaje)
    await $.store.set(CLAVE_OPORTUNIDADES, olvidar(oportunidades, familia))
  } catch {
    // Sin store: queda olvidado en esta sesión.
  }
  void anotarDiagnostico($, `aprendizaje: olvidado ${familia ?? 'todo'}`)
  if (quitada) $.clock.after(100, () => void cambiarExtras($, config.compactarTambien.filter(f => f !== familia)))
  return familia === undefined ? x.olvidadoTodo : x.olvidada(familia, quitada)
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
  const cuentas = lineasGasto(x, r.gasto, r.sesion.reescrito)
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
  if (r.oportunidad.length > 0) {
    lineas.push('', `${x.oportunidadTitulo}:`)
    for (const l of r.oportunidad) lineas.push(`  • ${l}`)
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
  vivo.exploracion = EXPLORACION_VACIA
  vivo.avisoExploracion = undefined
  vivo.generadosFrenados = new Map<string, number>()
  vivo.scripts = SCRIPTS_VACIO
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
/** Cuándo se usó cada herramienta MCP, para /toki-dieta. */
const CLAVE_USO_MCP = 'usoMcp'
/** Cuándo se usó cada skill, para /toki-dieta. */
const CLAVE_USO_SKILLS = 'usoSkills'
/** Los MCP bajo demanda que Claude Code ya conoce: si la opción cambia, vuelve a preguntar por las herramientas. */
const CLAVE_DIFERIDOS = 'mcpDiferidosAplicados'
/** Las copias de memoria que Toki guardó antes de adelgazarla. */
const CLAVE_RESPALDOS = 'respaldosMemoria'
const MAX_RESPALDOS = 20
/** Archivos de memoria que /toki-dieta lee para contar líneas. */
const MAX_MEDIDOS = 20
/** La pregunta de /toki-dieta sale un momento después del informe: primero lo lees. */
const DEMORA_DIETA = 1_000
/** El esfuerzo que Claude Code usó para cada modelo sin que nadie lo fijara (el de tu organización), si no es el de fábrica. */
const CLAVE_ESFUERZO = 'esfuerzoPorDefecto'
/** Lo medido al bajar el esfuerzo, con sus testigos (`hooks/ahorro.ts`): vale entre sesiones. */
const CLAVE_CALIBRACION = 'calibracionEsfuerzo'
/** Pedidos que usó cada tipo de mensaje: calibran lo que Toki estima antes de mandarlo. */
const CLAVE_PEDIDOS = 'pedidosPorMensaje'
/** «¿Quedó bien?»: lo que respondiste y lo que corregiste tras los mensajes bajados y sus testigos. */
const CLAVE_CALIDAD = 'calidadRuta'
/** La pregunta sale un momento después de la respuesta: primero la lees. */
const DEMORA_CALIDAD = 1_000
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
  /** Va de testigo (su celda): Toki lo habría bajado de esfuerzo y lo deja con el tuyo para comparar. */
  testigo?: string
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
  /** Lo que escriben los mensajes que Toki baja de esfuerzo y sus testigos, por tipo de mensaje. */
  calibracion: CalibracionEsfuerzo
  /** Cuántos pedidos usaron de verdad tus mensajes, por tipo: la estimación previa se corrige con esto. */
  pedidosMedidos: PedidosMedidos
  /** «¿Quedó bien?» de los mensajes bajados y sus testigos: vale entre sesiones. */
  calidad: Calidad
  /** El último mensaje fue bajado o testigo: tu siguiente dice si lo corregías. */
  calidadPrevio?: GrupoCalidad
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
  /** Un cambio de esfuerzo de Toki reescribió el caché (pasa en algunos modelos y proveedores): ya no lo cambia en esta sesión. */
  esfuerzoRompe: boolean
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
  esfuerzoRompe: false,
  defectos: {},
  calibracion: {},
  pedidosMedidos: {},
  calidad: calidadVacia(),
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
  ruta.calidadPrevio = undefined
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
  const estimacion = `${Number(m.pedidosEstimados.toFixed(1))} pedidos, contexto ${Math.round(m.contexto / 1000)}k, caché ${m.ttl1h ? '1 h' : '5 min'}${m.frio ? ', frío' : ''}${otroPlan}`
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

/** Claude terminó un plan; Toki ofrece ejecutarlo en Sonnet una vez por conversación. */
const planHecho = { listo: false, ofrecido: false }

/**
 * Con el plan listo y tu siguiente mensaje (no una corrección): si vas en Opus, ofrece
 * seguir en Sonnet, que cuesta la mitad. Sonnet primero ya sube a Opus si algo falla.
 */
async function ofrecerSonnetTrasPlan($: $, texto: string): Promise<void> {
  if (!planHecho.listo) return
  planHecho.listo = false
  if (planHecho.ofrecido || ruta.modo === 'no' || !ruta.interactivo || sonnetActivo() || familiaDe(vivo.modelo) !== 'opus' || esCorreccion(texto)) return
  planHecho.ofrecido = true
  const x = xr().sonnet.plan
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta, { header: 'Toki', options: [x.si, x.no] })
  } catch {
    return
  }
  const si = respuesta === x.si
  void anotarDiagnostico($, `plan listo: ${si ? 'se ejecuta en Sonnet' : 'sigue en Opus'}`)
  if (!si) return
  // Solo esta sesión: lo guardado con /toki-sonnet no cambia.
  ruta.sonnetPrimero = true
  ruta.sonnetPausado = false
  $.ui.toast(x.activado, { timeoutMs: 8_000 })
  $.ui.invalidate('ui.render')
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

// ---------- Calibrar lo que ahorra bajar el esfuerzo ----------

/** La celda de un mensaje que Toki baja solo de esfuerzo, en el mismo modelo; si cambia otra cosa, ninguna. */
function celdaBajada(nivel: Nivel, actual: Pick<Opcion, 'modelo' | 'esfuerzo'>, elegida: Pick<Opcion, 'modelo' | 'esfuerzo'>): string | undefined {
  if (elegida.modelo !== actual.modelo || ESFUERZOS.indexOf(elegida.esfuerzo) >= ESFUERZOS.indexOf(actual.esfuerzo)) return undefined
  return claveEsfuerzo(modeloCanonico(actual.modelo), nivel, actual.esfuerzo, elegida.esfuerzo)
}

/** Cambia la calibración guardada. Relee antes: otra sesión pudo sumar lo suyo. */
async function cambiarCalibracion($: $, cambiar: (c: CalibracionEsfuerzo) => CalibracionEsfuerzo): Promise<void> {
  let guardada = ruta.calibracion
  try {
    guardada = leerCalibracion(await $.store.get(CLAVE_CALIBRACION))
  } catch {
    // Sin store: lo de esta sesión.
  }
  ruta.calibracion = cambiar(guardada)
  try {
    await $.store.set(CLAVE_CALIBRACION, ruta.calibracion)
  } catch {
    // Sin store: solo en esta sesión.
  }
}

/**
 * Si Toki va a bajar solo el esfuerzo por su cuenta (no lo elegiste tú ni es el modo
 * ahorro), el mensaje cuenta como candidato; a uno de cada CADA_TESTIGO le toca ir con
 * tu esfuerzo, de testigo. Devuelve su celda.
 */
async function elegirTestigo($: $, nivel: Nivel, actual: Opcion, d: ResultadoRuta, estado: EstadoRuta): Promise<string | undefined> {
  if (d.modo !== 'auto' || d.como !== 'auto' || estado.enAhorro) return undefined
  const clave = celdaBajada(nivel, actual, d.elegida)
  if (clave === undefined) return undefined
  let toca = false
  await cambiarCalibracion($, c => {
    toca = tocaTestigo(c[clave])
    return contarCandidato(c, clave)
  })
  return toca ? clave : undefined
}

/** Un mensaje entero que Toki bajó de esfuerzo solo, o su testigo: su salida va a la calibración. */
async function registrarCalibracion($: $, plan: PlanTurno | undefined, m: Medicion, turnId: string): Promise<void> {
  if (plan === undefined || plan.turno !== turnId || m.pedidos === 0) return
  const bajado = plan.como === 'auto' && !plan.preguntado && !plan.estado.enAhorro ? celdaBajada(plan.nivel, { modelo: plan.modelo, esfuerzo: plan.supuesto }, plan.usada) : undefined
  const clave = plan.testigo ?? bajado
  if (clave === undefined) return
  const grupo = plan.testigo !== undefined ? 'testigos' : 'bajados'
  await cambiarCalibracion($, c => sumarACalibracion(c, clave, grupo, m))
}

/** La celda de un pedido del hilo principal al que Toki bajó el esfuerzo, con el tipo de su mensaje. */
function celdaDelPedido(e: TurnStepInput, pedido: TurnStepInput): CeldaEsfuerzo | undefined {
  const m = ruta.medicion
  if (m === undefined || m.turno !== e.turnId || !esEsfuerzo(e.effort) || !esEsfuerzo(pedido.effort)) return undefined
  return ruta.calibracion[claveEsfuerzo(modeloCanonico(pedido.model), m.nivel, e.effort, pedido.effort)]
}

/** Lo que usó de verdad un mensaje entero, para estimar mejor el próximo de su tipo. Nunca falla: es estadística. */
async function registrarPedidos($: $, m: Medicion): Promise<void> {
  if (m.pedidos < 1) return
  ruta.pedidosMedidos = sumarPedidos(ruta.pedidosMedidos, m.nivel, m.pedidos)
  try {
    await $.store.set(CLAVE_PEDIDOS, ruta.pedidosMedidos)
  } catch {
    // Sin store: vale para esta sesión.
  }
}

/** /toki-modelo: con cuántos pedidos por mensaje estima Toki, y de dónde sale. */
function lineasPedidos(x: TextosRuta): string[] {
  const lineas: string[] = []
  for (const n of NIVELES) {
    const medidos = ruta.pedidosMedidos[n]?.length ?? 0
    if (medidos > 0) lineas.push(`    ${x.celdaPedidos(x.nivel[n], pedidosEsperados(ruta.pedidosMedidos, n).toFixed(1), PEDIDOS_POR_NIVEL[n], medidos)}`)
  }
  return lineas.length === 0 ? [] : [`  ${x.pedidosMedidos(PESO_FABRICA)}`, ...lineas]
}

// ---------- ¿Quedó bien? ----------

/** Cambia lo guardado de «¿quedó bien?». Relee antes: otra sesión pudo sumar lo suyo. */
async function cambiarCalidad($: $, cambiar: (c: Calidad) => Calidad): Promise<void> {
  let guardada = ruta.calidad
  try {
    guardada = leerCalidad(await $.store.get(CLAVE_CALIDAD))
  } catch {
    // Sin store: lo de esta sesión.
  }
  ruta.calidad = cambiar(guardada)
  try {
    await $.store.set(CLAVE_CALIDAD, ruta.calidad)
  } catch {
    // Sin store: solo en esta sesión.
  }
}

/**
 * Un mensaje entero que Toki mandó solo con menos que lo tuyo, o su testigo: cuenta
 * para su grupo y, si le toca, pregunta si quedó bien. Como en la calibración, lo que
 * bajaste tú (al preguntarte, o con el modo ahorro) no cuenta: no tiene testigos. Lo
 * tuyo es tu modelo (el de /model) y el esfuerzo con que Toki planeó.
 */
async function anotarCalidad($: $, plan: PlanTurno | undefined, turnId: string, ahora: number): Promise<void> {
  if (plan === undefined || plan.turno !== turnId) return
  const tuyo = { modelo: vivo.modelo ?? plan.modelo, esfuerzo: plan.supuesto }
  const solo = plan.como === 'auto' && !plan.preguntado && !plan.estado.enAhorro
  const grupo: GrupoCalidad | undefined = plan.testigo !== undefined ? 'testigos' : solo && esBajado(tuyo, plan.usada) ? 'bajados' : undefined
  ruta.calidadPrevio = grupo
  if (grupo === undefined) return
  let toca = false
  await cambiarCalidad($, c => {
    const sumada = sumarMensaje(c, grupo)
    // Sin nadie que conteste, o si Claude te preguntó algo: lo suyo va primero.
    toca = ruta.interactivo && !ruta.preguntoAntes && !preguntas.trasTurno && tocaPreguntar(sumada, grupo, ahora)
    return toca ? marcarPregunta(sumada, grupo, ahora) : sumada
  })
  if (!toca) return
  preguntas.trasTurno = true
  $.clock.after(DEMORA_CALIDAD, () => void preguntarCalidad($, grupo))
}

/** La misma pregunta para bajados y testigos: no sabes cuál es cuál. Un texto libre no cuenta. */
async function preguntarCalidad($: $, grupo: GrupoCalidad): Promise<void> {
  // Ya mandaste otro mensaje: llegaría tarde.
  if (vivo.enTurno) return
  const x = xr().calidad
  let respuesta: string
  try {
    respuesta = await $.ui.ask(x.pregunta, { header: 'Toki', options: [x.bien, x.mal, x.nose, x.apagar] })
  } catch {
    void anotarDiagnostico($, `calidad: pregunta (${grupo}) sin respuesta`)
    return
  }
  const r: RespuestaCalidad | undefined = respuesta === x.bien ? 'bien' : respuesta === x.mal ? 'mal' : respuesta === x.nose ? 'nose' : respuesta === x.apagar ? 'apagar' : undefined
  if (r === undefined) return
  await cambiarCalidad($, c => anotarRespuesta(c, grupo, r))
  // No quedó bien: un "dale" o "sigue" que venga ahora cuenta como atascado, y no va en simple.
  if (r === 'mal' && !vivo.enTurno) ruta.atascadoPrevio = true
  void anotarDiagnostico($, `calidad: pregunta (${grupo}) → ${r}`)
}

/** /toki-modelo: lo que respondiste y lo que corregiste tras los bajados y los testigos. */
function lineasCalidad(x: TextosRuta): string[] {
  const c = ruta.calidad
  const xc = x.calidad
  const filas = GRUPOS_CALIDAD.filter(g => c[g].mensajes > 0).map(g => `    ${xc.fila(xc.grupo[g], c[g].mensajes, c[g].bien, c[g].bien + c[g].mal, c[g].corregidos, c[g].siguientes)}`)
  if (filas.length === 0 && !c.apagada) return []
  return [`  ${xc.titulo(CADA_PREGUNTA)}`, ...filas, ...(c.apagada ? [`    ${xc.apagada}`] : [])]
}

/** /toki-modelo: al bajar el esfuerzo, cuánta salida cuenta Toki como ahorrada y con cuántos testigos. */
function lineasCalibracion(x: TextosRuta): string[] {
  const lineas: string[] = []
  const pedidos = (g: GrupoMedido) => (g.mensajes > 0 ? (g.pedidos / g.mensajes).toFixed(1) : '–')
  for (const [clave, c] of Object.entries(ruta.calibracion).reverse()) {
    if (c.bajados.mensajes + c.testigos.mensajes === 0 || lineas.length >= 6) continue
    const [modelo = '', nivel, cambio = ''] = clave.split('|')
    const [desde, hacia] = cambio.split('>')
    const n = NIVELES.find(v => v === nivel)
    if (n === undefined || !esEsfuerzo(desde) || !esEsfuerzo(hacia)) continue
    const medido = salidaMedida(c)
    const detalle = medido === undefined ? x.sinTestigos(c.testigos.mensajes, TESTIGOS_META) : x.conTestigos(medido.toFixed(2), c.testigos.mensajes, c.bajados.mensajes, pedidos(c.testigos), pedidos(c.bajados))
    lineas.push(`    ${x.celdaCalibracion(nombreCorto(modelo), x.nivel[n], x.esfuerzo[desde], x.esfuerzo[hacia], factorCalibrado(desde, hacia, c).toFixed(2), detalle)}`)
  }
  return lineas.length === 0 ? [] : [`  ${x.calibracion(CADA_TESTIGO, TESTIGOS_META)}`, ...lineas]
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
    // Un testigo sigue siéndolo si, con el esfuerzo de verdad, Toki también lo bajaría solo.
    if (plan.testigo !== undefined) plan.testigo = d.modo === 'auto' && d.como === 'auto' && !plan.estado.enAhorro ? celdaBajada(plan.nivel, p.actual, d.elegida) : undefined
    envio = d.modo === 'auto' && plan.testigo === undefined ? d.elegida : p.actual
    como = d.como
    ruta.ultima = { nivel: plan.nivel, motivo: plan.motivo, actual: p.actual, recomendada: d.elegida, decision: plan.testigo !== undefined ? 'testigo' : d.decision }
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
    permitirEsfuerzo: !ruta.esfuerzoRompe,
    cacheFrio,
    reescribe,
    sonnetPrimero: base !== undefined,
    atascado,
    pedidos: pedidosEsperados(ruta.pedidosMedidos, nivel),
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
  // Testigo: si Toki iba a bajar solo el esfuerzo, 1 de cada CADA_TESTIGO mensajes va con el tuyo, hasta juntar
  // TESTIGOS_META por tipo de mensaje. Lo que escriben unos y otros mide cuánto ahorra de verdad bajarlo.
  const testigo = await elegirTestigo($, nivel, p.actual, d, estado)
  const { elegida, sinCache } = d
  const modo = testigo !== undefined ? 'nada' : d.modo
  const decision: DecisionMensaje = testigo !== undefined ? 'testigo' : d.decision
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
    pedidosEstimados: propuesta.pedidos ?? PEDIDOS_POR_NIVEL[nivel],
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
  const plan: PlanTurno = { supuesto: actual.esfuerzo, modelo: actual.modelo, usada, como, preguntado: modo === 'preguntar', nivel, motivo, propuesta, estado, testigo }
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
  if (ruta.historial.length === 0) lineas.push(`  ${x.sinDecisiones}`)
  for (const d of [...ruta.historial].reverse().slice(0, 6)) {
    const elegido = `${nombreCorto(d.despues.modelo)} · ${x.esfuerzo[d.despues.esfuerzo]} (${textoDiferencia(d.dif, x)}${d.como === 'deshecho' ? `, ${x.deshecho}` : ''})`
    lineas.push(`  • ${x.linea(x.nivel[d.nivel], elegido, x.motivo[d.motivo])}`)
  }
  return [...lineas, ...lineasCalibracion(x), ...lineasPedidos(x), ...lineasCalidad(x)]
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

/**
 * El botón «Compactar ahora». Nuestro hook de session.compact no corre en nuestra propia llamada:
 * la memoria y la mascota van aquí. Si la app la rechaza, corre /compact; si un hook la veta, lo dice y deja /compact en el cuadro.
 */
async function compactarDesdeBarra($: $): Promise<void> {
  if (vivo.actividad === 'compactando') return
  const anterior = vivo.actividad
  vivo.actividad = 'compactando'
  $.ui.invalidate('ui.render')
  let motivo: string | undefined
  let fallo: string | undefined
  try {
    await preguntarQueRecordar($)
    if (config.memoria) await guardarMemoria($)
    const instrucciones = config.memoria && !estaVacia(vivo.memoria) ? instruccionesDeCompactacion(vivo.memoria, vivo.idioma) : undefined
    try {
      const r = await $.session.compact(instrucciones !== undefined ? { instructions: instrucciones } : {})
      if ('skip' in r) motivo = r.skip
    } catch (err) {
      // La app de escritorio la rechaza aunque no haya turno: /compact, como si lo escribieras, sí pasa
      // (espera a que la sesión quede libre).
      fallo = String(err)
      await $.command.run({ command: 'compact', args: instrucciones ?? '' })
      fallo = undefined
      void anotarDiagnostico($, 'compactar desde la barra: vía /compact')
    }
    if (motivo === undefined) {
      await registrarCompactacion($, 'resumen')
      await refrescarUso($, true)
      return
    }
  } catch (err) {
    fallo = `${fallo ?? ''}${fallo ? ' · ' : ''}/compact: ${String(err)}`
    $.ui.log(`Toki, compactar desde la barra: ${fallo}`, { to: 'debug' })
  } finally {
    vivo.actividad = anterior === 'compactando' ? 'tranquilo' : anterior
    $.ui.invalidate('ui.render')
  }
  void anotarDiagnostico($, `compactar desde la barra: no se pudo${motivo ? ` (${motivo})` : ''}${fallo ? ` — ${fallo.slice(0, 200)}` : ''}`)
  // El /compact de siempre, a mano: pasa por donde pasa el tuyo.
  const enCuadro = await $.prompt.fill({ text: '/compact', mode: 'replace' }).then(r => r.isFilled, () => false)
  $.ui.toast(tx().noCompactoBoton(motivo, enCuadro), { timeoutMs: 10_000 })
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

/** La tarea en curso: desde un pedido nuevo hasta el siguiente (o el fin de la conversación). */
let tareaAbierta: { usd: number; correcciones: number } | undefined

/** Un pedido nuevo con sustancia, con la misma regla que la entrevista: ni seguimiento, ni corrección, ni algo simple. */
function empiezaTarea(texto: string): boolean {
  const l = nivelHeuristico(texto, 'normal')
  return !esCorreccion(texto) && l.nivel !== 'trivial' && l.motivo !== 'seguimiento' && l.motivo !== 'cierre' && l.motivo !== 'atascado' && texto.split(/\s+/).length >= 8
}

/** La tarea en curso pasa a la tarjeta con lo que costó y sus correcciones. */
async function cerrarTarea($: $): Promise<void> {
  const t = tareaAbierta
  tareaAbierta = undefined
  if (t !== undefined) await alaSemana($, { tarea: t })
  await cerrarCasos($, t)
}

/** Un mensaje tuyo que sale hacia Claude: a la tarjeta, con si corregía lo anterior y si salió frío. */
async function contarMensaje($: $, textoCrudo: string, frio?: number): Promise<void> {
  // La entrevista decidida para este mensaje se mide en la tarea que abre; si no abre ninguna, no se mide.
  const pendientes = [...ayudas.pendientes]
  ayudas.pendientes.clear()
  const texto = quitarEtiquetasDeSistema(textoCrudo)
  if (texto === '' || texto.startsWith('/')) return
  // El anterior fue bajado o testigo: si este lo corrige, no había quedado bien.
  const previo = ruta.calidadPrevio
  ruta.calidadPrevio = undefined
  if (previo !== undefined) await cambiarCalidad($, c => sumarSiguiente(c, previo, esCorreccion(texto)))
  if (empiezaTarea(texto)) {
    await cerrarTarea($)
    tareaAbierta = { usd: 0, correcciones: 0 }
    for (const [i, brazo] of pendientes) {
      ayudas.casos.set(i, { brazo, desdeUsd: vivo.cuentaRuteo.real, desdeCorr: 0 })
      ayudas.decidido.set(i, Promise.resolve(brazo === 'con' ? 'si' : 'testigo'))
    }
  } else if (tareaAbierta !== undefined && esCorreccion(texto)) tareaAbierta.correcciones += 1
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

// ---------- Testigos de cada ayuda ----------

/** Lo medido por los testigos de cada ayuda (`hooks/testigos.ts`): vale entre sesiones. */
const CLAVE_TESTIGOS = 'testigos'

/** Una ayuda medida en la tarea en curso: con ella o de testigo, y desde dónde se cuenta lo que costó. */
type Caso = { brazo: Brazo; desdeUsd: number; desdeCorr: number }

const ayudas = {
  /** Lo decidido para cada ayuda en la tarea en curso (o, fuera de una tarea, hasta que empiece la próxima). */
  decidido: new Map<Intervencion, Promise<Ayuda>>(),
  casos: new Map<Intervencion, Caso>(),
  /** La entrevista se decide antes de que tu mensaje abra su tarea: se mide en la que abre. */
  pendientes: new Map<Intervencion, Brazo>(),
}

/**
 * ¿Toki da esta ayuda ahora? La primera vez en una tarea se decide para toda la tarea: con
 * ella o, a 1 de cada CADA, de testigo. Fuera de una tarea no se mide, y en pausa no se da.
 */
function ayudar($: $, i: Intervencion): Promise<Ayuda> {
  const ya = ayudas.decidido.get(i)
  if (ya !== undefined) return ya
  const decision = decidirAyuda($, i)
  ayudas.decidido.set(i, decision)
  return decision
}

/** Las lecturas y escrituras de los testigos van en fila: dos ayudas decididas en paralelo no se pisan. */
let filaTestigos: Promise<unknown> = Promise.resolve()
function enFilaTestigos<T>(f: () => Promise<T>): Promise<T> {
  const turno = filaTestigos.then(f)
  filaTestigos = turno.catch(() => undefined)
  return turno
}

/**
 * `abre`: la ayuda es para el mensaje que está por salir (la entrevista). Si abre una tarea, se
 * mide en esa; si no, no se mide. Sin `abre`, se mide en la tarea en curso. Sin store, la ayuda va como siempre.
 */
async function decidirAyuda($: $, i: Intervencion, abre?: boolean): Promise<Ayuda> {
  try {
    const tarea = tareaAbierta
    const r = await enFilaTestigos(async () => {
      const ahora = await $.clock.now()
      const eleccion = elegirAyuda(leerTestigos(await $.store.get(CLAVE_TESTIGOS), ahora), i, ahora, abre ?? tarea !== undefined)
      if (eleccion.medido) await $.store.set(CLAVE_TESTIGOS, eleccion.testigos)
      return eleccion
    })
    if (!r.medido) return r.ayuda
    const brazo: Brazo = r.ayuda === 'testigo' ? 'testigo' : 'con'
    if (abre === true) ayudas.pendientes.set(i, brazo)
    else if (tarea !== undefined && tarea === tareaAbierta) ayudas.casos.set(i, { brazo, desdeUsd: tarea.usd + vivo.cuentaRuteo.real, desdeCorr: tarea.correcciones })
    if (r.ayuda === 'testigo') void anotarDiagnostico($, `testigos: ${i} sin tocar en esta tarea (1 de cada ${CADA[i]})`)
    return r.ayuda
  } catch {
    return 'si'
  }
}

/** Un comando que Toki compactaría: ¿esta tarea va con compactación? Si no (testigo o pausa), queda anotado por qué. */
async function conCompactacion($: $, comando: string): Promise<boolean> {
  const a = await ayudar($, 'compactacion')
  if (a === 'si') return true
  const x = txTestigos(vivo.idioma)
  anotar(comando, 'sin-cambio', a === 'testigo' ? x.motivo.testigo(CADA.compactacion) : x.motivo.pausa)
  return false
}

/**
 * La tarea terminó: lo que costó (y cuánto la corregiste) desde que cada ayuda pudo actuar va a
 * su ronda. Si una ronda cierra con la ayuda peor que sin ella, la ayuda queda en pausa y lo dice.
 */
async function cerrarCasos($: $, tarea: { usd: number; correcciones: number } | undefined): Promise<void> {
  const casos = [...ayudas.casos]
  ayudas.casos.clear()
  ayudas.decidido.clear()
  if (tarea === undefined || casos.length === 0) return
  try {
    const ahora = await $.clock.now()
    const { t, cierres } = await enFilaTestigos(async () => {
      let nuevos = leerTestigos(await $.store.get(CLAVE_TESTIGOS), ahora)
      const cierres: [Intervencion, Cierre][] = []
      for (const [i, c] of casos) {
        const r = anotarTarea(nuevos, i, c.brazo, { usd: tarea.usd - c.desdeUsd, correcciones: tarea.correcciones - c.desdeCorr }, ahora)
        nuevos = r.testigos
        if (r.cierre !== undefined) cierres.push([i, r.cierre])
      }
      await $.store.set(CLAVE_TESTIGOS, nuevos)
      return { t: nuevos, cierres }
    })
    const x = txTestigos(vivo.idioma)
    for (const [i, cierre] of cierres) {
      void anotarDiagnostico($, lineaCierre(i, cierre, ahora))
      const ronda = t[i]
      const hasta = ronda === undefined ? undefined : vence(ronda)
      if (cierre.pausada && hasta !== undefined) $.ui.toast(x.aviso(x.nombre[i], fechaCorta(hasta, vivo.idioma), cierre.comparacion.testigos.tareas), { timeoutMs: 10_000 })
    }
  } catch {
    // Es solo medición.
  }
}

/** Para /toki-por-que: lo que miden los testigos de cada ayuda. */
async function textoAyudas($: $): Promise<string[]> {
  try {
    const lineas = textoTestigos(leerTestigos(await $.store.get(CLAVE_TESTIGOS), await $.clock.now()), { idioma: vivo.idioma })
    return lineas.length === 0 ? [] : ['', ...lineas]
  } catch {
    return []
  }
}

/** /toki-por-que reanudar: las ayudas en pausa vuelven ya, y se miden de nuevo. */
async function reanudarPausadas($: $): Promise<string> {
  const x = txTestigos(vivo.idioma)
  try {
    const r = await enFilaTestigos(async () => {
      const hecho = reanudarAyudas(leerTestigos(await $.store.get(CLAVE_TESTIGOS), await $.clock.now()))
      if (hecho.reanudadas.length > 0) await $.store.set(CLAVE_TESTIGOS, hecho.testigos)
      return hecho
    })
    if (r.reanudadas.length === 0) return x.nadaEnPausa
    for (const i of r.reanudadas) ayudas.decidido.delete(i)
    void anotarDiagnostico($, `testigos: ${r.reanudadas.join(', ')} reanudada${r.reanudadas.length === 1 ? '' : 's'} con /toki-por-que reanudar`)
    return x.reanudadas(r.reanudadas.map(i => x.nombre[i]))
  } catch {
    return x.nadaEnPausa
  }
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
  await pasarALimpio($, texto, contexto)
  return true
}

/** Dijiste que sí a empezar en limpio: se anota lo que pesaba la conversación, /clear y `texto` vuelve al cuadro. */
async function pasarALimpio($: $, texto: string, contexto: number): Promise<void> {
  const ahora = await $.clock.now()
  // Con el caché vencido (contado con el plazo largo, para no inflar), sin Toki tu mensaje la reescribía entera.
  proponerLimpio(contexto, vivo.ultimoUsoCache > 0 && ahora - vivo.ultimoUsoCache > ttlMs(), ahora)
  limpiarYDevolver($, texto)
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

// ---------- Preguntas justo a tiempo ----------

const CLAVE_PREGUNTAS = 'preguntasJustoATiempo'

const preguntas: {
  /** Rechazos seguidos de cada pregunta y las que callaste (se guarda entre sesiones). */
  estado: EstadoPreguntas
  leido: boolean
  /** Lo que ya se preguntó para la tarea en curso: no se repite hasta que empiece otra. */
  enTema: Set<'donde' | 'listo'>
  /** Las tareas de un mensaje que pediste hacer una por una: las que faltan y la que Toki dejó en el cuadro. */
  cola?: { tareas: Tarea[]; total: number; enCuadro?: Tarea; ignoradas: number }
  /** Claude guardó el spec: al terminar el turno, Toki propone su criterio de listo como /goal. */
  spec: boolean
  /** La compactación (vivo.ultimaCompactacion) del tramo en que ya se preguntó qué no olvidar. */
  recordarEn?: number
  /** Ya hay una pregunta para después de este turno: no va otra. */
  trasTurno: boolean
  /** Las carpetas del proyecto, miradas una vez por sesión. */
  carpetas?: Carpeta[]
} = { estado: {}, leido: false, enTema: new Set(), spec: false, trasTurno: false }

function xpq(): TextosPreguntas {
  return textosPreguntas[vivo.idioma]
}

async function leerPreguntas($: $): Promise<void> {
  if (preguntas.leido) return
  preguntas.leido = true
  try {
    preguntas.estado = leerEstadoPreguntas(await $.store.get(CLAVE_PREGUNTAS))
  } catch {
    // Sin memoria de rechazos: se empieza de cero.
  }
}

function callada(tipo: TipoPregunta): boolean {
  return estaCallada(preguntas.estado, tipo)
}

/** Lo que se olvida con /clear: lo preguntado para la tarea de antes y el tramo de la compactación. */
function reiniciarPreguntas(): void {
  preguntas.enTema.clear()
  preguntas.spec = false
  preguntas.recordarEn = undefined
}

/** La pregunta en el diálogo de Claude Code (cero tokens); undefined si la cierras. */
async function preguntar($: $, pregunta: string, opciones: string[]): Promise<string | undefined> {
  try {
    return (await $.ui.ask(pregunta, { header: 'Toki', options: opciones })).trim()
  } catch {
    return undefined
  }
}

/** Un sí reinicia la cuenta; dos «no» seguidos callan esa pregunta, y Toki lo dice. */
async function responder($: $, tipo: TipoPregunta, aceptada: boolean): Promise<void> {
  const r = contarRespuesta(preguntas.estado, tipo, aceptada)
  preguntas.estado = r.estado
  await $.store.set(CLAVE_PREGUNTAS, r.estado).catch(() => undefined)
  const x = xpq()
  if (r.seCallo) $.ui.toast(x.callada(x.nombre[tipo]), { timeoutMs: 8_000 })
  void anotarDiagnostico($, `pregunta ${tipo}: ${aceptada ? 'sí' : 'no'}${r.seCallo ? ' (se calla)' : ''}`)
}

/** Las carpetas donde puede estar lo que pides y cuánto pesan (sus entradas). Solo en la raíz de un proyecto. */
async function carpetasDelProyecto($: $): Promise<Carpeta[]> {
  if (preguntas.carpetas !== undefined) return preguntas.carpetas
  const mirar = async (ruta: string): Promise<Carpeta & { adentro: string[] }> => {
    try {
      const entradas = await $.fs.list(ruta)
      return { ruta, peso: entradas.length, adentro: entradas.filter(x => x.kind === 'dir' && esCarpetaDeBusqueda(x.name)).map(x => `${ruta}/${x.name}`) }
    } catch {
      return { ruta, peso: 0, adentro: [] }
    }
  }
  let carpetas: Carpeta[] = []
  try {
    const raiz = await $.fs.list()
    if (esRaizDeProyecto(raiz.map(x => x.name))) {
      const arriba = await Promise.all(raiz.filter(x => x.kind === 'dir' && esCarpetaDeBusqueda(x.name)).slice(0, 40).map(x => mirar(x.name)))
      carpetas = arriba.map(({ ruta, peso }) => ({ ruta, peso }))
      // Todo en una o dos carpetas (src/, app/): se pregunta por las de adentro de la que más pesa.
      const mayor = [...arriba].sort((a, b) => b.peso - a.peso)[0]
      if (carpetas.length < CARPETAS_PARA_PREGUNTAR && mayor !== undefined && mayor.adentro.length >= 2) {
        const adentro = await Promise.all(mayor.adentro.slice(0, 12).map(mirar))
        carpetas = [...carpetas.filter(c => c.ruta !== mayor.ruta), ...adentro.map(({ ruta, peso }) => ({ ruta, peso }))]
      }
    }
  } catch {
    carpetas = []
  }
  preguntas.carpetas = carpetas
  return carpetas
}

/** Lo que el proyecto ya sabe correr para comprobarse, leído de sus archivos de la raíz. */
async function comprobacionesDelProyecto($: $): Promise<string[]> {
  try {
    const nombres = (await $.fs.list()).map(x => x.name)
    const textos = new Map<string, string>()
    for (const n of ARCHIVOS_DE_COMPROBACION) {
      if (!nombres.includes(n)) continue
      try {
        textos.set(n, (await $.fs.read(n)).slice(0, 50_000))
      } catch {
        // Ilegible: como si no estuviera.
      }
    }
    return comprobacionesDe(nombres, n => textos.get(n))
  } catch {
    return []
  }
}

/** (a) ¿En qué parte del proyecto está? Las carpetas que más pesan (primero las que nombras) o lo que escribas. */
async function preguntarDonde($: $, carpetas: readonly Carpeta[], texto: string): Promise<string | undefined> {
  const x = xpq().donde
  const r = await preguntar($, x.pregunta, [...opcionesDonde(carpetas, texto), x.buscaClaude])
  const aceptada = r !== undefined && r !== '' && r !== x.buscaClaude
  await responder($, 'donde', aceptada)
  return aceptada ? x.nota(r) : undefined
}

/** (b) ¿Cómo sabremos que quedó? Lo que el proyecto ya sabe correr, «lo reviso yo» o lo que escribas. */
async function preguntarListo($: $, comprobaciones: readonly string[]): Promise<string | undefined> {
  const xp = xpq()
  const x = xp.listo
  const opciones = opcionesListo(comprobaciones, xp)
  const r = await preguntar($, x.pregunta, [...opciones.map(o => o.etiqueta), x.yo])
  const aceptada = r !== undefined && r !== '' && r !== x.yo
  await responder($, 'listo', aceptada)
  if (!aceptada) return undefined
  const criterio = opciones.find(o => o.etiqueta === r)?.criterio ?? r
  vivo.memoria.listo = criterio
  return x.nota(criterio)
}

/** (c) Dos correcciones sobre lo mismo: empezar en limpio con el pedido mejorado, buscar la causa o seguir. */
async function comoSeguir($: $, contexto: number): Promise<{ drop?: string; nota?: string }> {
  const xp = xpq()
  const x = xp.fallos
  const e = entrevista
  const opciones = opcionesFallos(contexto, e.tarea !== undefined)
  const etiquetas = opciones.map((o, i) => (i === 0 ? xp.recomendado(x.opcion[o]) : x.opcion[o]))
  const r = await preguntar($, x.pregunta(contexto >= CONTEXTO_PARA_LIMPIAR ? formatearTokens(contexto) : undefined), etiquetas)
  const elegida = r === undefined ? undefined : opciones[etiquetas.indexOf(r)]
  const aceptada = r !== undefined && r !== '' && elegida !== 'seguir'
  await responder($, 'fallos', aceptada)
  if (!aceptada) return {}
  if (elegida === 'limpio' && e.tarea !== undefined) {
    await pasarALimpio($, armarPedidoMejorado(e.tarea, e.correcciones, vivo.idioma), contexto)
    return { drop: xe().limpiando }
  }
  return { nota: elegida === 'causa' ? x.nota : x.notaLibre(r) }
}

/** (d) Tres tareas o más en un mensaje: una por una (va la primera; cada siguiente, al cuadro al terminar) o todas juntas. */
async function separarTareas($: $, tareas: readonly Tarea[]): Promise<{ texto?: string; nota?: string }> {
  const xp = xpq()
  const x = xp.tareas
  const una = xp.recomendado(x.una)
  const r = await preguntar($, x.pregunta(tareas.length), [una, x.todas])
  const aceptada = r !== undefined && r !== '' && r !== x.todas
  await responder($, 'tareas', aceptada)
  if (!aceptada) return {}
  if (r !== una) return { nota: x.notaLibre(tareas.length, r) }
  const primera = tareas[0]
  if (primera === undefined) return {}
  preguntas.cola = { tareas: tareas.slice(1), total: tareas.length, ignoradas: 0 }
  void anotarDiagnostico($, `tareas: ${tareas.length}, una por una`)
  return { texto: primera.mensaje, nota: x.nota(1, tareas.length) }
}

/** ¿Llegó la tarea que Toki dejó en el cuadro? La nota para Claude. Si mandas otra cosa dos veces, la lista se deja. */
function siguienteDeLaCola(texto: string): string | undefined {
  const c = preguntas.cola
  const t = c?.enCuadro
  if (c === undefined || t === undefined) return undefined
  c.enCuadro = undefined
  if (!esLaTarea(texto, t.tarea)) {
    c.ignoradas += 1
    if (c.ignoradas >= 2) preguntas.cola = undefined
    return undefined
  }
  c.ignoradas = 0
  c.tareas = c.tareas.filter(x => x !== t)
  if (c.tareas.length === 0) preguntas.cola = undefined
  return xpq().tareas.nota(c.total - c.tareas.length, c.total)
}

/** Terminó una tarea de la lista: la siguiente al cuadro, si está vacío y no hay otro mensaje por devolver. */
async function siguienteTareaAlCuadro($: $): Promise<void> {
  const c = preguntas.cola
  const t = c?.tareas[0]
  if (c === undefined || t === undefined || vivo.enTurno || guardia.devolver !== undefined) return
  try {
    if ((await $.prompt.read()).text.trim() !== '') return
    if (!(await $.prompt.fill({ text: t.mensaje, mode: 'replace' })).isFilled) return
  } catch {
    return
  }
  c.enCuadro = t
  $.ui.toast(xpq().tareas.enCuadro(c.total - c.tareas.length + 1, c.total), { timeoutMs: 10_000 })
}

/**
 * Claude guardó el spec con su criterio de listo: ¿dejarlo como /goal? Claude Code lo revisa
 * cada vez que Claude va a detenerse. Con el guardia de empresa no: ahí los hooks van restringidos.
 */
async function proponerGoal($: $): Promise<void> {
  if (vivo.enTurno || config.guardiaEmpresa || entrevista.modo === 'no' || !ruta.interactivo) return
  await leerPreguntas($)
  if (callada('goal')) return
  let criterio: string | undefined
  try {
    criterio = criterioDeSpec(await $.fs.read(RUTA_SPEC))
  } catch {
    return
  }
  if (criterio === undefined) return
  vivo.memoria.listo = criterio
  const x = xpq().goal
  const r = await preguntar($, x.pregunta(criterio), [x.si, x.no])
  const aceptada = r !== undefined && r !== '' && r !== x.no
  await responder($, 'goal', aceptada)
  if (!aceptada) return
  const alCuadro = async (texto: string, aviso: string): Promise<void> => {
    if (await $.prompt.fill({ text: texto, mode: 'replace' }).then(f => f.isFilled, () => false)) $.ui.toast(aviso, { timeoutMs: 10_000 })
  }
  // Lo que escribiste en vez de elegir va al cuadro: lo revisas antes de mandarlo.
  if (r !== x.si) return alCuadro(`/goal ${r}`, x.tuyo)
  const condicion = x.condicion(criterio)
  try {
    await $.command.run({ command: 'goal', args: condicion })
    void anotarDiagnostico($, 'goal: puesto con el criterio del spec')
  } catch (err) {
    void anotarDiagnostico($, `goal: no se pudo (${String(err).slice(0, 160)})`)
    await alCuadro(`/goal ${condicion}`, x.enCuadro)
  }
}

/**
 * (e) Antes de compactar: ¿algo que Claude no deba olvidar? Lo que escribes va al resumen y a la
 * nota de después; lo que eliges, a las instrucciones de este resumen. Una vez por tramo.
 */
async function preguntarQueRecordar($: $, pct?: number): Promise<void> {
  if (!config.memoria || entrevista.modo === 'no' || !ruta.interactivo) return
  // Cerca del umbral se pregunta al terminar el turno: si ya mandaste otro mensaje, llegaría tarde.
  if (pct !== undefined && vivo.enTurno) return
  await leerPreguntas($)
  if (callada('recordar') || preguntas.recordarEn === vivo.ultimaCompactacion) return
  preguntas.recordarEn = vivo.ultimaCompactacion
  const x = xpq().recordar
  const r = await preguntar($, x.pregunta(pct), [x.nada, x.enfasis.reglas, x.enfasis.probado])
  const aceptada = r !== undefined && r !== '' && r !== x.nada
  await responder($, 'recordar', aceptada)
  if (!aceptada) return
  const enfasis = (['reglas', 'probado'] as const).find(k => x.enfasis[k] === r)
  if (enfasis !== undefined) vivo.memoria.enfasis = [...new Set([...(vivo.memoria.enfasis ?? []), enfasis])]
  else vivo.memoria.fijado = recordar(vivo.memoria.fijado ?? [], r.slice(0, 300), LIMITES_MEMORIA.fijado)
  await guardarMemoria($)
  $.ui.toast(x.anotado, { timeoutMs: 6_000 })
}

/**
 * Lo que Toki hace con un mensaje tuyo antes de que llegue a Claude: ofrecer empezar en
 * limpio (cambio de tema con mucho contexto) o preguntar cómo seguir tras dos correcciones,
 * separar un mensaje que trae varias tareas, pedirle a Claude que te entreviste si el pedido
 * es grande y vago, preguntarte dónde buscar o cómo sabremos que quedó, o un consejo corto
 * para pedir mejor. Una sola pregunta de Toki por mensaje: `yaSePregunto` dice si una guardia
 * ya la hizo. Si devuelve `texto`, eso sigue en vez de tu mensaje (la primera de tus tareas).
 */
async function entrevistaYConsejos($: $, textoCrudo: string, yaSePregunto = false): Promise<{ contexto?: string; drop?: string; texto?: string; pregunto?: boolean }> {
  let texto = quitarEtiquetasDeSistema(textoCrudo)
  entrevista.pendiente = undefined
  if (texto === '' || texto.startsWith('/')) return {}
  const notas: string[] = []
  let reemplazo: string | undefined
  let pregunto = false
  const salir = (drop?: string): { contexto?: string; drop?: string; texto?: string; pregunto?: boolean } => ({
    ...(drop !== undefined ? { drop } : {}),
    ...(notas.length > 0 ? { contexto: notas.join('\n\n') } : {}),
    ...(reemplazo !== undefined ? { texto: reemplazo } : {}),
    ...(pregunto ? { pregunto } : {}),
  })
  // La tarea que Toki dejó en el cuadro: Claude sabe que es una de varias.
  const deLaCola = siguienteDeLaCola(texto)
  if (deLaCola !== undefined) notas.push(deLaCola)
  const e = entrevista
  const previos = e.mensajes
  const recientes = e.recientes
  e.mensajes += 1
  e.recientes = [...recientes, texto.slice(0, 600)].slice(-3)
  if (e.modo === 'no' || !ruta.interactivo) return salir()
  if (!e.consejosLeidos) {
    e.consejosLeidos = true
    try {
      const guardado = await $.store.get(CLAVE_CONSEJOS)
      if (guardado !== null && typeof guardado === 'object') e.consejos = guardado as Partial<Record<Consejo, number>>
    } catch {
      // Sin memoria de consejos: se muestran de nuevo.
    }
  }
  await leerPreguntas($)
  const x = xe()
  let lectura = nivelHeuristico(texto, ruta.nivelPrevio, ruta.preguntoAntes)
  const contexto = vivo.usoCache?.tokens ?? vivo.tokensUltimoTurno
  // Si el aviso de caché vencido (u otra guardia) ya preguntó por este mensaje, no va otra pregunta.
  const yaPregunto = (): boolean => pregunto || yaSePregunto || (vivo.ultimoUsoCache > 0 && guardia.frioVisto === vivo.ultimoUsoCache)

  // (c) Segunda corrección sobre lo mismo: la conversación está llena de intentos fallidos. ¿Cómo seguir?
  if (esCorreccion(texto)) {
    if (e.grupo !== undefined) await contarEntrevista($, e.grupo === 'con' ? 'conCorr' : 'sinCorr')
    e.correcciones.push(texto)
    if (e.correcciones.length === 2 && !yaPregunto() && !callada('fallos')) {
      pregunto = true
      const r = await comoSeguir($, contexto)
      if (r.nota !== undefined) notas.push(r.nota)
      if (r.drop !== undefined) return salir(r.drop)
    }
    return salir()
  }

  const seguimiento = lectura.motivo === 'seguimiento'
  if (!seguimiento) e.correcciones = []
  if (!seguimiento && lectura.nivel !== 'trivial' && texto.split(/\s+/).length >= 8) e.tarea = texto

  // Cambio de tema con mucho contexto a cuestas: mejor empezar en limpio (y la entrevista, ya sin lastre).
  // «Esto hay que solucionarlo…» retoma lo anterior: limpiar borraría lo que necesita.
  const otroTema = !seguimiento && lectura.nivel !== 'trivial' && previos > 0 && !retomaLoAnterior(texto) && cambioDeTema(recientes, texto)
  if (otroTema && contexto >= CONTEXTO_CAMBIO_DE_TEMA && e.limpioRechazos < 2 && !yaPregunto()) {
    pregunto = true
    if (await ofrecerLimpio($, x.tema.pregunta(formatearTokens(contexto)), x.tema.si, x.tema.no, texto, contexto)) return salir(x.limpiando)
  }

  // Otra tarea: lo preguntado y el criterio de listo eran de la anterior.
  const nueva = !seguimiento && esTareaNueva({ mensajes: previos, recientes, texto })
  if (nueva) {
    preguntas.enTema.clear()
    preguntas.spec = false
    vivo.memoria.listo = undefined
  }

  // (d) Varias tareas en un mensaje: ¿una por una? Sobre el texto como lo escribiste, con sus saltos de línea.
  if (!seguimiento && !yaPregunto() && !callada('tareas')) {
    const tareas = partirTareas(textoCrudo)
    if (tareas !== undefined) {
      pregunto = true
      const r = await separarTareas($, tareas)
      if (r.nota !== undefined) notas.push(r.nota)
      if (r.texto !== undefined) {
        reemplazo = r.texto
        texto = quitarEtiquetasDeSistema(r.texto)
        lectura = nivelHeuristico(texto, ruta.nivelPrevio, ruta.preguntoAntes)
        e.tarea = texto
      }
    }
  }

  const entrada = { texto, nivel: lectura.nivel, motivo: lectura.motivo, interactivo: ruta.interactivo, mensajes: previos, recientes }
  const ev = e.silenciada ? { entrevistar: false as const } : evaluarEntrevista(entrada)
  let instruccion: string | undefined
  if ('omitido' in ev && ev.omitido === 'sin-preguntas') {
    contarSalto($)
  } else if (ev.entrevistar && !(e.modo === 'preguntar' && yaPregunto()) && (await decidirAyuda($, 'entrevista', empiezaTarea(texto))) === 'si') {
    let acepta = true
    if (e.modo === 'preguntar') {
      pregunto = true
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
      // La entrevista ya pregunta cómo sabremos que quedó, y lo deja en el spec.
      preguntas.enTema.add('listo')
      void anotarDiagnostico($, `entrevista: ${ev.porque}`)
    }
  }
  if (instruccion === undefined && esPedidoGrande(entrada)) {
    e.grupo = 'sin'
    await contarEntrevista($, 'sin')
  }
  if (instruccion !== undefined) notas.push(instruccion)

  // (a) y (b): lo que una respuesta tuya le ahorra a Claude, si no hubo entrevista ni otra pregunta.
  if (instruccion === undefined && !seguimiento && !yaPregunto()) {
    const l = { texto, nivel: lectura.nivel, motivo: lectura.motivo }
    if (!callada('donde') && pideDonde({ ...l, nueva })) {
      // Con pocas carpetas, buscar sale barato: no vale una pregunta.
      const carpetas = await carpetasDelProyecto($)
      if (carpetas.length >= CARPETAS_PARA_PREGUNTAR) {
        pregunto = true
        preguntas.enTema.add('donde')
        const nota = await preguntarDonde($, carpetas, texto)
        if (nota !== undefined) notas.push(nota)
      }
    }
    if (!pregunto && !callada('listo') && !preguntas.enTema.has('listo') && pideListo(l)) {
      // Solo con lo que el proyecto ya sabe correr; sin eso queda el consejo.
      const comprobaciones = await comprobacionesDelProyecto($)
      if (comprobaciones.length > 0) {
        pregunto = true
        preguntas.enTema.add('listo')
        const nota = await preguntarListo($, comprobaciones)
        if (nota !== undefined) notas.push(nota)
      }
    }
  }

  // Un consejo corto, solo si no hubo entrevista ni pregunta, y cada tipo un par de veces.
  // Lo que Toki ya preguntó en esta tarea, o la pregunta que callaste, tampoco vuelve como consejo.
  if (instruccion === undefined && !seguimiento && !pregunto) {
    const agotado = (si: boolean, c: Consejo): Partial<Record<Consejo, number>> => (si ? { [c]: VECES_POR_CONSEJO } : {})
    const vistos = {
      ...e.consejos,
      ...agotado(callada('donde') || preguntas.enTema.has('donde'), 'ubicar'),
      ...agotado(callada('listo') || preguntas.enTema.has('listo'), 'verificar'),
      ...agotado(callada('tareas'), 'mezcla'),
    }
    const c = consejoDe(texto, lectura.nivel, vistos)
    if (c !== undefined) {
      e.consejos[c] = (e.consejos[c] ?? 0) + 1
      void $.store.set(CLAVE_CONSEJOS, e.consejos).catch(() => undefined)
      $.ui.toast(x.consejos[c], { timeoutMs: 10_000 })
      await contarEntrevista($, 'consejos')
    }
  }
  return salir()
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
  config.guardarScripts = options['guardarScripts'] !== false
  config.avisoCacheFrio = options['avisoCacheFrio'] !== false
  config.guardiaLimites = options['guardiaLimites'] !== false
  config.guardiaGenerados = options['guardiaGenerados'] !== false
  config.guardiaPegados = options['guardiaPegados'] !== false
  config.busquedas = options['resumirBusquedas'] !== false
  config.guardiaEmpresa = options[OPCION_EMPRESA] === true
  config.mcpDiferidos = leerDiferidos(options[OPCION_DIFERIDOS])
  config.compactarTambien = leerExtras(options[OPCION_TAMBIEN])
  familias.leido = false
  // La caché de los subagentes se decide de nuevo al empezar; si Toki puso la variable, sigue puesta (vive en el proceso).
  ttlSub.regimen = undefined
  ttlSub.fuera = undefined
  ttlSub.porGuardar = {}
  ttlSub.agentes.clear()
  ttlSub.grupos.clear()
  ttlSub.tipos.clear()
  // Lo que miden los testigos es de la tarea en curso: con el plugin recién cargado no hay ninguna.
  tareaAbierta = undefined
  ayudas.decidido.clear()
  ayudas.casos.clear()
  ayudas.pendientes.clear()
  // Si el guardia de empresa se salta prompt.compose se decide de nuevo, con un turno visto entero.
  vivo.composeVisto = false
  vivo.turnoVisto = undefined
  vivo.empresaIntentada = false
  vivo.empresaRevisada = false
  vivo.sonidos = options['sonidos'] !== false
  ruta.modoConfig = leerModo(options['recomendarModelo'])
  ruta.modo = ruta.modoConfig
  ruta.subagentes = options['subagentesSonnet'] !== false
  ruta.sonnetPrimero = options['sonnetPrimero'] === true
  entrevista.modo = leerModoEntrevista(options['entrevista'])
  preguntas.leido = false
  preguntas.estado = {}
  preguntas.carpetas = undefined
  preguntas.cola = undefined
  preguntas.trasTurno = false
  reiniciarPreguntas()
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
    await $.command.register({ name: 'toki-por-que', description: x.cmdPorQue, argumentHint: `${xf().pista} | ${txTestigos(vivo.idioma).pista}` })
    await $.command.register({ name: 'toki-modelo', description: xr().cmd, argumentHint: `preguntar | siempre | automatico | no | ${vivo.idioma === 'en' ? 'undo' : 'deshacer'}` })
    await $.command.register({ name: 'toki-sonnet', description: xr().sonnet.cmd, argumentHint: xr().sonnet.pista })
    await $.command.register({ name: 'toki-dieta', description: cmdDieta(vivo.idioma), argumentHint: txDieta(vivo.idioma).pista })
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
      // El uso de MCP y de skills se cuenta desde la primera sesión con la versión que lo mide.
      if ((await $.store.get(CLAVE_USO_MCP)) === undefined) await $.store.set(CLAVE_USO_MCP, leerUsoMcp(undefined, ahora))
      if ((await $.store.get(CLAVE_USO_SKILLS)) === undefined) await $.store.set(CLAVE_USO_SKILLS, leerUsoSkills(undefined, ahora))
    } catch {
      // Sin store: /toki-dieta cuenta desde hoy.
    }
    try {
      // Cambió qué MCP van bajo demanda (o la guardia de empresa): Claude Code vuelve a preguntar por las herramientas.
      const efectiva = config.guardiaEmpresa ? '' : config.mcpDiferidos.join(', ')
      const aplicada = await $.store.get(CLAVE_DIFERIDOS)
      if ((typeof aplicada === 'string' ? aplicada : '') !== efectiva) {
        $.ui.invalidate('tool.describe')
        await $.store.set(CLAVE_DIFERIDOS, efectiva)
      }
    } catch {
      // Sin store: queda lo que Claude Code ya tenía.
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
    try {
      ruta.calibracion = leerCalibracion(await $.store.get(CLAVE_CALIBRACION))
    } catch {
      // Sin dato: se empieza a medir.
    }
    try {
      ruta.pedidosMedidos = leerPedidosMedidos(await $.store.get(CLAVE_PEDIDOS))
    } catch {
      // Sin dato: la tabla de fábrica.
    }
    try {
      ruta.calidad = leerCalidad(await $.store.get(CLAVE_CALIDAD))
    } catch {
      // Sin dato: se empieza a contar.
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
    // Una conversación reanudada: lo que su último pedido dejó en el caché (una nueva no tiene nada).
    try {
      vivo.cachePrevio = leerCachePorSesion(await $.store.get(CLAVE_CACHE_SESIONES))[await $.session.id()]
    } catch {
      vivo.cachePrevio = undefined
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
    // La variable de la caché de los subagentes dura lo que el proceso: si la activaste, otra vez.
    await iniciarTtl($, ahora)
    // Sesión reanudada: recupera su último punto de control si es reciente (nunca el de otra sesión).
    const base = config.memoria ? await rutaMemoria($) : undefined
    if (base !== undefined) {
      try {
        const guardado = JSON.parse(await $.fs.read(`${base}.json`)) as PuntoDeControl
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
    if (await hayAlguien($)) await revisarGuardiaEmpresa($, ahora)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // Lo medido de esta conversación se acredita antes de olvidarla.
    await acreditar($)
    await cerrarTarea($)
    planHecho.listo = false
    planHecho.ofrecido = false
    await guardarUltimoPedido($)
    await guardarTtl($, await $.clock.now(), false)
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
      reiniciarPreguntas()
      await update($, sesion, () => SESION_VACIA)
      await update($, gasto, () => GASTO_VACIO)
      await update($, fallos, () => ({}))
      await update($, avisoMapaDado, () => false)
      empezarLimpio($, await $.clock.now())
      // ¿Tareas por hacer una por una? El /clear borró el cuadro: la siguiente vuelve (si no vuelve otro mensaje).
      if (preguntas.cola !== undefined && guardia.devolver === undefined) $.clock.after(300, () => void siguienteTareaAlCuadro($))
      devolverMensaje($)
    } else {
      preguntas.cola = undefined
    }
    // Otro final (salir, reanudar otra): lo propuesto ya no aplica.
    vivo.limpioPropuesto = undefined
    // La conversación que siga no tiene este caché (tras /clear sí comparte el comienzo).
    if (e.reason !== 'clear') vivo.cachePrevio = undefined
    return next(e)
  })

  // Antes de mandar tu mensaje: ¿qué modelo y esfuerzo merece? Solo lo que tú escribes.
  on('prompt.submit', async ($, e, next) => {
    const deLaPersona = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (e.command !== undefined || e.isMeta === true || e.turnId !== undefined || !deLaPersona) return next(e)
    ayudas.pendientes.clear()
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
    let pregunto = false
    try {
      const r = await entrevistaYConsejos($, texto, silenciar)
      if (r.drop !== undefined) return { drop: r.drop }
      contexto = r.contexto
      texto = r.texto ?? texto
      pregunto = r.pregunto === true
    } catch (err) {
      $.ui.log(`Toki, entrevista: ${String(err)}`, { to: 'debug' })
    }
    try {
      if (!pregunto) await ofrecerSonnetTrasPlan($, texto)
    } catch (err) {
      $.ui.log(`Toki, plan en Sonnet: ${String(err)}`, { to: 'debug' })
    }
    try {
      await planearTurno($, texto, silenciar || pregunto)
    } catch (err) {
      $.ui.log(`Toki, modelo y esfuerzo: ${String(err)}`, { to: 'debug' })
    }
    try {
      await contarMensaje($, texto, frio)
    } catch {
      // Solo estadística.
    }
    await notaAntesDelMensaje($)
    const base = texto === e.text ? e : { ...e, text: texto }
    // La instrucción va como contexto: Claude la lee junto a tu mensaje y tú no ves nada distinto.
    const r = await next(contexto === undefined ? base : { ...base, context: [...(e.context ?? []), contexto] })
    // Otro hook lo frenó: no hay turno, y ni la entrevista ni el plan pueden quedar para el de otro mensaje.
    if ('drop' in r) {
      entrevista.pendiente = undefined
      preguntas.cola = undefined
      descartarPlan()
    }
    return r
  })

  // Subagentes con encargos simples: Sonnet. Empiezan sin contexto, no se pierde caché.
  on('agent.spawn', async ($, e, next) => {
    const modelo = ruta.subagentes && ruta.modo !== 'no' && e.model === undefined ? modeloSubagente(e.subagentType, e.prompt, e.parentModel, sonnetActivo()) : undefined
    const r = await next(modelo === undefined ? e : { ...e, model: modelo })
    const id = (r as { agentId?: string }).agentId
    // Los del mismo tipo comparten el comienzo del caché.
    if (id !== undefined) recordarEn(ttlSub.tipos, id, e.subagentType)
    if (modelo === undefined) return r
    // Sin Toki habría ido en el modelo de la conversación: contra ese se mide.
    if (id !== undefined) recordarAgente(id, familiaDe(e.parentModel) ?? familiaDe(vivo.modelo) ?? 'opus')
    if (familiaDe((r as { model?: string }).model) === 'sonnet') {
      ruta.subagentesEnSonnet += 1
      void anotarDiagnostico($, `subagente ${e.subagentType} en Sonnet (el padre iba en ${nombreCorto(e.parentModel)})`)
      if (!ruta.avisoSubagentes) {
        ruta.avisoSubagentes = true
        $.ui.toast(xr().subagentes, { timeoutMs: 7000 })
      }
    }
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      vivo.turnoVisto = e.turnId
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
      vivo.exploracion = EXPLORACION_VACIA
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
      // Tras recargar el plugin no hay session.start: la caché de los subagentes se decide aquí.
      if (ttlSub.regimen === undefined && ttlSub.fuera === undefined) {
        void $.clock.now().then(
          ahora => iniciarTtl($, ahora),
          () => undefined,
        )
      }
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
    // Desde que sale corre el plazo del caché: contra esta hora se mide la pausa del siguiente.
    const salida = await $.clock.now()
    const respuesta = yield* next(pedido)
    if (e.agentId === undefined && e.index === 0 && e.turnId === modeloPorContar.turno) {
      modeloPorContar.turno = undefined
      const familia = familiaDe(respuesta.usage?.model ?? pedido.model)
      if (familia !== undefined) await alaSemana($, { modelo: familia })
    }
    // Cada pedido lee o escribe el caché: desde aquí corre su vida (1 h o 5 min).
    if (e.agentId === undefined && respuesta.usage !== null) {
      vivo.ultimoUsoCache = await $.clock.now()
      vivo.modeloEnUso = respuesta.usage.model
    }
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
      // Un subagente: ¿le convendría (o le conviene) la caché de 1 hora?
      let releido: number | undefined
      if (e.agentId !== undefined) {
        try {
          releido = medirCacheSubagente(e.agentId, u, familiaDe(u.model) ?? familiaDe(pedido.model) ?? 'opus', salida)
        } catch {
          // Solo estadística.
        }
      }
      // Entre alPedido (que anota la compactación) y medirPedido (que la da por pasada).
      let reescritoPorToki = 0
      if (e.agentId === undefined) {
        try {
          reescritoPorToki = await anotarEscritura($, e, pedido, u, salida)
        } catch {
          // Solo estadística.
        }
      }
      try {
        // Después de alPedido: si este pedido trae la compactación, ya quedó anotada.
        const c = medirPedido(e, pedido, u, sin, await $.clock.now(), reescritoPorToki, releido)
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
      // Si Claude te preguntó algo, lo suyo va primero: ni /goal, ni la siguiente tarea, ni otras preguntas.
      const terminado = !e.isAborted && e.reason === 'answer' && !ruta.preguntoAntes
      // Claude guardó el spec en este turno (o en uno que terminó preguntando): ¿su criterio como /goal?
      const goal = preguntas.spec && terminado
      if (goal) preguntas.spec = false
      preguntas.trasTurno = goal
      try {
        await cerrarEntrevista($, e.turnId, e.answer, e.isAborted ? 'aborted' : e.reason)
      } catch (err) {
        $.ui.log(`Toki, entrevista: ${String(err)}`, { to: 'debug' })
      }
      const medicion = ruta.medicion
      if (medicion !== undefined && medicion.turno === e.turnId) {
        ruta.medicion = undefined
        void anotarDiagnostico($, lineaUso(medicion, e.isAborted))
        // Un mensaje entero que Toki bajó de esfuerzo, o su testigo: a la calibración.
        if (!e.isAborted && e.reason === 'answer') await registrarCalibracion($, ruta.plan, medicion, e.turnId)
        // Cuántos pedidos usó de verdad: la próxima estimación de este tipo de mensaje parte de ahí.
        if (!e.isAborted && e.reason === 'answer') await registrarPedidos($, medicion)
        // Un mensaje que Toki bajó, o su testigo: a veces pregunta si quedó bien (cero tokens).
        if (!e.isAborted && e.reason === 'answer') await anotarCalidad($, ruta.plan, e.turnId, ahora)
      }
      // Lo que ahorró (o costó de más) este mensaje, medido, a la sesión, la semana y el total.
      await acreditar($)
      if (vivo.breve === 'agregar') await avisarBreve($)
      await guardarUltimoPedido($)
      await guardarCacheSesion($)
      // La caché de los subagentes: si conviene la de 1 hora, o si la de Toki no paga.
      await guardarTtl($, ahora, terminado)
      if (config.memoria) await guardarMemoria($)
      await refrescarUso($, true)
      const uso = vivo.usoCache
      vivo.tokensUltimoTurno = uso?.tokens ?? vivo.tokensUltimoTurno
      vivo.ultimoTurnoCompleto = ahora
      if (goal) $.clock.after(DEMORA_CALIDAD, () => void proponerGoal($))
      if (terminado && preguntas.cola !== undefined) $.clock.after(500, () => void siguienteTareaAlCuadro($))
      // Cerca de donde Claude Code compacta: ¿algo que Claude no deba olvidar? Una vez por tramo.
      const pct = uso?.pct
      if (terminado && !preguntas.trasTurno && config.memoria && pct !== undefined && pct >= PCT_PARA_RECORDAR && preguntas.recordarEn !== vivo.ultimaCompactacion) {
        preguntas.trasTurno = true
        $.clock.after(DEMORA_CALIDAD, () => void preguntarQueRecordar($, pct))
      }
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
      // Hubo pedidos y prompt.compose no corrió: las respuestas breves van por otro lado.
      if (config.conciso && vivo.breve === undefined && !vivo.nudgeConciso && vivo.pedidoPrevio !== undefined) await respaldoBreve($)
      // Un turno entero, con pedidos, sin prompt.compose: el guardia de empresa.
      const porDetectar = !config.guardiaEmpresa && !vivo.composeVisto && !vivo.empresaIntentada && e.usage !== undefined && vivo.turnoVisto === e.turnId
      if ((porDetectar || !vivo.empresaRevisada) && (await hayAlguien($))) {
        // En la app, al empezar a veces aún no hay superficie: la revisión de los 30 días va aquí.
        if (!vivo.empresaRevisada) await revisarGuardiaEmpresa($, ahora)
        // Prender la opción recarga el plugin: fuera del turno.
        if (porDetectar) {
          vivo.empresaIntentada = true
          $.clock.after(1_000, () => void prenderGuardiaEmpresa($, ahora))
        }
      }
      if (vivo.composeVisto && vivo.empresa.revisando === true) {
        vivo.empresa = terminarRevision(vivo.empresa)
        void anotarDiagnostico($, 'guardia de empresa: ya no está (prompt.compose corrió); la opción queda apagada')
        await $.store.set(CLAVE_EMPRESA, vivo.empresa).catch(() => undefined)
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

  // Con el guardia de empresa, Claude Code se salta estos hooks y le avisa a Claude cada vez
  // (~200 tokens): con la opción prendida no se registran y van sus alternativas (la nota de
  // respuestas breves, detectarMarca, revisarModelo).
  if (!config.guardiaEmpresa) {
    // Respuestas breves desde el primer mensaje: una sección fija al final del system prompt.
    on('prompt.compose', async ($, e, next) => {
      vivo.composeVisto = true
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
  }

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
    const escribeSpec = (herramienta === 'Write' || herramienta === 'Edit') && typeof entrada.file_path === 'string' && entrada.file_path.replace(/\\/g, '/').endsWith(RUTA_SPEC)
    // Claude cerró el plan (o guardó el spec de la entrevista): el próximo mensaje puede ir a ejecutarlo.
    if (herramienta === 'ExitPlanMode' || escribeSpec) planHecho.listo = true
    // Y el criterio de listo del spec, al terminar el turno, se propone como /goal.
    if (escribeSpec) preguntas.spec = true
    if ((herramienta === 'Edit' || herramienta === 'Write' || herramienta === 'MultiEdit') && typeof entrada.file_path === 'string') {
      vivo.memoria.archivosEditados = recordar(vivo.memoria.archivosEditados, entrada.file_path, LIMITES_MEMORIA.archivos)
    }
    // Archivos generados (lockfiles, minificados, build): la primera lectura completa se frena; repetirla la deja pasar.
    // En una tarea de testigo (o con la guardia en pausa) pasan enteras, sin contar.
    if (config.guardiaGenerados && herramienta === 'Read' && typeof entrada.file_path === 'string' && entrada.offset === undefined && entrada.limit === undefined) {
      const tipo = tipoGenerado(entrada.file_path)
      const previas = tipo === undefined ? 0 : (vivo.generadosFrenados.get(entrada.file_path) ?? 0)
      if (tipo !== undefined && previas < 2 && (await ayudar($, 'generados')) === 'si') {
        const veces = previas + 1
        vivo.generadosFrenados.set(entrada.file_path, veces)
        if (veces === 1) {
          const nombre = entrada.file_path.split(/[\\/]/).pop() ?? entrada.file_path
          const tg = textosGenerados[vivo.idioma === 'en' ? 'en' : 'es']
          $.ui.toast(tg.toast(nombre), { timeoutMs: 6000 })
          await alaSemana($, { frenos: 1 })
          return { deny: tg.frenado(nombre, tipo) }
        }
        // En vivo, Claude repetía la lectura entera de inmediato: la segunda trae solo un tramo; la tercera, todo.
        return next({ ...e, limit: TRAMO_GENERADO } as typeof e)
      }
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
    // Un comando largo que corre igual otra vez: si corre bien, Toki lo guarda y le dice a Claude cómo repetirlo.
    const repetido = herramienta === 'Bash' && config.guardarScripts ? revisarScript($, (e as { command?: unknown }).command) : undefined
    try {
      const ran = await next(e)
      if (ran.deny !== undefined || ran.isError === true) return ran
      const notas = [nudgeLectura, await seguirExploracion($, herramienta, e, ran), repetido === undefined ? undefined : await guardarScript($, repetido.comando, repetido.veces)].filter(
        (n): n is string => n !== undefined,
      )
      return notas.length > 0 ? { ...ran, context: [...(ran.context ?? []), ...notas] } : ran
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

  // Lo que el guardia de empresa se salta: con la opción prendida no se registra (ver prompt.compose).
  if (!config.guardiaEmpresa) {
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
      // Un /compact tuyo sin instrucciones: ¿algo que Claude no deba olvidar?
      if (e.trigger === 'manual' && (e.instructions ?? '').trim() === '') await preguntarQueRecordar($)
      if (config.memoria) {
        await guardarMemoria($)
        if (!estaVacia(vivo.memoria)) {
          const extra = instruccionesDeCompactacion(vivo.memoria, vivo.idioma)
          // El botón de la barra ya la manda en el /compact: no se repite.
          if (e.instructions?.includes(extra) !== true) entrada = { ...e, instructions: e.instructions ? `${e.instructions}\n\n${extra}` : extra }
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
  }

  // Motor (Bash): compactar salidas ruidosas, rescatar el error del final y detectar bucles.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const comando = e.command
    await cargarAprendizaje($)
    // Un testigo va como sin Toki: ni límite ampliado ni compactación.
    const compactable = prepararComando(comando, e.agentId) && (await conCompactacion($, comando))
    const busqueda = !compactable && config.compresion && config.busquedas && !vivo.sinCompactar.has(comando.trim()) ? tipoBusqueda(comando) : undefined
    // En segundo plano, Claude lee la salida después y por otro lado: ahí el corte queda como está.
    const corte = !compactable && busqueda === undefined && config.compresion && e.run_in_background !== true ? await planearCorte($, 'Bash', comando) : undefined
    if (compactable) await ampliarLimite($)
    let ran
    try {
      // El modelo sigue viendo su comando original en el historial; solo cambia cómo se ejecuta.
      ran = await next(corte ? { ...e, command: corte.comando } : e)
    } finally {
      if (compactable) await restaurarLimite($)
    }
    if (ran.deny !== undefined) return ran
    const entera = ran.isError === true ? undefined : await salidaEntera($, ran.result)
    if (busqueda !== undefined && entera !== undefined) {
      const nuevo = await resumirBusquedaShell($, comando, busqueda, entera, e.agentId)
      if (nuevo !== undefined) return { result: { ...entera, ...nuevo, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    const aviso = await despuesDeEjecutar($, comando, ran.isError === true, ran.text, e.agentId)
    if (entera !== undefined && corte === undefined) {
      const repetida = await revisarRepetida($, 'Bash', comando, e.agentId, entera)
      if (repetida !== undefined) return { result: { ...entera, ...repetida, persistedOutputPath: undefined, persistedOutputSize: undefined } }
    }
    if (!compactable && busqueda === undefined && corte === undefined) await anotarOportunidadShell($, comando, ran.isError === true, ran.text, entera)
    if (compactable) {
      if (ran.isError === true) {
        const texto = await compactarFallo($, comando, ran.text ?? '', e.agentId)
        if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
      } else if (entera !== undefined) {
        const nuevo = await compactarExito($, comando, entera, e.agentId)
        if (nuevo !== undefined) return { result: { ...entera, ...nuevo, persistedOutputPath: undefined, persistedOutputSize: undefined } }
      }
    }
    if (corte !== undefined) {
      if (ran.isError === true) return { deny: [await rehacerCorteFallido($, comando, corte, ran.text ?? ''), aviso].filter(Boolean).join('\n\n') }
      if (entera !== undefined && entera.backgroundTaskId === undefined && entera.isImage !== true) {
        return { result: { ...entera, stdout: await rehacerCorte($, comando, corte, entera.stdout), persistedOutputPath: undefined, persistedOutputSize: undefined } }
      }
    }
    if (aviso !== undefined && ran.isError === true) return { deny: `${ran.text ?? ''}\n\n${aviso}` }
    return conAvisoMapa($, 'Bash', comando, ran)
  })

  // Motor (PowerShell, Windows sin Git Bash): lo mismo. Ante cualquier sorpresa, la salida original.
  on('tool.call', { tool: /^PowerShell$/ }, async ($, e, next) => {
    const comando = (e as { command?: unknown }).command
    if (typeof comando !== 'string') return next(e)
    await cargarAprendizaje($)
    const compactable = prepararComando(comando, e.agentId) && (await conCompactacion($, comando))
    const enFondo = (e as { run_in_background?: unknown }).run_in_background === true
    const corte = !compactable && config.compresion && !enFondo ? await planearCorte($, 'PowerShell', comando) : undefined
    const ran = await next(corte ? ({ ...e, command: corte.comando } as typeof e) : e)
    if (ran.deny !== undefined) return ran
    const aviso = await despuesDeEjecutar($, comando, ran.isError === true, ran.text, e.agentId)
    try {
      const salida = ran.isError === true ? undefined : comoSalidaShell(ran.result)
      const r = salida === undefined ? undefined : await salidaEntera($, salida)
      const conSalida = (nuevo: { stdout: string; stderr: string }) => {
        const base = ran.result as Record<string, unknown>
        const resultado: Record<string, unknown> = { ...base, ...nuevo }
        if ('persistedOutputPath' in base) resultado['persistedOutputPath'] = undefined
        if ('persistedOutputSize' in base) resultado['persistedOutputSize'] = undefined
        return { result: resultado }
      }
      if (r !== undefined && corte === undefined) {
        const repetida = await revisarRepetida($, 'PowerShell', comando, e.agentId, r)
        if (repetida !== undefined) return conSalida(repetida)
      }
      if (!compactable && corte === undefined) await anotarOportunidadShell($, comando, ran.isError === true, ran.text, r)
      if (compactable) {
        if (ran.isError === true) {
          const texto = await compactarFallo($, comando, ran.text ?? '', e.agentId)
          if (texto !== undefined) return { deny: aviso !== undefined ? `${texto}\n${aviso}` : texto }
        } else if (salida === undefined) anotarMotivo(comando, 'formato')
        else if (r !== undefined) {
          const nuevo = await compactarExito($, comando, r, e.agentId)
          if (nuevo !== undefined) return conSalida(nuevo)
        }
      }
      if (corte !== undefined) {
        if (ran.isError === true) return { deny: [await rehacerCorteFallido($, comando, corte, ran.text ?? ''), aviso].filter(Boolean).join('\n\n') }
        if (r !== undefined && r.backgroundTaskId === undefined && r.isImage !== true) {
          return conSalida({ stdout: await rehacerCorte($, comando, corte, r.stdout), stderr: r.stderr })
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

  on('command.run', { command: 'toki-por-que' }, async ($, e) => {
    const olvido = /^(olvidar|forget)\b\s*(.*)$/i.exec(e.args.trim())
    if (olvido !== null) return { text: await olvidarFamilias($, olvido[2] ?? '') }
    if (/^(reanudar|resume)\b/i.test(e.args.trim())) return { text: await reanudarPausadas($) }
    const texto = await textoDecisiones($)
    const propuestas = mejoresOportunidades(await oportunidadesGuardadas($), config.compactarTambien)
    if (propuestas.length > 0 && (await hayAlguien($))) $.clock.after(DEMORA_DIETA, () => void ofrecerFamilias($, propuestas))
    return { text: texto }
  })

  on('command.run', { command: 'toki-modelo' }, async ($, e) => {
    const x = xr()
    const arg = e.args.trim().toLowerCase()
    if (/^(deshacer|deshaz|undo)$/.test(arg)) {
      const ultima = ruta.historial[ruta.historial.length - 1]
      const antes = await deshacerEleccion($)
      if (antes === undefined || ultima === undefined) return { text: x.nadaQueDeshacer }
      return { text: x.deshacerHecho(nombreCorto(antes.modelo), x.esfuerzo[antes.esfuerzo], x.nivel[ultima.nivel]) }
    }
    if (/^(calidad|quality)$/.test(arg)) {
      await cambiarCalidad($, c => ({ ...c, apagada: false }))
      return { text: x.calidad.reactivada }
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
      // Prenderla de nuevo también devuelve las preguntas que callaste.
      if (entrevista.modo !== 'no') {
        preguntas.estado = {}
        preguntas.leido = true
        await $.store.set(CLAVE_PREGUNTAS, {}).catch(() => undefined)
      }
      return { text: x.modoCambiado(x.modos[entrevista.modo]) }
    }
    const s = (await read($, sesion)).entrevista ?? { con: 0, conCorr: 0, sin: 0, sinCorr: 0, consejos: 0 }
    await leerPreguntas($)
    const xp = xpq()
    const activas = entrevista.modo === 'no' ? [] : TIPOS_PREGUNTA.filter(t => !callada(t)).map(t => xp.nombre[t])
    const calladas = TIPOS_PREGUNTA.filter(t => callada(t)).map(t => xp.nombre[t])
    return { text: [...x.estado(entrevista.modo, s), xp.estado(activas, calladas), '', x.uso].join('\n') }
  })

  // MCP bajo demanda (/toki-dieta mcp): las herramientas de esos servidores quedan tras ToolSearch.
  // Solo con servidores elegidos y sin guardia de empresa, que podría saltarse el hook.
  if (!config.guardiaEmpresa && config.mcpDiferidos.length > 0) {
    on('tool.describe', { tool: /^mcp__/ }, async ($, e, next) => {
      const r = await next(e)
      return esDiferido(e.tool, e.provider.plugin, config.mcpDiferidos) ? { ...r, isDeferred: true } : r
    })
  }

  // Toda skill usada, por Claude o con /nombre (también en subagentes): /toki-dieta dice cuáles no usaste.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    await anotarSkill($, (e as { skill?: unknown }).skill)
    return next(e)
  })
  on('command.run', async ($, e, next) => {
    await anotarSkill($, e.command)
    return next(e)
  })

  // Toda llamada a MCP, también de subagentes: /toki-dieta dice qué servidor no usaste.
  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    try {
      const ahora = await $.clock.now()
      await $.store.set(CLAVE_USO_MCP, anotarUso(leerUsoMcp(await $.store.get(CLAVE_USO_MCP), ahora), String(e.tool), ahora))
    } catch {
      // Es solo estadística.
    }
    const ran = await next(e)
    if (!config.compresion || ran.deny !== undefined || ran.isError === true) return ran
    try {
      const nuevo = await compactarMcp($, String(e.tool), ran.result, e.agentId)
      if (nuevo !== undefined) return { result: nuevo }
    } catch {
      // Ante cualquier sorpresa, la salida original.
    }
    return ran
  })

  // Claude leyó un original que Toki archivó: se descuenta del ahorro (también en subagentes).
  on('tool.call', { tool: /^(Read|Grep|Bash|PowerShell)$/ }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    try {
      await contarRecuperacion($, e, ran, e.agentId)
    } catch {
      // Es solo contabilidad.
    }
    return ran
  })

  // /toki-dieta informa; con `mcp`, `memoria` o `restaurar` arregla o deshace. Tras el informe, si hay
  // algo que arreglar y alguien mirando, lo pregunta.
  on('command.run', { command: 'toki-dieta' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (/^(restaurar|restore|deshacer|undo)$/.test(arg)) return { text: await restaurarDieta($) }
    if (/^(subagentes|subagents)$/.test(arg)) return { text: await activarCacheSubagentes($) }
    const r = await revisarDieta($)
    if (arg === 'mcp') return { text: diferirMcp($, r) }
    if (/^(memoria|memory)$/.test(arg)) return { text: await adelgazarMemoria($, r) }
    if ((r.arreglos.mcp.length > 0 || r.arreglos.memoria.length > 0 || r.ofrecerTtl) && (await hayAlguien($))) $.clock.after(DEMORA_DIETA, () => void ofrecerArreglos($, r))
    const ttl = textoTtl(r.ttl, { ahora: r.opciones.ahora, idioma: vivo.idioma, fuera: ttlSub.fuera })
    return { text: [textoDieta(r.dieta, r.opciones), ...(ttl.length > 0 ? ['', ...ttl] : [])].join('\n') }
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
              <Box flexDirection="row" flexWrap="nowrap" gap={2} alignItems="center" marginBottom={1}>
                {mascotaGrafica($, e, actividad, 120)}
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
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
            {lineasGasto(x, r.gasto, r.sesion.reescrito).map(l => (
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
        {r.oportunidad.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{x.oportunidadTitulo}</Text>
            {r.oportunidad.map(l => (
              <Text color="claude" wrap="wrap">
                {'  • '}
                {l}
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
        <Text dimColor>{grafico ? '' : '· '}{x.cache}</Text>,
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
      uso?.cincoHoras !== undefined && (grafico || !angosto)
        ? chip('cinco', [
            <Text dimColor>· {x.cincoHoras}</Text>,
            <Text color={colorDePorcentaje(uso.cincoHoras)}>{Math.round(uso.cincoHoras)}%</Text>,
            guardia.proyeccion.five_hour?.agotaEn !== undefined ? <Text color="warning">{xg().limite.seAcaba(hora(guardia.proyeccion.five_hour.agotaEn, 'five_hour', vivo.idioma))}</Text> : '',
          ])
        : null,
      uso?.semana !== undefined && (grafico || !angosto)
        ? chip('semana', [
            <Text dimColor>· {x.semana}</Text>,
            <Text color={colorDePorcentaje(uso.semana)}>{Math.round(uso.semana)}%</Text>,
            guardia.proyeccion.seven_day?.agotaEn !== undefined ? <Text color="warning">{xg().limite.seAcaba(hora(guardia.proyeccion.seven_day.agotaEn, 'seven_day', vivo.idioma))}</Text> : '',
          ])
        : null,
    ]
    const botonCompactar = dicho.accion === 'compactar' ? <Button key="compactar" variant="primary" hotkey="c" label={vivo.actividad === 'compactando' ? x.compactando : x.compactarAhora} onPress={() => void compactarDesdeBarra($)} /> : null
    const botonLuego =
      dicho.accion === 'compactar' && (pct ?? 0) < 70 ? (
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
      ) : null
    const controles = (
      <Box flexDirection="row" gap={1} flexShrink={0}>
        {botonTamano}
        {botonOcultar}
      </Box>
    )
    // En la app: Toki dentro del anillo del contexto; a su lado, título, frase, botones y las demás cifras.
    const { Svg } = $.ui.resolve(e)
    // La primera medida es el contexto: ya la dicen el anillo y el título.
    const otrasMedidas = medidas.slice(1)
    const cuerpoGrafico = (
      <Box flexDirection="row" flexWrap="nowrap" gap="md" alignItems="center">
        <Box flexShrink={0}>
          <Svg source={anilloSvg(actividad, pct)} alt={`${cuadro(actividad, 0)} ${pctTexto}`} width={84} height={84} />
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} rowGap="xs">
          <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="xs" alignItems="center">
            <Text color="claude" bold>
              Toki
            </Text>
            <Text dimColor>
              {x.contexto} <Text color={colorDePorcentaje(pct)}>{pctTexto}</Text>
              {uso !== undefined ? ` ${x.deVentana(formatearTokens(uso.ventana))}` : ''}
            </Text>
            {chipTope !== undefined && <Text color={chipTope.color}>· {chipTope.texto}</Text>}
            {chipModelo !== undefined && (
              <Box flexShrink={1} minWidth={0}>
                <Text dimColor wrap="truncate-end">
                  · {chipModelo}
                </Text>
              </Box>
            )}
          </Box>
          <Text color={dicho.tono === 'peligro' ? 'text' : colorFrase} wrap="wrap">
            {dicho.texto}
          </Text>
          {botonCompactar !== null && (
            <Box flexDirection="row" flexWrap="wrap" gap="sm" alignItems="center">
              {botonCompactar}
              {botonLuego}
            </Box>
          )}
          {avisoRuta !== undefined && (
            <Box flexDirection="row" flexWrap="wrap" gap="sm" alignItems="center">
              <Text color="warning" bold={destello} wrap="wrap">
                {avisoRuta.texto}
              </Text>
              {botonDeshacer}
            </Box>
          )}
          <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="xs" alignItems="center">
            {otrasMedidas}
          </Box>
        </Box>
        <Box flexDirection="column" flexShrink={0} alignSelf="flex-start" alignItems="flex-end" rowGap="xs">
          {controles}
          <Button key="detalles" plain dimColor label={verDetalles ? '▴' : '▾'} onPress={() => update($, detalles, v => !v)} />
        </Box>
      </Box>
    )
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
        {botonCompactar}
        {botonLuego}
        <Box flexGrow={1} />
        {chipTope !== undefined && <Text color={chipTope.color}>{chipTope.texto}</Text>}
        {chipModelo !== undefined && <Text dimColor>{chipModelo}</Text>}
        {controles}
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
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        {cabecera}
        {filaAviso}
        {filaMedidas}
      </Box>
    )
    return (
      <Box flexDirection="column" borderStyle={grafico ? undefined : 'round'} borderColor={destello ? 'warning' : dicho.tono === 'peligro' ? 'error' : dicho.tono === 'aviso' ? 'warning' : grafico ? 'subtle' : 'claude'} paddingX={grafico ? 0 : 1} paddingY={grafico ? 'xs' : 0} rowGap={grafico ? 'xs' : 0}>
        {grafico ? cuerpoGrafico : cuerpo}
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
