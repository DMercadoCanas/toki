/**
 * Qué modelo y qué esfuerzo merece cada mensaje, y cuánto costaría cada opción.
 *
 * Medido con sesiones reales (Opus 5.5):
 * - Cambiar solo el esfuerzo NO rompe el caché: se puede ajustar en cada mensaje.
 * - Cambiar el modelo reescribe toda la conversación en el caché una vez: solo
 *   vale con el contexto chico, o si la diferencia lo paga.
 *
 * Todo aquí es puro: sin `$`, para probarlo sin Claude Code.
 */

import type { Idioma } from './idioma'
import { conAcentos } from './palabras'

export type Nivel = 'trivial' | 'normal' | 'complejo' | 'profundo'
export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Familia = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type TipoOpcion = 'calidad' | 'equilibrio' | 'ahorro' | 'actual'
export type ModoRuta = 'preguntar' | 'siempre' | 'automatico' | 'no'

export const NIVELES: readonly Nivel[] = ['trivial', 'normal', 'complejo', 'profundo']
export const ESFUERZOS: readonly Esfuerzo[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function esEsfuerzo(v: unknown): v is Esfuerzo {
  return typeof v === 'string' && (ESFUERZOS as readonly string[]).includes(v)
}

export function leerModo(v: unknown): ModoRuta {
  if (v === 'siempre' || v === 'automatico' || v === 'no' || v === 'preguntar') return v
  if (v === 'auto' || v === 'automático') return 'automatico'
  if (v === false || v === 'off' || v === 'apagado') return 'no'
  return 'preguntar'
}

// ---------- Leer el mensaje ----------

const RUTA_SUELTA = conAcentos(/(^|\s)(~|\.{1,2})?\/[\w.\-/@]+/g)

/** Fuera lo que infla el mensaje sin decir nada de la tarea: código, URLs, rutas, etiquetas. */
export function limpiarPrompt(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>\n]{1,200}>/g, ' ')
    .replace(RUTA_SUELTA, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PROFUNDO =
  conAcentos(/\b(ultrathink|piensa (muy |lo )?(bien|a fondo|profundamente|con calma|detenidamente|en todo)|pi[eé]nsalo (bien|a fondo)|think (very )?(hard|harder|deeply|carefully)|a fondo|en profundidad|todos los escenarios|ingenier[ií]a inversa|reverse[- ]engineer\w*|an[aá]lisis (completo|exhaustivo|profundo)|exhaustiv\w*|thorough(ly)?|deep dive)\b|\bREA\b/i)
const COMPLEJO =
  conAcentos(/\b(arquitectura|architect\w*|diseñ[aeo]\w*|design\w*|refactori[zc]\w*|refactor\w*|migra(r|ción|cion|te|tion)\w*|causa ra[ií]z|root cause|por qu[eé] (falla|no funciona|se rompe|pasa)|why (does|is|doesn'?t|isn'?t)|investig\w*|debug\w*|depur\w*|seguridad|security|vulnerab\w*|trade-?offs?|compar[ae]\w*|optimi[zs]\w*|rendimiento|performance|concurren\w*|race condition|en todo el (proyecto|repo|c[oó]digo|sistema)|across the (codebase|repo|project)|end[- ]to[- ]end|estrategia|strategy|planifica\w*|integraci[oó]n|integrat\w*|escalab\w*|recom(ie|e)nd\w*|flujo|workflow|automati[zc]\w*|mejor (manera|forma|pr[aá]ctica|opci[oó]n)|best (way|practice|option|approach)|c[oó]mo (deber[ií]a|conviene|se debe)|how should)\b/i)
const TRIVIAL =
  conAcentos(/\b(renombra\w*|rename\w*|typo|errata|formatea\w*|reformat\w*|corre (los |las )?(tests?|pruebas)|run (the )?tests|git (status|add|commit|push|pull|log|diff|stash)|haz (el |un )?commit|commitea|haz push|lint\w*|instala\w*|install\w*|bump|cambia (el|la|este|esta) (texto|nombre|color|t[ií]tulo|label|etiqueta)|qu[eé] hora|lista (los )?archivos|list (the )?files|traduce|translate|corrige (la )?ortograf[ií]a|fix (the )?typo)\b/i)
const SEGUIMIENTO =
  conAcentos(/^(s[ií]|si,?|no|ok(ay)?|vale|dale|listo|gracias|perfecto|bien|genial|sigue|contin[uú]a|adelante|hazlo|h[aá]galo|implem[eé]ntalo|procede|go( ahead)?|yes|yep|sure|thanks|lgtm|ship it|do it|continue|proceed|next)\b[\s.!,]*(por favor|please|gracias)?[\s.!]*$/i)
const ATASCO =
  conAcentos(/\b((sigue|todav[ií]a|a[uú]n) (falla\w*|sin funcionar|no funciona|roto|igual)|otra vez (falla|el mismo error|lo mismo)|no (sirvi[oó]|funcion[oó]|arregl[oó])|still (fail\w*|broken|not working|the same)|didn'?t (work|fix)|same error)\b/i)

export type Lectura = { nivel: Nivel; seguro: boolean; motivo: Motivo }
export type Motivo = 'pide-pensar' | 'tarea-compleja' | 'mensaje-largo' | 'tarea-mecanica' | 'mensaje-corto' | 'seguimiento' | 'atascado' | 'tarea-normal' | 'clasificador'

function subir(n: Nivel): Nivel {
  return NIVELES[Math.min(NIVELES.length - 1, NIVELES.indexOf(n) + 1)] ?? n
}

function mayor(a: Nivel, b: Nivel): Nivel {
  return NIVELES.indexOf(a) >= NIVELES.indexOf(b) ? a : b
}

/**
 * Lo que el mensaje pide, sin gastar un token. `seguro: false` es la zona
 * dudosa: ahí vale preguntarle a Haiku.
 */
export function nivelHeuristico(textoCrudo: string, previo?: Nivel): Lectura {
  const texto = limpiarPrompt(textoCrudo)
  const palabras = texto === '' ? 0 : texto.split(' ').length
  // "sí", "dale", "sigue": es la tarea de antes, con el nivel de antes.
  if (SEGUIMIENTO.test(texto) || (palabras > 0 && palabras <= 3 && !texto.includes('?') && !COMPLEJO.test(texto) && !PROFUNDO.test(texto) && !TRIVIAL.test(texto) && !ATASCO.test(texto))) {
    return { nivel: previo ?? 'normal', seguro: true, motivo: 'seguimiento' }
  }
  if (ATASCO.test(texto)) return { nivel: subir(mayor(previo ?? 'normal', 'normal')), seguro: true, motivo: 'atascado' }
  if (PROFUNDO.test(texto)) return { nivel: 'profundo', seguro: true, motivo: 'pide-pensar' }
  let puntos = 0
  const complejas = (texto.match(new RegExp(COMPLEJO.source, 'giu')) ?? []).length
  puntos += Math.min(2, complejas) * 2
  if (palabras > 250) puntos += 2
  else if (palabras > 120) puntos += 1
  if ((texto.match(/\?/g) ?? []).length >= 3) puntos += 1
  if (TRIVIAL.test(texto)) puntos -= 3
  if (palabras <= 8 && !texto.includes('?') && complejas === 0) puntos -= 1
  if (puntos >= 3) return { nivel: 'complejo', seguro: puntos >= 4 || complejas >= 2, motivo: complejas > 0 ? 'tarea-compleja' : 'mensaje-largo' }
  if (puntos <= -2) return { nivel: 'trivial', seguro: true, motivo: 'tarea-mecanica' }
  if (puntos === -1) return { nivel: 'trivial', seguro: false, motivo: 'mensaje-corto' }
  if (puntos === 2) return { nivel: 'complejo', seguro: false, motivo: 'tarea-compleja' }
  return { nivel: 'normal', seguro: palabras >= 6 && palabras <= 120, motivo: 'tarea-normal' }
}

/** Las etiquetas que se le dan a Haiku (en inglés lo entiende mejor) y su nivel. */
export const ETIQUETAS_CLASIFICADOR: Record<string, Nivel> = { trivial: 'trivial', routine: 'normal', complex: 'complejo', deep: 'profundo' }

// ---------- Modelos y precios ----------

export function familiaDe(modelo: string | undefined): Familia | undefined {
  const m = /claude-(haiku|sonnet|opus|fable|mythos)/i.exec(modelo ?? '') ?? /^(haiku|sonnet|opus)$/i.exec(modelo ?? '')
  if (!m) return undefined
  const f = m[1]?.toLowerCase()
  return f === 'mythos' ? 'fable' : (f as Familia)
}

/** El mismo modelo en otra familia y la misma versión: `claude-opus-5-5` → `claude-sonnet-5-5`. */
export function hermano(modelo: string, familia: 'opus' | 'sonnet' | 'haiku'): string | undefined {
  const m = /^claude-(opus|sonnet|haiku)-(\d+(?:-\d+)?)\b/.exec(modelo)
  if (!m) return undefined
  return `claude-${familia}-${m[2]}`
}

export function nombreCorto(modelo: string): string {
  const f = familiaDe(modelo)
  return f === undefined ? modelo : f.charAt(0).toUpperCase() + f.slice(1)
}

/** USD por millón de tokens (lista, octubre 2026). Haiku cobra más por encima de 100k de entrada. */
export type Precio = { entrada: number; escritura5m: number; escritura1h: number; lectura: number; salida: number }
const PRECIOS: Record<Familia, Precio> = {
  haiku: { entrada: 0.1, escritura5m: 0.125, escritura1h: 0.2, lectura: 0.01, salida: 0.5 },
  sonnet: { entrada: 2, escritura5m: 2.5, escritura1h: 4, lectura: 0.1, salida: 10 },
  opus: { entrada: 4, escritura5m: 5, escritura1h: 8, lectura: 0.2, salida: 20 },
  fable: { entrada: 10, escritura5m: 12.5, escritura1h: 20, lectura: 0.25, salida: 50 },
}
const HAIKU_LARGO: Precio = { entrada: 0.5, escritura5m: 0.625, escritura1h: 1, lectura: 0.05, salida: 2.5 }

export function precio(f: Familia, contexto: number): Precio {
  return f === 'haiku' && contexto > 100_000 ? HAIKU_LARGO : PRECIOS[f]
}

/** Tokens de salida (respuesta + razonamiento) por pedido, según el esfuerzo. Aproximado. */
export const SALIDA_POR_PEDIDO: Record<Esfuerzo, number> = { low: 250, medium: 600, high: 1_200, xhigh: 2_000, max: 3_200 }
/** Pedidos al modelo por mensaje (cada herramienta es otro pedido). Aproximado. */
export const PEDIDOS_POR_NIVEL: Record<Nivel, number> = { trivial: 2, normal: 4, complejo: 9, profundo: 12 }
/** Lo que crece la conversación por pedido (resultados de herramientas, respuestas). */
const CRECE_POR_PEDIDO = 3_000

export type Costo = { usd: number; reescribe: number }

/** Lo que costaría el mensaje: releer la conversación en cada pedido, escribir lo nuevo, responder, y reescribir el caché si cambia el modelo. */
export function costoMensaje(a: { familia: Familia; esfuerzo: Esfuerzo; contexto: number; pedidos: number; cambiaModelo: boolean; ttl1h: boolean }): Costo {
  const p = precio(a.familia, a.contexto)
  const escritura = a.ttl1h ? p.escritura1h : p.escritura5m
  const relectura = a.pedidos * a.contexto * p.lectura
  const nuevo = a.pedidos * CRECE_POR_PEDIDO * escritura
  const salida = a.pedidos * SALIDA_POR_PEDIDO[a.esfuerzo] * p.salida
  const reescribe = a.cambiaModelo ? a.contexto : 0
  return { usd: (relectura + nuevo + salida + reescribe * escritura) / 1_000_000, reescribe }
}

// ---------- Opciones ----------

/**
 * `usd`: lo que costaría el mensaje en ese modelo, ya en él. `cambio`: lo que
 * cuesta una sola vez pasar a ese modelo (reescribir `reescribe` tokens de caché).
 */
export type Opcion = { tipo: TipoOpcion; modelo: string; esfuerzo: Esfuerzo; usd: number; cambio: number; reescribe: number }

/** Por encima de esto Toki no cambia de modelo: reescribir el caché pesa demasiado, y otro modelo puede tener otra ventana. */
export const CONTEXTO_MAX_CAMBIO = 180_000

function bajarEsfuerzo(e: Esfuerzo): Esfuerzo {
  return ESFUERZOS[Math.max(0, ESFUERZOS.indexOf(e) - 1)] ?? e
}

const ESFUERZO: Record<Exclude<TipoOpcion, 'actual'>, Record<Nivel, Esfuerzo>> = {
  calidad: { trivial: 'medium', normal: 'high', complejo: 'xhigh', profundo: 'max' },
  equilibrio: { trivial: 'low', normal: 'medium', complejo: 'high', profundo: 'xhigh' },
  ahorro: { trivial: 'low', normal: 'low', complejo: 'medium', profundo: 'high' },
}
/** Mensajes que se espera seguir en el modelo elegido: así se reparte lo que cuesta cambiar. */
export const HORIZONTE = 4
/** Con Sonnet primero, pasar a Sonnet es para quedarse: lo que cuesta cambiar se reparte en más mensajes. */
export const HORIZONTE_BASE = 8

const RECOMENDADA: Record<Nivel, Exclude<TipoOpcion, 'actual'>> = { trivial: 'ahorro', normal: 'equilibrio', complejo: 'equilibrio', profundo: 'calidad' }

export type Propuesta = { nivel: Nivel; actual: Opcion; opciones: Opcion[]; recomendada: Opcion }

/**
 * Tres opciones para el mensaje (calidad, equilibrio, ahorro) y la de ahora,
 * cada una con lo que costaría. Toki solo cambia entre Opus y Sonnet en el
 * hilo principal; con otro modelo (Fable, uno de Bedrock) solo mueve el esfuerzo.
 */
export function proponer(a: {
  nivel: Nivel
  /** El modelo con que va la conversación ahora (el tuyo, o el que Toki eligió). */
  modelo: string
  esfuerzo: Esfuerzo
  contexto: number
  ttl1h: boolean
  permitirModelo: boolean
  /**
   * No hay caché que perder: sesión nueva, después de /clear o de compactar,
   * o el caché ya venció. Ahí cambiar de modelo no reescribe nada extra.
   */
  cacheFrio?: boolean
  /**
   * "Solo Sonnet hasta que haga falta": el equilibrio va en Sonnet y Opus queda
   * para pensar a fondo o para cuando lo anterior no funcionó. Pasa a Sonnet
   * cuando sale gratis (caché frío) o cuando el cambio se paga.
   */
  sonnetPrimero?: boolean
  /** Lo anterior no funcionó (o sigue esa tarea): con Sonnet primero, toca Opus. */
  atascado?: boolean
}): Propuesta {
  const fam = familiaDe(a.modelo)
  const pedidos = PEDIDOS_POR_NIVEL[a.nivel]
  const puedeCambiar = a.permitirModelo && (fam === 'opus' || fam === 'sonnet') && hermano(a.modelo, 'opus') !== undefined && a.contexto <= CONTEXTO_MAX_CAMBIO
  const alto = puedeCambiar ? (hermano(a.modelo, 'opus') as string) : a.modelo
  const bajo = puedeCambiar ? (hermano(a.modelo, 'sonnet') as string) : a.modelo
  const opcion = (tipo: TipoOpcion, modelo: string, esfuerzo: Esfuerzo): Opcion => {
    const familia = familiaDe(modelo) ?? fam ?? 'opus'
    const base = { familia, esfuerzo, contexto: a.contexto, pedidos, ttl1h: a.ttl1h }
    const ya = costoMensaje({ ...base, cambiaModelo: false })
    const con = modelo !== a.modelo && a.cacheFrio !== true ? costoMensaje({ ...base, cambiaModelo: true }) : ya
    return { tipo, modelo, esfuerzo, usd: ya.usd, cambio: con.usd - ya.usd, reescribe: con.reescribe }
  }
  const sonnetPrimero = a.sonnetPrimero === true && puedeCambiar
  const horizonte = sonnetPrimero ? HORIZONTE_BASE : HORIZONTE
  /** ¿Lo que `alla` ahorra frente a `aqui` en los próximos mensajes paga reescribir el caché? */
  const sePaga = (aqui: Opcion, alla: Opcion): boolean => (aqui.usd - alla.usd) * horizonte > alla.cambio
  const actual = opcion('actual', a.modelo, a.esfuerzo)
  const calidad = opcion('calidad', alto, ESFUERZO.calidad[a.nivel])
  const esfuerzoEquilibrio = ESFUERZO.equilibrio[a.nivel]
  let modeloEquilibrio = a.nivel === 'complejo' || a.nivel === 'profundo' ? alto : a.modelo
  if (sonnetPrimero) {
    const haceFaltaOpus = a.nivel === 'profundo' || a.atascado === true
    // Con un caché grande y caliente, volver a Sonnet espera a que se pague (o a que el caché venza).
    modeloEquilibrio = haceFaltaOpus ? alto : bajo === a.modelo || sePaga(opcion('equilibrio', a.modelo, esfuerzoEquilibrio), opcion('equilibrio', bajo, esfuerzoEquilibrio)) ? bajo : a.modelo
  }
  const equilibrio = opcion('equilibrio', modeloEquilibrio, esfuerzoEquilibrio)
  // Ahorro: el modelo más barato, si lo que ahorra en los próximos mensajes paga reescribir el caché.
  const conCambio = opcion('ahorro', bajo, ESFUERZO.ahorro[a.nivel])
  const sinCambio = opcion('ahorro', a.modelo, bajo === a.modelo ? ESFUERZO.ahorro[a.nivel] : bajarEsfuerzo(equilibrio.esfuerzo))
  const ahorro = bajo !== a.modelo && sePaga(sinCambio, conCambio) ? conCambio : sinCambio
  const opciones = [calidad, equilibrio, ahorro].filter((o, i, todas) => todas.findIndex(p => p.modelo === o.modelo && p.esfuerzo === o.esfuerzo) === i)
  const tipoRecomendado = RECOMENDADA[a.nivel]
  const recomendada = opciones.find(o => o.tipo === tipoRecomendado) ?? equilibrio
  return { nivel: a.nivel, actual, opciones, recomendada }
}

export function igual(a: Pick<Opcion, 'modelo' | 'esfuerzo'>, b: Pick<Opcion, 'modelo' | 'esfuerzo'>): boolean {
  return a.modelo === b.modelo && a.esfuerzo === b.esfuerzo
}

/** Cuánto más (o menos) que como va ahora, en %. */
export function diferencia(o: Opcion, actual: Opcion): number {
  return actual.usd > 0 ? Math.round((o.usd / actual.usd - 1) * 100) : 0
}

/**
 * Lo que el cambio ahorra (positivo) o cuesta de más (negativo) en este mensaje,
 * a precio de API: lo de ahora menos lo elegido (con reescribir el caché, si toca).
 * Es una estimación: el mensaje nunca corre en las dos opciones.
 */
export function deltaRuteo(elegida: Pick<Opcion, 'usd' | 'cambio'>, actual: Pick<Opcion, 'usd'>): number {
  return actual.usd - (elegida.usd + elegida.cambio)
}

/**
 * Lo que costaría el mensaje sin Toki: tu modelo, con el esfuerzo de la sesión y
 * sin reescribir nada. Contra esto se cuenta lo que Toki ahorra en cada mensaje,
 * también en los que siguen en el modelo que eligió.
 */
export function costoSinToki(a: { nivel: Nivel; modelo: string; esfuerzo: Esfuerzo; contexto: number; ttl1h: boolean }): Pick<Opcion, 'usd'> {
  return costoMensaje({ familia: familiaDe(a.modelo) ?? 'opus', esfuerzo: a.esfuerzo, contexto: a.contexto, pedidos: PEDIDOS_POR_NIVEL[a.nivel], cambiaModelo: false, ttl1h: a.ttl1h })
}

/** Reescribir más que esto ya se nota: Toki pregunta antes. */
export const REESCRITURA_QUE_PREGUNTA = 30_000

/**
 * ¿Toki pregunta, cambia solo (y avisa), o deja todo como está?
 * `preguntar`: pregunta cuando la recomendada cuesta más o reescribe el caché; si ahorra, la aplica y avisa.
 */
export function decidirInterfaz(modo: ModoRuta, p: Propuesta, silenciado: boolean, base?: string): 'nada' | 'auto' | 'preguntar' {
  if (modo === 'no' || igual(p.recomendada, p.actual)) return 'nada'
  const masCara = p.recomendada.usd > p.actual.usd * 1.15
  const reescribe = p.recomendada.reescribe >= REESCRITURA_QUE_PREGUNTA
  if (modo === 'automatico') return 'auto'
  // Sonnet primero (`base`): volver a Sonnet ya lo elegiste, y solo se recomienda si se paga.
  const vuelveABase = base !== undefined && p.recomendada.modelo === base && p.actual.modelo !== base && !masCara
  if (vuelveABase && modo !== 'siempre') return 'auto'
  // Callado (dijiste "dejar como está" varias veces): solo lo que ahorra sin tocar el caché.
  if (silenciado) return !masCara && !reescribe ? 'auto' : 'nada'
  if (modo === 'siempre') return 'preguntar'
  return masCara || reescribe ? 'preguntar' : 'auto'
}

/**
 * El modelo de un subagente. Empieza con el contexto vacío: cambiarlo no
 * reescribe nada, es ahorro puro. Solo los generales (heredan el modelo del
 * padre) con un encargo simple. Explore y los demás traen su propio modelo
 * (a menudo Haiku, más barato aún): no se tocan. Nunca forks ni planes.
 */
export function modeloSubagente(tipo: string, encargo: string, modeloPadre: string, sonnetPrimero = false): string | undefined {
  const fam = familiaDe(modeloPadre)
  if (fam !== 'opus' && fam !== 'fable') return undefined
  const sonnet = hermano(modeloPadre, 'sonnet') ?? 'sonnet'
  if (tipo === 'general-purpose') {
    const l = nivelHeuristico(encargo)
    if (l.nivel === 'trivial' || (l.nivel === 'normal' && l.seguro)) return sonnet
    // Sonnet primero: también lo complejo; Opus solo para pensar a fondo o si lo anterior no funcionó.
    if (sonnetPrimero && fam === 'opus' && l.nivel !== 'profundo' && l.motivo !== 'atascado') return sonnet
  }
  return undefined
}

// ---------- Textos ----------

export type TextosRuta = {
  esfuerzo: Record<Esfuerzo, string>
  nivel: Record<Nivel, string>
  motivo: Record<Motivo, string>
  tipo: Record<TipoOpcion, string>
  pregunta: (nivel: string, motivo: string) => string
  opcion: (modelo: string, esfuerzo: string, tipo: string, usd: string, dif: string, reescribe?: string) => string
  dejar: (modelo: string, esfuerzo: string, usd: string) => string
  igual: string
  reescribe: (k: string, usd: string) => string
  cambio: (modelo: string, esfuerzo: string, dif: string) => string
  comoAntes: string
  deshacer: string
  deshecho: string
  silenciado: string
  callado: string
  subagentes: string
  modeloNoDisponible: (m: string) => string
  porToki: string
  titulo: string
  cmd: string
  uso: string
  modo: Record<ModoRuta, string>
  modoCambiado: (m: string) => string
  linea: (nivel: string, elegido: string, motivo: string) => string
  sinDecisiones: string
  ultimoMensaje: string
  sinLectura: string
  /** La franja: el ahorro por elegir modelo o esfuerzo. */
  porModelo: string
  balance: (ahorro: string, extra: string | undefined, suscripcion: boolean) => string
  decision: Record<Decision, string>
  /** /toki-modelo deshacer */
  deshacerHecho: (modelo: string, esfuerzo: string, nivel: string) => string
  nadaQueDeshacer: string
  sonnet: TextosSonnet
}

/** Lo que Toki hizo con el último mensaje (se ve en /toki-modelo). */
export type Decision = 'ya-va-asi' | 'callado' | 'deshecho' | 'auto' | 'preguntar'

export type TextosSonnet = {
  titulo: string
  cmd: string
  pista: string
  explicacion: string
  estado: (activo: boolean) => string
  pausa: string
  conteo: (sonnet: number, opus: number) => string
  activado: string
  apagado: (vuelvesA: string | undefined) => string
  sinRuteo: string
  soloEsfuerzo: (modelo: string) => string
  uso: string
}

export const textosRuta: Record<Idioma, TextosRuta> = {
  es: {
    esfuerzo: { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' },
    nivel: { trivial: 'simple', normal: 'normal', complejo: 'complejo', profundo: 'para pensar a fondo' },
    motivo: {
      'pide-pensar': 'pides pensarlo a fondo',
      'tarea-compleja': 'diseño, depuración o varios archivos',
      'mensaje-largo': 'es largo y con varias partes',
      'tarea-mecanica': 'tarea mecánica',
      'mensaje-corto': 'mensaje corto',
      seguimiento: 'sigue la tarea anterior',
      atascado: 'lo anterior no funcionó',
      'tarea-normal': 'tarea normal',
      clasificador: 'según Haiku',
    },
    tipo: { calidad: 'mejor calidad', equilibrio: 'equilibrio', ahorro: 'ahorro', actual: 'como está' },
    pregunta: (n, m) => `Toki: este mensaje parece ${n} (${m}). ¿Con qué lo hago?`,
    opcion: (m, e, t, usd, dif, r) => `${m} · ${e} — ${t} · ≈${usd} (${dif})${r ? `, ${r}` : ''}`,
    dejar: (m, e, usd) => `Dejar como está: ${m} · ${e} · ≈${usd}`,
    igual: 'igual',
    reescribe: (k, u) => `cambiar reescribe ${k} de caché (≈${u} una vez)`,
    cambio: (m, e, d) => `⚡ Este mensaje va con ${m} · esfuerzo ${e} (${d})`,
    comoAntes: 'como elegiste antes',
    deshacer: 'Deshacer',
    deshecho: 'deshecho',
    silenciado: 'callado por esta sesión',
    callado: 'Toki ya no preguntará por el modelo en esta sesión. Solo ajustará lo que ahorra sin tocar el caché. /toki-modelo preguntar lo vuelve a activar.',
    subagentes: 'Toki: los subagentes con encargos simples van en Sonnet (la mitad de precio; empiezan sin contexto, así que no se pierde caché).',
    modeloNoDisponible: m => `Toki: ${m} no respondió en esta cuenta; sigo con tu modelo y solo ajusto el esfuerzo.`,
    porToki: 'por Toki',
    titulo: 'Modelo y esfuerzo',
    cmd: 'Toki: cómo elige modelo y esfuerzo para cada mensaje (preguntar, siempre, automatico, no)',
    uso: 'Cambia el modo con /toki-modelo preguntar | siempre | automatico | no. /toki-modelo deshacer vuelve atrás el último cambio. /toki-sonnet: Solo Sonnet hasta que haga falta.',
    modo: {
      preguntar: 'pregunta cuando cuesta más; si ahorra, cambia y avisa',
      siempre: 'pregunta antes de cualquier cambio',
      automatico: 'cambia solo y avisa',
      no: 'apagado',
    },
    modoCambiado: m => `Toki: modelo y esfuerzo — ${m}.`,
    linea: (n, el, m) => `${n} (${m}) → ${el}`,
    sinDecisiones: 'Aún no hubo cambios de modelo o esfuerzo.',
    ultimoMensaje: 'Último mensaje',
    sinLectura: 'Toki todavía no leyó ningún mensaje en esta sesión (el primero calibra el esfuerzo).',
    porModelo: 'por modelo',
    balance: (a, e, s) =>
      `Ahorro por mandar mensajes a algo más barato: ${aprox(a)} estimado a precio de API${s ? ' (con suscripción no es dinero: es límite que no gastas)' : ''}${e ? ` · gasto extra que aprobaste: ${aprox(e)}` : ''}`,
    decision: { 'ya-va-asi': 'ya iba así', callado: 'sin cambio (no lo aplico sin preguntar)', deshecho: 'sin cambio (lo deshiciste antes)', auto: 'aplicado', preguntar: 'te pregunté' },
    deshacerHecho: (m, e, n) => `Toki: deshecho. Vuelves a ${m} · ${e}, y no lo repito en esta sesión cuando el mensaje sea ${n}.`,
    nadaQueDeshacer: 'Toki: no hay ningún cambio de modelo o esfuerzo que deshacer.',
    sonnet: {
      titulo: 'Solo Sonnet hasta que haga falta',
      cmd: 'Toki: trabaja en Sonnet y sube a Opus solo cuando hace falta (sí, no)',
      pista: 'sí | no',
      explicacion:
        'Trabaja en Sonnet (la mitad del precio de Opus) y sube a Opus solo cuando pides pensarlo a fondo o lo anterior no funcionó. Cambia de modelo cuando sale gratis (al empezar, o con el caché vencido) o cuando el cambio se paga; con un caché grande y caliente, espera. Subir cuesta más: en modo preguntar, Toki te pregunta antes.',
      estado: a => (a ? 'activado' : 'apagado'),
      pausa: 'en pausa en esta sesión: elegiste otro modelo con /model (/toki-sonnet sí lo reanuda)',
      conteo: (s, o) => `Esta sesión: ${s} ${s === 1 ? 'mensaje' : 'mensajes'} en Sonnet, ${o} en Opus`,
      activado: 'Toki: Solo Sonnet hasta que haga falta — activado, desde el próximo mensaje.',
      apagado: m => `Toki: Solo Sonnet hasta que haga falta — apagado.${m ? ` Desde el próximo mensaje vuelves a ${m}.` : ''}`,
      sinRuteo: 'Ojo: el modelo y esfuerzo por mensaje está apagado (/toki-modelo no). No hará nada hasta que lo prendas con /toki-modelo preguntar.',
      soloEsfuerzo: m => `Con ${m} no cambia de modelo: solo ajusta el esfuerzo.`,
      uso: 'Actívalo o apágalo con /toki-sonnet sí | no',
    },
  },
  en: {
    esfuerzo: { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' },
    nivel: { trivial: 'simple', normal: 'routine', complejo: 'complex', profundo: 'one to think through' },
    motivo: {
      'pide-pensar': 'you ask to think it through',
      'tarea-compleja': 'design, debugging or several files',
      'mensaje-largo': 'long, with several parts',
      'tarea-mecanica': 'mechanical task',
      'mensaje-corto': 'short message',
      seguimiento: 'continues the previous task',
      atascado: 'the last attempt did not work',
      'tarea-normal': 'routine task',
      clasificador: 'per Haiku',
    },
    tipo: { calidad: 'best quality', equilibrio: 'balanced', ahorro: 'savings', actual: 'as is' },
    pregunta: (n, m) => `Toki: this message looks ${n} (${m}). What should I use?`,
    opcion: (m, e, t, usd, dif, r) => `${m} · ${e} — ${t} · ≈${usd} (${dif})${r ? `, ${r}` : ''}`,
    dejar: (m, e, usd) => `Keep as is: ${m} · ${e} · ≈${usd}`,
    igual: 'same',
    reescribe: (k, u) => `switching rewrites ${k} of cache (≈${u} once)`,
    cambio: (m, e, d) => `⚡ This message runs on ${m} · ${e} effort (${d})`,
    comoAntes: 'as you chose before',
    deshacer: 'Undo',
    deshecho: 'undone',
    silenciado: 'quiet for this session',
    callado: 'Toki will stop asking about the model this session. It will only make changes that save without touching the cache. /toki-modelo preguntar turns it back on.',
    subagentes: 'Toki: subagents with simple tasks run on Sonnet (half the price; they start with no context, so no cache is lost).',
    modeloNoDisponible: m => `Toki: ${m} did not answer on this account; keeping your model and only adjusting effort.`,
    porToki: 'by Toki',
    titulo: 'Model and effort',
    cmd: 'Toki: how it picks model and effort for each message (preguntar, siempre, automatico, no)',
    uso: 'Change the mode with /toki-modelo preguntar | siempre | automatico | no. /toki-modelo undo reverts the last change. /toki-sonnet: Sonnet first, Opus when needed.',
    modo: {
      preguntar: 'asks when it costs more; switches and tells you when it saves',
      siempre: 'asks before any change',
      automatico: 'switches on its own and tells you',
      no: 'off',
    },
    modoCambiado: m => `Toki: model and effort — ${m}.`,
    linea: (n, el, m) => `${n} (${m}) → ${el}`,
    sinDecisiones: 'No model or effort changes yet.',
    ultimoMensaje: 'Last message',
    sinLectura: 'Toki has not read a message in this session yet (the first one calibrates the effort).',
    porModelo: 'by model',
    balance: (a, e, s) =>
      `Saved by sending messages to something cheaper: ${aprox(a)} estimated at API prices${s ? ' (on a subscription it is not money: it is limit you keep)' : ''}${e ? ` · extra cost you approved: ${aprox(e)}` : ''}`,
    decision: { 'ya-va-asi': 'already on it', callado: 'no change (not applied without asking)', deshecho: 'no change (you undid it before)', auto: 'applied', preguntar: 'asked you' },
    deshacerHecho: (m, e, n) => `Toki: undone. Back to ${m} · ${e}, and I won't repeat it this session for messages like this one (${n}).`,
    nadaQueDeshacer: 'Toki: there is no model or effort change to undo.',
    sonnet: {
      titulo: 'Sonnet first, Opus when needed',
      cmd: 'Toki: work on Sonnet and move up to Opus only when needed (on, off)',
      pista: 'on | off',
      explicacion:
        'Works on Sonnet (half the price of Opus) and moves up to Opus only when you ask to think it through or the last attempt did not work. It switches models when it is free (at the start, or with an expired cache) or when the switch pays off; with a large warm cache, it waits. Moving up costs more: in preguntar mode, Toki asks you first.',
      estado: a => (a ? 'on' : 'off'),
      pausa: 'paused this session: you picked another model with /model (/toki-sonnet on resumes it)',
      conteo: (s, o) => `This session: ${s} ${s === 1 ? 'message' : 'messages'} on Sonnet, ${o} on Opus`,
      activado: 'Toki: Sonnet first, Opus when needed — on, from the next message.',
      apagado: m => `Toki: Sonnet first, Opus when needed — off.${m ? ` From the next message you are back on ${m}.` : ''}`,
      sinRuteo: 'Note: model and effort per message is off (/toki-modelo no). It will do nothing until you turn it on with /toki-modelo preguntar.',
      soloEsfuerzo: m => `With ${m} it does not switch models: it only adjusts effort.`,
      uso: 'Turn it on or off with /toki-sonnet on | off',
    },
  },
}

export function usd(n: number): string {
  return n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`
}

/** "~$0.42", o "<$0.01" tal cual (ya dice que es aproximado). */
export function aprox(monto: string): string {
  return monto.startsWith('<') ? monto : `~${monto}`
}

export function textoDiferencia(dif: number, x: TextosRuta): string {
  if (Math.abs(dif) < 5) return x.igual
  return dif > 0 ? `+${dif}%` : `−${Math.abs(dif)}%`
}

function k(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1_000)}k`
}

/** Las etiquetas del diálogo, en el orden de las opciones, y la de "dejar como está" al final. */
export function etiquetas(p: Propuesta, x: TextosRuta): { opciones: { etiqueta: string; opcion: Opcion }[]; dejar: string } {
  const opciones = p.opciones.map(o => {
    const tipo = o === p.recomendada ? `${x.tipo[o.tipo]} ★` : x.tipo[o.tipo]
    return {
      opcion: o,
      etiqueta: x.opcion(nombreCorto(o.modelo), x.esfuerzo[o.esfuerzo], tipo, usd(o.usd), textoDiferencia(diferencia(o, p.actual), x), o.reescribe > 0 ? x.reescribe(k(o.reescribe), usd(o.cambio)) : undefined),
    }
  })
  return { opciones, dejar: x.dejar(nombreCorto(p.actual.modelo), x.esfuerzo[p.actual.esfuerzo], usd(p.actual.usd)) }
}
