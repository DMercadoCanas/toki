// Toki habla español e inglés. Todo texto que ve la persona o que lee Claude sale de aquí.
// El idioma sale de la configuración, del idioma en que le escribes a Claude o del sistema.

export type Idioma = 'es' | 'en'

/** Idioma del sistema (LC_ALL, LC_MESSAGES o LANG). Español y lenguas cercanas → es; el resto → en. */
export function detectarIdioma(preferencia: string | undefined, locale: string | undefined): Idioma {
  if (preferencia === 'es' || preferencia === 'en') return preferencia
  const l = (locale ?? '').toLowerCase()
  if (l === '' || l === 'c' || l === 'posix' || l.startsWith('c.')) return 'es'
  return /^(es|pt|gl|ca|it)([_.-]|$)/.test(l) ? 'es' : 'en'
}

const PALABRAS_ES = new Set([
  'que', 'qué', 'de', 'el', 'la', 'los', 'las', 'por', 'para', 'con', 'una', 'uno', 'es', 'en', 'lo', 'cómo', 'como',
  'haz', 'hazlo', 'corre', 'dime', 'ahora', 'también', 'pero', 'porque', 'está', 'esto', 'este', 'esta', 'hay', 'si',
  'sí', 'puedes', 'quiero', 'necesito', 'archivo', 'cambia', 'agrega', 'arregla', 'revisa', 'mira', 'sin', 'del', 'al',
  'y', 'o', 'cuál', 'cuando', 'donde', 'dónde', 'muy', 'más', 'todo', 'nada', 'bien', 'listo', 'gracias', 'favor',
])
const PALABRAS_EN = new Set([
  'the', 'and', 'is', 'are', 'to', 'of', 'what', 'how', 'please', 'run', 'can', 'you', 'this', 'that', 'with', 'for',
  'it', 'fix', 'add', 'change', 'check', 'look', 'file', 'why', 'where', 'when', 'should', 'could', 'would', 'make',
  'use', 'my', 'me', 'do', 'does', 'not', 'from', 'into', 'all', 'thanks', 'need', 'want', 'let', 'just', 'then',
])

/** ¿En qué idioma escribe la persona? undefined si el texto es muy corto o ambiguo. */
/**
 * Quita los bloques que la app mete en el mensaje (<system-reminder>, <task-notification>…).
 * Vienen en inglés y no son lo que escribió la persona. Solo toca etiquetas con guion o
 * guion bajo, para no comerse el HTML que alguien pegue a propósito.
 */
export function quitarEtiquetasDeSistema(texto: string): string {
  return texto
    .replace(/<([a-z]+[-_][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?[a-z]+[-_][\w-]*\b[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function idiomaDeTexto(texto: string): Idioma | undefined {
  const limpio = quitarEtiquetasDeSistema(texto)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
    .slice(0, 600)
  const palabras = limpio.match(/[a-záéíóúüñ]+/g) ?? []
  if (palabras.length < 3) return undefined
  let es = /[ñ¿¡]|[áéíóú]/.test(limpio) ? 2 : 0
  let en = 0
  for (const p of palabras) {
    if (PALABRAS_ES.has(p)) es += 1
    if (PALABRAS_EN.has(p)) en += 1
  }
  if (es >= en + 2) return 'es'
  if (en >= es + 2) return 'en'
  return undefined
}

type Fmt = (n: number) => string

export type Textos = {
  nombre: string
  lema: string
  eslogan: string
  // Barra
  contexto: string
  cache: string
  ahorrado: string
  ahorrados: string
  cincoHoras: string
  semana: string
  frio: string
  mas: string
  menos: string
  en30min: string
  compactarAhora: string
  sesion: string
  llamadas: string
  salidasCompactadas: string
  bucles: string
  historico: string
  rachaCorta: Fmt
  cacheCaliente: Fmt
  // Frases de Toki
  frasePesada: (tokens: string) => string
  fraseContexto: (pct: number) => string
  fraseDormido: (tiempo: string) => string
  frasePensando: string
  fraseLeyendo: string
  fraseBuscando: string
  fraseEjecutando: string
  fraseEditando: string
  fraseCompactando: string
  fraseEsperando: string
  fraseBucle: string
  fraseListoAhorro: (comando: string, tokens: string) => string
  /** `cantidad`: "~$3.07" o "~2.0k tokens". */
  sesionAhorro: (cantidad: string) => string
  fraseListo: (extra: string) => string
  fraseTranquilo: string
  fraseTranquiloAhorro: (cantidad: string) => string
  fraseCelebrando: string
  fraseLogro: (nombres: string) => string
  fraseCambioModelo: (modelo: string, tokens: string) => string
  /** `total`: lo ahorrado desde siempre, ya escrito ("~$12.40" o "~2.0k tokens"). */
  saludo: (total: string | undefined, racha: number) => string
  min: string
  h: string
  menosDe1Min: string
  // Avisos emergentes
  toastAhorro: (tokens: string, comando: string) => string
  /** El primer pedido tras empezar en limpio (porque Toki lo propuso) que ya ahorró; `reescritura`: con el caché vencido. */
  toastLimpio: (usd: string, tokens: string, reescritura: boolean) => string
  toastBucle: string
  toastModelo: (modelo: string, tokens: string) => string
  toastCompacto: (resumen: string) => string
  toastConciso: string
  toastSalidasGrandes: string
  toastLogro: (nombres: string) => string
  // Lecciones
  leccionModelo: (de: string, a: string, tokens: string, costo: string) => string
  leccionBucle: (n: number, comando: string) => string
  leccionRelecturas: (nombre: string, n: number) => string
  leccionSubagente: string
  leccionSesionLarga: string
  leccionCompactaciones: Fmt
  leccionPesada: (tokens: string) => string
  // Notas que lee Claude
  avisoBucle: Fmt
  avisoMapa: (ruta: string) => string
  nudgeLectura: (nombre: string, n: number) => string
  notaConciso: string
  pingPrompt: string
  encabezado: (antes: string, despues: string, lAntes: number, lDespues: number, tokens: string | undefined, conservado: string, copia: string) => string
  conservado: Fmt
  recortadoAntes: (kb: string) => string
  migrado: (tokens: string) => string
  sugCarpetaVieja: string
  copiaCompleta: (ruta: string) => string
  copiaParcial: (kb: string, ruta: string) => string
  lineasOmitidas: Fmt
  lineasParecidas: Fmt
  rescateEncabezado: (programa: string, n: number, total: number) => string
  rescateMas: Fmt
  toastRescate: (n: number, comando: string) => string
  detalleRescate: Fmt
  rescatado: string
  notaPost: { titulo: string; tarea: string; rama: string; decisiones: string; archivos: string; comandos: string; errores: string; cierre: string }
  instrucciones: { titulo: string; tarea: string; decisiones: string; archivos: string; errores: string; pendiente: string }
  resumenMemoria: { archivos: Fmt; decisiones: Fmt; errores: Fmt; tarea: string }
  motivos: { familia: string; filtrado: string; lector: string; corta: string; pocoAhorro: string; segundoPlano: string; archivar: string; apagado: string; formato: string }
  // Panel y comandos
  cmdPanel: string
  cmdMapa: string
  cmdPorQue: string
  panelTitulo: string
  panelAbierto: string
  estaSesion: string
  hoy: string
  dias7: string
  dias30: string
  rachaDias: Fmt
  rachaNinguna: string
  logros: string
  ahorroPorDia: string
  queOcupa: string
  ultimosComandos: string
  loQueNoto: string
  sugerencias: string
  crearMapa: string
  cerrar: string
  mapaListo: (n: number, recortado: boolean, ruta: string) => string
  mapaVacio: string
  sinComandos: string
  decisionesTitulo: string
  decisionesPie: string
  compactado: string
  sinCambio: string
  detalleCompactado: (antes: string, despues: string, completa: boolean) => string
  tokensAhorradosCorto: (tokens: string) => string
  contextoLinea: (pct: string, ventana: string) => string
  usado: string
  aprovechado: Fmt
  sinDatos: string
  resumenSesion: (compactadas: number, llamadas: number, bucles: number) => string
  sugMemoria: (tokens: string) => string
  sugMcp: (tokens: string) => string
  sugContexto: string
  sugMapa: string
  sugConciso: string
  sugCache: string
  cacheMantenido: (pings: number, tokens: string) => string
  /** `sesion`: lo de `ahorroSesion` o `costoDeMasSesion`; las demás cifras, ya escritas en dólares. */
  reporteCabecera: (sesion: string, hoy: string, semana: string, total: string) => string
  /** "~$3.07 ahorrados en esta sesión (−18 %)". */
  ahorroSesion: (cantidad: string, pct: number | undefined) => string
  /** Cuando, en neto, Toki costó más de lo que ahorró. */
  costoDeMasSesion: (cantidad: string) => string
  /** Etiqueta de la barra en ese caso. */
  costoDeMas: string
  /** "−18 %": cuánto menos costó que sin Toki. */
  menosPct: (pct: number) => string
  /** Lo mismo en tokens, bajo las cifras del panel. */
  tokensLinea: (sesion: string, total: string, relecturas: string | undefined) => string
  aPrecioApi: (suscripcion: boolean) => string
  estimadoPrevio: (cantidad: string) => string
  desgloseTitulo: string
  desgloseRelecturas: (usd: string, tokens: string) => string
  desgloseLimpio: (usd: string, tokens: string) => string
  /** Recién compactado: lo que costó compactar, antes de recuperarlo en los pedidos siguientes. */
  desgloseCompactar: (usd: string) => string
  desgloseRecorte: (usd: string, tokens: string) => string
  /** `ahorro`: undefined si no ahorró nada (solo costó de más); `extra`: undefined si no costó de más. */
  desgloseRuteo: (neto: string, ahorro: string | undefined, extra: string | undefined) => string
  desgloseCosto: (gastado: string, sinToki: string) => string
  diasSemana: string[]
  mapaTitulo: string
  mapaCabecera: (fecha: string, n: number, recortado: boolean) => string
  mapaUso: string
  mapaModulos: string
  mapaArchivos: string
  logroNombres: Record<string, string>
  gastoTitulo: string
  gastoLinea: (leido: string, pct: number, escrito: string, nueva: string, salida: string) => string
  gastoPedidos: (pedidos: number, promedio: string) => string
  gastoSub: (pedidos: number, tokens: string) => string
  relecturasLinea: (tokens: string) => string
  ventanaToki: (ventana: string, nativa: string) => string
  ventanaTuya: (ventana: string) => string
  ventanaNativa: (ventana: string) => string
  toastVentana: (ventana: string, nativa: string) => string
  deVentana: (ventana: string) => string
  salidaRepetida: (minutos: number, tamano: string, ruta: string) => string
  detalleRepetida: string
  porQueCero: (leido: string, pct: number) => string
}

const es: Textos = {
  nombre: 'Toki',
  lema: 'Tu acompañante de ahorro de tokens',
  eslogan: 'Cada token cuenta.',
  contexto: 'contexto',
  cache: 'caché',
  ahorrado: 'ahorrado',
  ahorrados: 'ahorrados',
  cincoHoras: '5 h',
  semana: 'semana',
  frio: 'frío',
  mas: '▸ más',
  menos: '▾ menos',
  en30min: 'en 30 min',
  compactarAhora: 'Compactar ahora',
  sesion: 'sesión',
  llamadas: 'llamadas',
  salidasCompactadas: 'salidas compactadas',
  bucles: 'bucles',
  historico: 'histórico',
  rachaCorta: n => `🔥 ${n} ${n === 1 ? 'día' : 'días'}`,
  cacheCaliente: n => `caliente ×${n}`,
  frasePesada: t => `Tu conversación ya pesa ~${t} tokens y se reenvía completa en cada mensaje. Si terminaste una tarea, compacta; si cambias de tema, /clear.`,
  fraseContexto: p => `Contexto al ${p}%: compacta en esta pausa, antes de que se haga solo a mitad de una tarea.`,
  fraseDormido: t => `El caché se enfrió (sin actividad ${t}): el próximo mensaje reprocesa todo el contexto. Si cambias de tema, mejor /clear.`,
  frasePensando: 'Claude está pensando…',
  fraseLeyendo: 'Leyendo archivos. Si ya leyó uno sin cambios, Claude Code no lo vuelve a cargar.',
  fraseBuscando: 'Buscando en el proyecto. Le recordé que hay un mapa para no leer a ciegas.',
  fraseEjecutando: 'Ejecutando un comando. Si la salida trae mucho ruido, la limpio y guardo el original.',
  fraseEditando: 'Editando archivos.',
  fraseCompactando: 'Aspirando el contexto. Los errores y las decisiones importantes se quedan.',
  fraseEsperando: 'Claude espera tu permiso para continuar.',
  fraseBucle: 'Ojo: un comando falló 3 veces seguidas. Le pedí a Claude cambiar de enfoque.',
  fraseListoAhorro: (c, t) => `Listo. En «${c}» te ahorré ~${t} tokens.`,
  sesionAhorro: c => `Esta sesión te ahorré ${c}.`,
  fraseListo: extra => `Listo.${extra}`,
  fraseTranquilo: 'Todo en orden. Estoy pendiente de tus tokens.',
  fraseTranquiloAhorro: c => `Todo en orden. Esta sesión te ahorré ${c}.`,
  fraseCelebrando: '¡Logro desbloqueado!',
  fraseLogro: n => `¡Logro desbloqueado: ${n}! Sigue así.`,
  fraseCambioModelo: (m, t) => `Cambiaste a ${m} con el caché caliente: tu próximo mensaje reprocesará ~${t} tokens. Si fue sin querer, vuelve al modelo anterior con /model.`,
  saludo: (total, r) =>
    total === undefined
      ? '¡Hola! Soy Toki, tu robot de limpieza de tokens. Voy a aspirar el ruido mientras trabajas.'
      : `¡Hola de nuevo! Llevamos ${total} ahorrados juntos${r >= 2 ? ` y una racha de ${r} días` : ''}.`,
  min: 'min',
  h: 'h',
  menosDe1Min: 'menos de 1 min',
  toastAhorro: (t, c) => `Toki te ahorró ~${t} tokens en «${c}»`,
  toastLimpio: (u, t, r) =>
    r
      ? `Empezar en limpio ya ahorró ${u}: Claude no tuvo que reescribir ~${t} tokens de la conversación de antes.`
      : `Empezar en limpio ya ahorró ${u}: cada mensaje deja de releer ~${t} tokens de la conversación de antes.`,
  toastBucle: 'Toki: el mismo comando falló 3 veces seguidas. Le pedí a Claude cambiar de enfoque.',
  toastModelo: (m, t) => `Toki: cambiaste a ${m} con el caché caliente. Tu próximo mensaje reprocesará ~${t} tokens. Para una tarea chica, mejor un subagente con model: haiku.`,
  toastCompacto: r => `Toki: se compactó el contexto y le recordé a Claude ${r}. Sigue donde quedó.`,
  toastConciso: 'Toki: la conversación ya es larga. Le pedí a Claude respuestas más concisas (sin recortar lo técnico).',
  toastSalidasGrandes: 'Toki: varias salidas enormes seguidas. Para esto, un subagente con Haiku sale más barato.',
  toastLogro: n => `🏅 Logro desbloqueado: ${n}`,
  leccionModelo: (de, a, t, costo) => `Cambiaste de ${de} a ${a} con el caché caliente: el siguiente mensaje reprocesó ~${t} tokens${costo} sin caché. Elige el modelo al inicio de la sesión; para una tarea chica, delega a un subagente con model: haiku.`,
  leccionBucle: (n, c) => `Un comando falló ${n} veces seguidas («${c}»). Cada reintento vuelve a enviar todo el contexto: ante un fallo repetido, conviene parar y revisar la causa.`,
  leccionRelecturas: (nombre, n) => `Claude leyó «${nombre}» completo ${n} veces. Cuando un archivo ya se conoce, leer solo el rango necesario (offset/limit) evita reenviar todo su contenido.`,
  leccionSubagente: 'Hubo varias salidas enormes (tests, builds) en un mismo turno. Aunque las compacté, delegar esas corridas a un subagente (por ejemplo con model: haiku) deja la conversación principal limpia y cuesta una fracción.',
  leccionSesionLarga: 'Esta sesión lleva más de 3 horas. Cada mensaje reenvía toda la conversación: al cambiar de tarea, /clear (con /rename antes si quieres volver) sale más barato que seguir en el mismo hilo.',
  leccionCompactaciones: n => `Van ${n} compactaciones en esta sesión. Cada una resume y pierde detalle: para una tarea nueva, /clear deja un contexto limpio y más barato.`,
  leccionPesada: t => `La conversación pesa ~${t} tokens y se reenvía completa en cada mensaje, aunque el porcentaje de la ventana parezca bajo. Esto es lo que más consume de tus límites: al terminar una tarea, /compact; al cambiar de tema, /clear.`,
  avisoBucle: n => `[Toki] Este mismo comando ya falló ${n} veces seguidas. Antes de reintentar, revisa la causa o cambia de enfoque: cada intento repetido vuelve a enviar todo el contexto.`,
  avisoMapa: r => `[Toki] Hay un mapa del proyecto en ${r} con los archivos, sus símbolos y los módulos más usados. Consúltalo para ubicar código antes de buscar o leer archivos completos.`,
  nudgeLectura: (nombre, n) => `[Toki] Ya leíste «${nombre}» completo ${n} veces. Si solo necesitas una parte, usa offset y limit; si no cambió, no hace falta releerlo.`,
  notaConciso: '[Toki] La conversación ya es larga. De aquí en adelante responde de forma concisa: sin preámbulos, sin resúmenes finales ni narración de cada paso. Nunca recortes código, comandos, rutas, errores ni advertencias.',
  pingPrompt: 'Responde solo: ok',
  encabezado: (a, d, la, ld, t, conservado, copia) =>
    `[Toki] Salida compactada: ${a} → ${d}, ${la} → ${ld} líneas${t !== undefined ? ` (~${t} tokens menos de lo que habrías leído)` : ''}. ${conservado} ${copia}`,
  conservado: n =>
    n === 0
      ? 'Están todas las líneas con errores o advertencias, más el inicio y el final.'
      : `Había demasiadas líneas con errores o advertencias: van las primeras y las últimas (${n} más en la copia).`,
  copiaCompleta: r => `Copia completa, por si necesitas una línea puntual: ${r}`,
  copiaParcial: (kb, r) => `Copia parcial (lo que entregó Claude Code, ${kb}): ${r}`,
  recortadoAntes: kb =>
    `Ojo: Claude Code ya había recortado ${kb} del medio antes de que Toki viera la salida, y ahí puede haber errores. Si buscas un fallo que no aparece, vuelve a correr el comando filtrando los errores (| grep -iE "error|fail" en bash, | Select-String "error|fail" en PowerShell).`,
  migrado: t => `Traje tu historial de ahorro-tokens: ~${t} tokens ahorrados y tu racha siguen contando.`,
  sugCarpetaVieja: 'Quedó la carpeta .claude/ahorro-tokens de la versión anterior. Toki ya no la usa: puedes borrarla.',
  lineasOmitidas: n => `  … [${n} líneas omitidas] …`,
  lineasParecidas: n => `  … [${n} líneas parecidas] …`,
  rescateEncabezado: (p, n, total) => `[Toki] El \`${p}\` dejó fuera ${n} ${n === 1 ? 'línea' : 'líneas'} con errores (de ${total} en total). Aquí van, con su contexto:`,
  rescateMas: n => `  … y ${n} más en la copia completa.`,
  toastRescate: (n, c) => `Toki rescató ${n} ${n === 1 ? 'línea' : 'líneas'} de error que el corte escondía en «${c}»`,
  detalleRescate: n => `Claude cortó la salida (tail o Select-Object -Last) y ${n} ${n === 1 ? 'línea' : 'líneas'} de error habrían quedado fuera: Toki las agregó`,
  rescatado: 'rescatado',
  notaPost: {
    titulo: '[Toki] Recordatorio guardado antes de compactar:',
    tarea: 'Tarea actual',
    rama: 'Rama',
    decisiones: 'Decisiones',
    archivos: 'Archivos ya editados (no los releas enteros, usa offset/limit si necesitas)',
    comandos: 'Últimos comandos',
    errores: 'Últimos errores',
    cierre: 'Sigue con la tarea donde quedó; no vuelvas a explorar lo ya hecho.',
  },
  instrucciones: {
    titulo: 'Conserva textualmente en el resumen:',
    tarea: 'La tarea actual',
    decisiones: 'Estas decisiones',
    archivos: 'Los archivos editados',
    errores: 'Los últimos errores vistos',
    pendiente: 'Qué quedó pendiente y cuál era el siguiente paso.',
  },
  resumenMemoria: { archivos: n => `${n} archivos`, decisiones: n => `${n} decisiones`, errores: n => `${n} errores`, tarea: 'la tarea actual' },
  motivos: {
    familia: 'el comando no es de una familia ruidosa (tests, builds, instalaciones, linters, logs)',
    filtrado: 'Claude ya filtró la salida por su cuenta (| tail, | grep, | head…): no hacía falta compactar',
    lector: 'es un comando de lectura de contenido exacto (cat, git diff, sed…)',
    corta: 'la salida era corta: no valía la pena compactarla',
    pocoAhorro: 'compactarla ahorraría menos del 30%',
    segundoPlano: 'el comando corrió en segundo plano o fue interrumpido',
    archivar: 'no se pudo guardar el original, así que no se tocó la salida',
    apagado: 'la compactación está apagada en la configuración',
    formato: 'la herramienta devolvió un formato que Toki no reconoce, así que no la tocó',
  },
  cmdPanel: 'Toki: cuánto has ahorrado, tu racha, tus logros y qué ocupa tu contexto',
  cmdMapa: 'Toki: crear o actualizar el mapa del proyecto',
  cmdPorQue: 'Toki: por qué se compactó (o no) cada comando reciente',
  panelTitulo: 'Toki cuida tus tokens',
  panelAbierto: 'Panel de Toki abierto.',
  estaSesion: 'esta sesión',
  hoy: 'hoy',
  dias7: '7 días',
  dias30: '30 días',
  rachaDias: n => (n === 1 ? '🔥 Racha: 1 día ahorrando. ¡Vuelve mañana para seguirla!' : `🔥 Racha: ${n} días seguidos ahorrando`),
  rachaNinguna: 'Racha: aún no hay ahorro hoy. ¡El primero cuenta!',
  logros: 'Logros',
  ahorroPorDia: 'Ahorro por día (últimos 14 días)',
  queOcupa: 'Qué ocupa tu contexto ahora',
  ultimosComandos: 'Últimos comandos (/toki-por-que)',
  loQueNoto: 'Lo que Toki notó esta sesión',
  sugerencias: 'Sugerencias',
  crearMapa: 'Crear mapa del proyecto',
  cerrar: 'cerrar',
  mapaListo: (n, r, ruta) => `Mapa listo: ${n} archivos${r ? ' (recortado)' : ''} en ${ruta}. Claude lo usará antes de buscar a ciegas.`,
  mapaVacio: 'No encontré archivos de código para mapear en esta carpeta.',
  sinComandos: 'Toki aún no ha visto ningún comando en esta sesión (desde la última recarga del plugin).',
  decisionesTitulo: 'Últimos comandos y qué hizo Toki con cada uno:',
  decisionesPie: 'Compacta: tests, builds, instalaciones, linters, logs, listados largos. No toca: lecturas de archivos, diffs ni salidas ya filtradas con | grep, | head, etc. Si Claude corta un test o un build con | tail, Toki le agrega los errores que el corte dejó fuera.',
  compactado: 'compactado',
  sinCambio: 'sin cambio',
  detalleCompactado: (a, d, c) => `${a} → ${d}, ${c ? 'copia completa guardada' : 'copia parcial'}`,
  tokensAhorradosCorto: t => `~${t} tokens ahorrados`,
  contextoLinea: (p, v) => `Contexto: ${p} (ventana de ${v} tokens)`,
  usado: 'usado',
  aprovechado: p => `caché aprovechado ${p}%`,
  sinDatos: 'sin datos aún',
  resumenSesion: (c, l, b) => `${c} salidas compactadas · ${l} llamadas · ${b} bucles`,
  sugMemoria: t => `Tus archivos de memoria (CLAUDE.md y similares) pesan ~${t} tokens en cada mensaje. Mueve los flujos específicos a skills y deja el CLAUDE.md por debajo de 200 líneas.`,
  sugMcp: t => `Las herramientas MCP cargadas ocupan ~${t} tokens. Desactiva en /mcp los servidores que no estés usando.`,
  sugContexto: 'El contexto pasa de la mitad. Si terminaste una tarea, /compact en esta pausa; si vas a cambiar de tema, /clear.',
  sugMapa: 'Aún no hay mapa del proyecto. Créalo con /toki-mapa para que Claude se oriente sin leer archivos a ciegas.',
  sugConciso: 'Para respuestas más cortas sin perder lo técnico: /output-style → toki:conciso.',
  sugCache: 'Pagas por token y el caché dura solo 5 min: activa "Mantener el caché caliente" en /plugin para no reprocesar todo al volver de una pausa.',
  cacheMantenido: (n, t) => `Toki mantuvo el caché caliente ${n} ${n === 1 ? 'vez' : 'veces'} (~${t} tokens leídos de caché, a 1/10 del precio de reprocesarlos).`,
  reporteCabecera: (s, h, w, total) => `Toki · ${s} · hoy ${h} · semana ${w} · histórico ${total}`,
  ahorroSesion: (c, p) => `${c} ahorrados en esta sesión${p !== undefined ? ` (−${p} %)` : ''}`,
  costoDeMasSesion: c => `esta sesión Toki costó ${c} de más`,
  costoDeMas: 'costó de más',
  menosPct: p => `−${p} %`,
  tokensLinea: (s, t, r) => `En tokens: ~${s} recortados esta sesión · ~${t} desde siempre${r !== undefined ? ` · ~${r} relecturas evitadas` : ''}`,
  aPrecioApi: s =>
    `En dólares a precio de API: lo de modelo y esfuerzo sale de lo que devolvió cada pedido; recortes y relecturas, de los tokens que Toki quitó.${s ? ' Con tu suscripción no lo pagas aparte: es uso de tus límites que te queda libre.' : ''}`,
  estimadoPrevio: c => `Incluye ${c} de antes de la versión 0.17, estimados a precio de Sonnet (solo recortes y relecturas).`,
  desgloseTitulo: 'De dónde sale el ahorro de esta sesión',
  desgloseRelecturas: (u, t) => `Relecturas evitadas: ${u} (~${t} tokens que Claude no volvió a leer porque Toki compactó antes o sacó algo del contexto)`,
  desgloseLimpio: (u, t) => `Empezar en limpio: ${u} (~${t} tokens de la conversación de antes que Claude ya no releyó ni reescribió)`,
  desgloseCompactar: u => `Compactar antes: ${u} (lo que costó resumir la conversación; se recupera en los pedidos siguientes, que releen mucho menos)`,
  desgloseRecorte: (u, t) => `Salidas recortadas: ${u} (~${t} tokens que no entraron al contexto)`,
  desgloseRuteo: (n, a, e) =>
    e === undefined
      ? `Modelo y esfuerzo: ${n} (cada pedido contra tu modelo y tu esfuerzo)`
      : a === undefined
        ? `Modelo y esfuerzo: ${n} (costó de más por más esfuerzo o al reescribir el caché)`
        : `Modelo y esfuerzo: ${n} (ahorró ${a}; costó ${e} de más por más esfuerzo o al reescribir el caché)`,
  desgloseCosto: (g, s) => `Esta sesión costó ${g}; sin Toki habría costado ${s}.`,
  diasSemana: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  mapaTitulo: 'Mapa del proyecto',
  mapaCabecera: (f, n, r) => `Generado por Toki el ${f}, sin usar el modelo (solo análisis de texto). ${n} archivos de código${r ? ' (recortado: el proyecto es más grande)' : ''}.`,
  mapaUso: 'Úsalo para ubicar archivos y símbolos antes de buscar con grep o leer archivos completos. Puede estar desactualizado: confirma leyendo el archivo antes de editar.',
  mapaModulos: 'Módulos más usados (importados por más archivos)',
  mapaArchivos: 'Archivos y símbolos',
  gastoTitulo: 'Lo que costó esta sesión (cifras de la API)',
  gastoLinea: (l, p, w, n, o) => `Releer la conversación (caché): ~${l} (${p}%) · escribir al caché: ~${w} · entrada nueva: ~${n} · respuestas y razonamiento: ~${o}`,
  gastoPedidos: (n, prom) => `${n} ${n === 1 ? 'pedido' : 'pedidos'} al modelo; cada uno mandó en promedio ~${prom} de contexto.`,
  gastoSub: (n, t) => `Subagentes y tareas internas (compactar, memoria): ${n} ${n === 1 ? 'pedido' : 'pedidos'}, ~${t}.`,
  relecturasLinea: t => `Relecturas evitadas: ~${t} tokens que Claude no volvió a leer porque Toki los sacó del contexto o compactó antes. Es la parte más barata de cada pedido, pero la más grande.`,
  ventanaToki: (v, n) => `Compactación: a los ${v} (Claude Code lo haría a los ${n}). La ajusta Toki; cámbiala en /plugin → Toki.`,
  ventanaTuya: v => `Compactación: a los ${v} (la elegiste tú; Toki no la toca).`,
  ventanaNativa: v => `Compactación: a los ${v} (la de Claude Code).`,
  toastVentana: (v, n) => `Toki: compactaré a los ${v} en vez de ${n}. Cada mensaje releerá menos y mi memoria guarda la tarea.`,
  deVentana: v => `de ${v}`,
  salidaRepetida: (m, tam, r) => `[Toki] Salida idéntica a la de este mismo comando hace ${m < 1 ? 'menos de 1 min' : `${m} min`} (${tam}): no cambió nada. Sigue arriba en la conversación; copia completa en ${r}`,
  detalleRepetida: 'salida idéntica a la anterior: quedó una línea con la ruta de la copia',
  porQueCero: (l, p) =>
    `Por qué el ahorro va en cero: Toki ahorra al recortar salidas largas (no toca lecturas exactas ni salidas ya filtradas), al compactar antes que Claude Code cuando la conversación crece y al mandar los mensajes sencillos a un modelo más barato; en esta sesión todavía no hubo dónde. Lo que más pesó fue releer la conversación en cada pedido: ~${l} (${p}% de todo).`,
  logroNombres: {
    primero: 'Primer ahorro',
    diez: '10k tokens',
    cien: '100k tokens',
    millon: '1M tokens',
    racha3: '3 días seguidos',
    racha7: '7 días seguidos',
    memoria: 'Memoria a prueba de compactación',
    rescate: 'Rescate de errores',
  },
}

const en: Textos = {
  nombre: 'Toki',
  lema: 'Your token-saving companion',
  eslogan: 'Every token counts.',
  contexto: 'context',
  cache: 'cache',
  ahorrado: 'saved',
  ahorrados: 'saved',
  cincoHoras: '5 h',
  semana: 'week',
  frio: 'cold',
  mas: '▸ more',
  menos: '▾ less',
  en30min: 'in 30 min',
  compactarAhora: 'Compact now',
  sesion: 'session',
  llamadas: 'calls',
  salidasCompactadas: 'outputs compacted',
  bucles: 'loops',
  historico: 'all time',
  rachaCorta: n => `🔥 ${n} ${n === 1 ? 'day' : 'days'}`,
  cacheCaliente: n => `warm ×${n}`,
  frasePesada: t => `Your conversation already weighs ~${t} tokens and is re-sent whole with every message. If a task is done, compact; if you are changing topic, /clear.`,
  fraseContexto: p => `Context at ${p}%: compact during this pause, before it happens on its own mid-task.`,
  fraseDormido: t => `The cache went cold (no activity for ${t}): the next message reprocesses the whole context. Changing topic? Better /clear.`,
  frasePensando: 'Claude is thinking…',
  fraseLeyendo: "Reading files. If one is unchanged, Claude Code won't load it again.",
  fraseBuscando: 'Searching the project. I reminded Claude there is a map, so it does not read blindly.',
  fraseEjecutando: 'Running a command. If the output is noisy, I clean it up and keep the original.',
  fraseEditando: 'Editing files.',
  fraseCompactando: 'Vacuuming the context. Errors and key decisions stay.',
  fraseEsperando: 'Claude is waiting for your permission.',
  fraseBucle: 'Heads up: a command failed 3 times in a row. I asked Claude to change approach.',
  fraseListoAhorro: (c, t) => `Done. On "${c}" I saved you ~${t} tokens.`,
  sesionAhorro: c => `This session I saved you ${c}.`,
  fraseListo: extra => `Done.${extra}`,
  fraseTranquilo: 'All good. I am watching your tokens.',
  fraseTranquiloAhorro: c => `All good. This session I saved you ${c}.`,
  fraseCelebrando: 'Achievement unlocked!',
  fraseLogro: n => `Achievement unlocked: ${n}! Keep it up.`,
  fraseCambioModelo: (m, t) => `You switched to ${m} with a warm cache: your next message will reprocess ~${t} tokens. If it was by accident, switch back with /model.`,
  saludo: (total, r) =>
    total === undefined
      ? "Hi! I'm Toki, your token-cleaning robot. I'll vacuum up the noise while you work."
      : `Welcome back! We have saved ${total} together${r >= 2 ? ` with a ${r}-day streak` : ''}.`,
  min: 'min',
  h: 'h',
  menosDe1Min: 'under 1 min',
  toastAhorro: (t, c) => `Toki saved you ~${t} tokens on "${c}"`,
  toastLimpio: (u, t, r) =>
    r
      ? `Starting clean already saved ${u}: Claude did not have to rewrite ~${t} tokens of the old conversation.`
      : `Starting clean already saved ${u}: each message no longer re-reads ~${t} tokens of the old conversation.`,
  toastBucle: 'Toki: the same command failed 3 times in a row. I asked Claude to change approach.',
  toastModelo: (m, t) => `Toki: you switched to ${m} with a warm cache. Your next message will reprocess ~${t} tokens. For a small task, a subagent with model: haiku is cheaper.`,
  toastCompacto: r => `Toki: the context was compacted and I reminded Claude of ${r}. It continues where it left off.`,
  toastConciso: 'Toki: the conversation is getting long. I asked Claude for more concise replies (without trimming technical detail).',
  toastSalidasGrandes: 'Toki: several huge outputs in a row. A Haiku subagent is cheaper for this.',
  toastLogro: n => `🏅 Achievement unlocked: ${n}`,
  leccionModelo: (de, a, t, costo) => `You switched from ${de} to ${a} with a warm cache: the next message reprocessed ~${t} tokens${costo} without cache. Pick the model at the start of a session; for a small task, delegate to a subagent with model: haiku.`,
  leccionBucle: (n, c) => `A command failed ${n} times in a row ("${c}"). Every retry re-sends the whole context: on a repeated failure, stop and check the cause.`,
  leccionRelecturas: (nombre, n) => `Claude read "${nombre}" in full ${n} times. Once a file is known, reading only the needed range (offset/limit) avoids re-sending all of it.`,
  leccionSubagente: 'There were several huge outputs (tests, builds) in one turn. Even compacted, delegating those runs to a subagent (for example with model: haiku) keeps the main conversation clean at a fraction of the cost.',
  leccionSesionLarga: 'This session is over 3 hours old. Every message re-sends the whole conversation: when switching tasks, /clear (with /rename first if you want to come back) is cheaper than staying in the same thread.',
  leccionCompactaciones: n => `${n} compactions so far this session. Each one summarizes and loses detail: for a new task, /clear gives a clean, cheaper context.`,
  leccionPesada: t => `The conversation weighs ~${t} tokens and is re-sent whole with every message, even if the window percentage looks low. This is what eats your limits most: /compact when a task is done, /clear when changing topic.`,
  avisoBucle: n => `[Toki] This same command has now failed ${n} times in a row. Before retrying, check the cause or change approach: every repeated attempt re-sends the whole context.`,
  avisoMapa: r => `[Toki] There is a project map at ${r} with files, their symbols and the most-used modules. Check it to locate code before searching or reading whole files.`,
  nudgeLectura: (nombre, n) => `[Toki] You already read "${nombre}" in full ${n} times. If you only need a part, use offset and limit; if it did not change, no need to re-read it.`,
  notaConciso: '[Toki] The conversation is getting long. From here on, answer concisely: no preambles, no closing summaries, no narration of each step. Never trim code, commands, paths, errors or warnings.',
  pingPrompt: 'Reply only: ok',
  encabezado: (a, d, la, ld, t, conservado, copia) =>
    `[Toki] Output compacted: ${a} → ${d}, ${la} → ${ld} lines${t !== undefined ? ` (~${t} fewer tokens than you would have read)` : ''}. ${conservado} ${copia}`,
  conservado: n =>
    n === 0
      ? 'Every line with an error or warning is here, plus the start and the end.'
      : `There were too many error or warning lines: the first and last are here (${n} more in the copy).`,
  copiaCompleta: r => `Full copy, in case you need a specific line: ${r}`,
  copiaParcial: (kb, r) => `Partial copy (what Claude Code delivered, ${kb}): ${r}`,
  recortadoAntes: kb =>
    `Heads up: Claude Code had already cut ${kb} from the middle before Toki saw the output, and errors may be there. If a failure is missing, rerun the command filtering for errors (| grep -iE "error|fail" in bash, | Select-String "error|fail" in PowerShell).`,
  migrado: t => `I brought your ahorro-tokens history: ~${t} tokens saved, and your streak keeps counting.`,
  sugCarpetaVieja: 'The .claude/ahorro-tokens folder from the previous version is still there. Toki no longer uses it: you can delete it.',
  lineasOmitidas: n => `  … [${n} lines omitted] …`,
  lineasParecidas: n => `  … [${n} similar lines] …`,
  rescateEncabezado: (p, n, total) => `[Toki] The \`${p}\` cut ${n} ${n === 1 ? 'line' : 'lines'} with errors (out of ${total}). Here they are, with context:`,
  rescateMas: n => `  … and ${n} more in the full copy.`,
  toastRescate: (n, c) => `Toki rescued ${n} error ${n === 1 ? 'line' : 'lines'} the cut was hiding in "${c}"`,
  detalleRescate: n => `Claude cut the output (tail or Select-Object -Last) and ${n} error ${n === 1 ? 'line' : 'lines'} would have been left out: Toki added them`,
  rescatado: 'rescued',
  notaPost: {
    titulo: '[Toki] Reminder saved before compaction:',
    tarea: 'Current task',
    rama: 'Branch',
    decisiones: 'Decisions',
    archivos: 'Files already edited (do not re-read them whole; use offset/limit if needed)',
    comandos: 'Recent commands',
    errores: 'Recent errors',
    cierre: 'Continue the task where it left off; do not re-explore what is already done.',
  },
  instrucciones: {
    titulo: 'Keep verbatim in the summary:',
    tarea: 'The current task',
    decisiones: 'These decisions',
    archivos: 'The edited files',
    errores: 'The last errors seen',
    pendiente: 'What is still pending and what the next step was.',
  },
  resumenMemoria: { archivos: n => `${n} files`, decisiones: n => `${n} decisions`, errores: n => `${n} errors`, tarea: 'the current task' },
  motivos: {
    familia: 'the command is not from a noisy family (tests, builds, installs, linters, logs)',
    filtrado: 'Claude already filtered the output itself (| tail, | grep, | head…): no need to compact',
    lector: 'it is an exact-content read command (cat, git diff, sed…)',
    corta: 'the output was short: not worth compacting',
    pocoAhorro: 'compacting would save less than 30%',
    segundoPlano: 'the command ran in the background or was interrupted',
    archivar: 'the original could not be saved, so the output was left untouched',
    apagado: 'compaction is turned off in the settings',
    formato: 'the tool returned a format Toki does not recognize, so it was left untouched',
  },
  cmdPanel: 'Toki: how much you saved, your streak, achievements and what fills your context',
  cmdMapa: 'Toki: create or refresh the project map',
  cmdPorQue: 'Toki: why each recent command was (or was not) compacted',
  panelTitulo: 'Toki looks after your tokens',
  panelAbierto: 'Toki panel opened.',
  estaSesion: 'this session',
  hoy: 'today',
  dias7: '7 days',
  dias30: '30 days',
  rachaDias: n => (n === 1 ? '🔥 Streak: 1 day saving. Come back tomorrow to keep it going!' : `🔥 Streak: ${n} days in a row saving`),
  rachaNinguna: 'Streak: nothing saved yet today. The first one counts!',
  logros: 'Achievements',
  ahorroPorDia: 'Savings per day (last 14 days)',
  queOcupa: 'What fills your context now',
  ultimosComandos: 'Recent commands (/toki-por-que)',
  loQueNoto: 'What Toki noticed this session',
  sugerencias: 'Suggestions',
  crearMapa: 'Create project map',
  cerrar: 'close',
  mapaListo: (n, r, ruta) => `Map ready: ${n} files${r ? ' (truncated)' : ''} at ${ruta}. Claude will use it before searching blindly.`,
  mapaVacio: 'I found no code files to map in this folder.',
  sinComandos: 'Toki has not seen any command in this session yet (since the plugin was last reloaded).',
  decisionesTitulo: 'Recent commands and what Toki did with each one:',
  decisionesPie: 'Compacts: tests, builds, installs, linters, logs, long listings. Leaves alone: file reads, diffs and outputs already filtered with | grep, | head, etc. If Claude cuts a test or build with | tail, Toki adds the errors the cut left out.',
  compactado: 'compacted',
  sinCambio: 'unchanged',
  detalleCompactado: (a, d, c) => `${a} → ${d}, ${c ? 'full copy saved' : 'partial copy'}`,
  tokensAhorradosCorto: t => `~${t} tokens saved`,
  contextoLinea: (p, v) => `Context: ${p} (window of ${v} tokens)`,
  usado: 'used',
  aprovechado: p => `cache hit ${p}%`,
  sinDatos: 'no data yet',
  resumenSesion: (c, l, b) => `${c} outputs compacted · ${l} calls · ${b} loops`,
  sugMemoria: t => `Your memory files (CLAUDE.md and the like) weigh ~${t} tokens on every message. Move specific workflows into skills and keep CLAUDE.md under 200 lines.`,
  sugMcp: t => `Loaded MCP tools take ~${t} tokens. Disable in /mcp the servers you are not using.`,
  sugContexto: 'Context is past half. If a task is done, /compact during this pause; if you are changing topic, /clear.',
  sugMapa: 'There is no project map yet. Create it with /toki-mapa so Claude finds its way without reading files blindly.',
  sugConciso: 'For shorter replies without losing technical detail: /output-style → toki:conciso.',
  sugCache: 'You pay per token and the cache lasts only 5 min: turn on "Keep the cache warm" in /plugin so you do not reprocess everything after a break.',
  cacheMantenido: (n, t) => `Toki kept the cache warm ${n} ${n === 1 ? 'time' : 'times'} (~${t} tokens read from cache, at 1/10 of the cost of reprocessing them).`,
  reporteCabecera: (s, h, w, total) => `Toki · ${s} · today ${h} · week ${w} · all time ${total}`,
  ahorroSesion: (c, p) => `${c} saved this session${p !== undefined ? ` (−${p}%)` : ''}`,
  costoDeMasSesion: c => `this session Toki cost ${c} extra`,
  costoDeMas: 'cost extra',
  menosPct: p => `−${p}%`,
  tokensLinea: (s, t, r) => `In tokens: ~${s} trimmed this session · ~${t} all time${r !== undefined ? ` · ~${r} re-reads avoided` : ''}`,
  aPrecioApi: s =>
    `In dollars at API prices: model and effort come from what each request returned; trims and re-reads, from the tokens Toki removed.${s ? ' On your subscription you do not pay it separately: it is usage of your limits left free.' : ''}`,
  estimadoPrevio: c => `Includes ${c} from before version 0.17, estimated at Sonnet prices (trims and re-reads only).`,
  desgloseTitulo: "Where this session's savings come from",
  desgloseRelecturas: (u, t) => `Re-reads avoided: ${u} (~${t} tokens Claude did not read again because Toki compacted earlier or took something out of context)`,
  desgloseLimpio: (u, t) => `Starting clean: ${u} (~${t} tokens of the old conversation Claude no longer re-read or rewrote)`,
  desgloseCompactar: u => `Compacting earlier: ${u} (what summarizing the conversation cost; it is made up in the following requests, which re-read much less)`,
  desgloseRecorte: (u, t) => `Trimmed outputs: ${u} (~${t} tokens that never entered the context)`,
  desgloseRuteo: (n, a, e) =>
    e === undefined
      ? `Model and effort: ${n} (each request against your model and your effort)`
      : a === undefined
        ? `Model and effort: ${n} (cost extra from more effort or rewriting the cache)`
        : `Model and effort: ${n} (saved ${a}; cost ${e} extra from more effort or rewriting the cache)`,
  desgloseCosto: (g, s) => `This session cost ${g}; without Toki it would have cost ${s}.`,
  diasSemana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  mapaTitulo: 'Project map',
  mapaCabecera: (f, n, r) => `Generated by Toki on ${f}, without using the model (text analysis only). ${n} code files${r ? ' (truncated: the project is larger)' : ''}.`,
  mapaUso: 'Use it to locate files and symbols before grepping or reading whole files. It may be stale: confirm by reading the file before editing.',
  mapaModulos: 'Most-used modules (imported by the most files)',
  mapaArchivos: 'Files and symbols',
  gastoTitulo: 'What this session cost (API figures)',
  gastoLinea: (l, p, w, n, o) => `Re-reading the conversation (cache): ~${l} (${p}%) · writing to cache: ~${w} · new input: ~${n} · replies and reasoning: ~${o}`,
  gastoPedidos: (n, avg) => `${n} ${n === 1 ? 'request' : 'requests'} to the model; each sent ~${avg} of context on average.`,
  gastoSub: (n, t) => `Subagents and internal tasks (compaction, memory): ${n} ${n === 1 ? 'request' : 'requests'}, ~${t}.`,
  relecturasLinea: t => `Re-reads avoided: ~${t} tokens Claude did not read again because Toki took them out of context or compacted earlier. It is the cheapest part of each request, but the largest.`,
  ventanaToki: (v, n) => `Compaction: at ${v} (Claude Code would wait until ${n}). Set by Toki; change it in /plugin → Toki.`,
  ventanaTuya: v => `Compaction: at ${v} (your choice; Toki leaves it alone).`,
  ventanaNativa: v => `Compaction: at ${v} (Claude Code's own).`,
  toastVentana: (v, n) => `Toki: I will compact at ${v} instead of ${n}. Each message re-reads less, and my memory keeps the task.`,
  deVentana: v => `of ${v}`,
  salidaRepetida: (m, size, r) => `[Toki] Output identical to this same command's ${m < 1 ? 'less than 1 min' : `${m} min`} ago (${size}): nothing changed. It is still above in the conversation; full copy at ${r}`,
  detalleRepetida: 'identical to the previous output: one line with the path to the copy',
  porQueCero: (l, p) =>
    `Why savings are at zero: Toki saves by trimming long outputs (it leaves exact reads and already-filtered outputs alone), by compacting earlier than Claude Code once the conversation grows, and by sending simple messages to a cheaper model; this session there was no room for any of that yet. What weighed most was re-reading the conversation on every request: ~${l} (${p}% of everything).`,
  logroNombres: {
    primero: 'First savings',
    diez: '10k tokens',
    cien: '100k tokens',
    millon: '1M tokens',
    racha3: '3 days in a row',
    racha7: '7 days in a row',
    memoria: 'Compaction-proof memory',
    rescate: 'Error rescue',
  },
}

export const textos: Record<Idioma, Textos> = { es, en }

export function t(idioma: Idioma): Textos {
  return textos[idioma]
}
