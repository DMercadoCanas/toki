// La tarjeta semanal: cuánto ahorró Toki, en qué, cuánto leyó Claude, una nota de la A a la F
// con tus hábitos y un consejo con tus cifras. Funciones puras: el registro lo hace register.tsx.

import { claveDia } from './historial'
import type { Historial } from './historial'
import type { Idioma } from './idioma'
import { formatearTokens } from './mascota'
import { aprox, usd } from './modelo'
import type { Familia } from './modelo'

export type TipoAhorro = 'salida' | 'repetida' | 'busqueda' | 'pegado'

export const TIPOS_AHORRO: TipoAhorro[] = ['salida', 'busqueda', 'pegado', 'repetida']

const FAMILIAS: Familia[] = ['sonnet', 'opus', 'haiku', 'fable']

const NOMBRE_FAMILIA: Record<Familia, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku', fable: 'Fable' }

/** Pedidos grandes con preguntas antes ("con") o sin ellas ("sin"), y las correcciones que siguieron a cada grupo. */
export type Entrevistas = { con: number; conCorr: number; sin: number; sinCorr: number }

export type CampoEntrevista = keyof Entrevistas

const CAMPOS_ENTREVISTA: CampoEntrevista[] = ['con', 'conCorr', 'sin', 'sinCorr']

export type ResumenSemana = {
  /** Tokens que no entraron al contexto, por tipo. */
  porTipo: Partial<Record<TipoAhorro, number>>
  /** Relecturas evitadas (neto). */
  relecturas: number
  /** Pedidos del hilo principal y tokens que la API leyó o escribió en ellos (más subagentes). */
  pedidos: number
  tokensLeidos: number
  /** Costo estimado en USD que reporta Claude Code (en suscripción es orientativo). */
  costo: number
  sesiones: number
  /** Lecturas enteras de archivos generados que Toki frenó. */
  frenos: number
  /** Pedidos con más de 150k de contexto: conversaciones que se alargaron. */
  pedidosLargos: number
  /** Mensajes tuyos que salieron hacia Claude, y cuántos corregían lo anterior. */
  mensajes: number
  correcciones: number
  /** Mensajes tuyos por modelo: el que respondió de verdad. */
  porModelo: Partial<Record<Familia, number>>
  /** Lo que movió elegir modelo y esfuerzo por mensaje, en USD a precio de API: ahorrado y de más que aprobaste. */
  ruteo: number
  ruteoExtra: number
  /** Lo que valen los recortes y las relecturas evitadas, en USD a precio de API (neto). */
  ahorroUsd: number
  /** Lo que de verdad costaron los pedidos (principal y subagentes), medido por Toki, en USD a precio de API. */
  gastoUsd: number
  entrevistas: Entrevistas
  /** Consejos para pedir mejor que Toki mostró. */
  consejos: number
  /** Mensajes que salieron con el caché vencido y mucho contexto: cada uno reescribe la conversación. */
  frios: number
}

export type Semanas = Record<string, ResumenSemana> // lunes 'AAAA-MM-DD' → resumen

export const SEMANAS_GUARDADAS = 12
export const CONTEXTO_LARGO = 150_000

const DIA = 86_400_000

export const SEMANA_VACIA: ResumenSemana = {
  porTipo: {},
  relecturas: 0,
  pedidos: 0,
  tokensLeidos: 0,
  costo: 0,
  sesiones: 0,
  frenos: 0,
  pedidosLargos: 0,
  mensajes: 0,
  correcciones: 0,
  porModelo: {},
  ruteo: 0,
  ruteoExtra: 0,
  ahorroUsd: 0,
  gastoUsd: 0,
  entrevistas: { con: 0, conCorr: 0, sin: 0, sinCorr: 0 },
  consejos: 0,
  frios: 0,
}

/** Una semana vacía con sus propios objetos (SEMANA_VACIA no se toca nunca). */
function vacia(): ResumenSemana {
  return { ...SEMANA_VACIA, porTipo: {}, porModelo: {}, entrevistas: { ...SEMANA_VACIA.entrevistas } }
}

/** Lunes (hora local) de la semana de `ms`, como 'AAAA-MM-DD'. */
export function lunesDe(ms: number): string {
  const d = new Date(ms)
  const desdeLunes = (d.getDay() + 6) % 7
  return claveDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() - desdeLunes, 12).getTime())
}

function msDeClave(clave: string): number {
  const [a, m, d] = clave.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime()
}

export function semanaAnterior(clave: string): string {
  return claveDia(msDeClave(clave) - 7 * DIA)
}

function numero(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

/** Solo las claves conocidas, con valores positivos. */
function mapa<K extends string>(x: unknown, claves: readonly K[]): Partial<Record<K, number>> {
  const salida: Partial<Record<K, number>> = {}
  if (x === null || typeof x !== 'object') return salida
  for (const k of claves) {
    const v = numero((x as Record<string, unknown>)[k])
    if (v > 0) salida[k] = v
  }
  return salida
}

function leerResumen(valor: unknown): ResumenSemana {
  if (valor === null || typeof valor !== 'object') return vacia()
  const v = valor as Record<string, unknown>
  const e = mapa(v['entrevistas'], CAMPOS_ENTREVISTA)
  return {
    porTipo: mapa(v['porTipo'], TIPOS_AHORRO),
    relecturas: numero(v['relecturas']),
    pedidos: numero(v['pedidos']),
    tokensLeidos: numero(v['tokensLeidos']),
    costo: numero(v['costo']),
    sesiones: numero(v['sesiones']),
    frenos: numero(v['frenos']),
    pedidosLargos: numero(v['pedidosLargos']),
    mensajes: Math.max(0, numero(v['mensajes'])),
    correcciones: Math.max(0, numero(v['correcciones'])),
    porModelo: mapa(v['porModelo'], FAMILIAS),
    ruteo: Math.max(0, numero(v['ruteo'])),
    ruteoExtra: Math.max(0, numero(v['ruteoExtra'])),
    ahorroUsd: numero(v['ahorroUsd']),
    gastoUsd: Math.max(0, numero(v['gastoUsd'])),
    entrevistas: { con: e.con ?? 0, conCorr: e.conCorr ?? 0, sin: e.sin ?? 0, sinCorr: e.sinCorr ?? 0 },
    consejos: Math.max(0, numero(v['consejos'])),
    frios: Math.max(0, numero(v['frios'])),
  }
}

/** Lo guardado en el store, saneado. */
export function leerSemanas(valor: unknown): Semanas {
  if (valor === null || typeof valor !== 'object') return {}
  const salida: Semanas = {}
  for (const [clave, resumen] of Object.entries(valor as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(clave)) salida[clave] = leerResumen(resumen)
  }
  return salida
}

export type Delta = {
  tipo?: TipoAhorro
  ahorro?: number
  relecturas?: number
  pedidos?: number
  tokensLeidos?: number
  costo?: number
  sesiones?: number
  frenos?: number
  pedidosLargos?: number
  mensajes?: number
  correcciones?: number
  /** Un mensaje más en este modelo. */
  modelo?: Familia
  /** USD a precio de API; negativo al deshacer. */
  ruteo?: number
  ruteoExtra?: number
  /** USD de recortes y relecturas evitadas (negativo al compactar). */
  ahorroUsd?: number
  /** USD que de verdad costó un pedido. */
  gastoUsd?: number
  /** Uno más en ese grupo. */
  entrevista?: CampoEntrevista
  consejos?: number
  frios?: number
}

/** Suma a la semana de `ms` y guarda solo las últimas 12. */
export function sumarSemana(semanas: Semanas, ms: number, d: Delta): Semanas {
  const clave = lunesDe(ms)
  const s = semanas[clave] ?? vacia()
  const porTipo = { ...s.porTipo }
  if (d.tipo !== undefined && numero(d.ahorro) > 0) porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + numero(d.ahorro)
  const porModelo = { ...s.porModelo }
  if (d.modelo !== undefined) porModelo[d.modelo] = (porModelo[d.modelo] ?? 0) + 1
  const entrevistas = { ...s.entrevistas }
  if (d.entrevista !== undefined) entrevistas[d.entrevista] += 1
  const nuevo: ResumenSemana = {
    porTipo,
    relecturas: s.relecturas + numero(d.relecturas),
    pedidos: s.pedidos + numero(d.pedidos),
    tokensLeidos: s.tokensLeidos + numero(d.tokensLeidos),
    costo: s.costo + Math.max(0, numero(d.costo)),
    sesiones: s.sesiones + numero(d.sesiones),
    frenos: s.frenos + numero(d.frenos),
    pedidosLargos: s.pedidosLargos + numero(d.pedidosLargos),
    mensajes: s.mensajes + numero(d.mensajes),
    correcciones: s.correcciones + numero(d.correcciones),
    porModelo,
    ruteo: Math.max(0, s.ruteo + numero(d.ruteo)),
    ruteoExtra: Math.max(0, s.ruteoExtra + numero(d.ruteoExtra)),
    ahorroUsd: s.ahorroUsd + numero(d.ahorroUsd),
    gastoUsd: s.gastoUsd + Math.max(0, numero(d.gastoUsd)),
    entrevistas,
    consejos: s.consejos + numero(d.consejos),
    frios: s.frios + numero(d.frios),
  }
  const siguiente: Semanas = { ...semanas, [clave]: nuevo }
  const claves = Object.keys(siguiente).sort()
  for (const vieja of claves.slice(0, Math.max(0, claves.length - SEMANAS_GUARDADAS))) delete siguiente[vieja]
  return siguiente
}

export function ahorroDe(s: ResumenSemana | undefined): number {
  if (s === undefined) return 0
  return TIPOS_AHORRO.reduce((a, t) => a + (s.porTipo[t] ?? 0), 0)
}

/**
 * ¿Toca mostrar la tarjeta de la semana pasada? Al primer inicio de una semana nueva,
 * si la pasada tuvo actividad y no se mostró todavía. Devuelve el lunes de la semana pasada.
 */
export function tarjetaPendiente(semanas: Semanas, ms: number, ultimaMostrada: unknown): string | undefined {
  const pasada = semanaAnterior(lunesDe(ms))
  if (ultimaMostrada === pasada) return undefined
  const s = semanas[pasada]
  if (s === undefined || (ahorroDe(s) <= 0 && s.pedidos === 0)) return undefined
  return pasada
}

// ---------- La nota ----------

/** Con menos que esto la nota no dice nada y no se pone. La claridad necesita más mensajes. */
export const NOTA_MIN = { pedidos: 20, mensajes: 5, mensajesClaridad: 10 } as const

const PESOS = { contexto: 0.5, claridad: 0.3, cache: 0.2 } as const

export type ClaveNota = keyof typeof PESOS

export type Letra = 'A' | 'B' | 'C' | 'D' | 'F'

export type Nota = { letra: Letra; puntos: number; partes: { clave: ClaveNota; puntos: number; peso: number }[] }

function limitar(x: number): number {
  return Math.round(Math.min(100, Math.max(0, x)))
}

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

export function letraDe(puntos: number): Letra {
  return puntos >= 85 ? 'A' : puntos >= 70 ? 'B' : puntos >= 55 ? 'C' : puntos >= 40 ? 'D' : 'F'
}

/**
 * La nota de la semana, de 0 a 100 y en letra. Mide tres hábitos que mueven el gasto:
 * - contexto: conversaciones que no se alargan de más (pedidos con más de 150k);
 * - claridad: pocos mensajes que corrigen lo anterior (cada corrección relee todo);
 * - caché: no volver con el caché vencido y mucho contexto (ese mensaje reescribe todo).
 * Lo que ya ahorra Toki no cuenta: la nota es tuya. Sin cifras suficientes, no hay nota.
 */
export function notaDe(s: ResumenSemana): Nota | undefined {
  if (s.pedidos < NOTA_MIN.pedidos || s.mensajes < NOTA_MIN.mensajes) return undefined
  const partes: Nota['partes'] = [{ clave: 'contexto', puntos: limitar(100 - 200 * (s.pedidosLargos / s.pedidos)), peso: PESOS.contexto }]
  if (s.mensajes >= NOTA_MIN.mensajesClaridad) {
    partes.push({ clave: 'claridad', puntos: limitar(100 - 400 * (s.correcciones / s.mensajes)), peso: PESOS.claridad })
  }
  partes.push({ clave: 'cache', puntos: limitar(100 - 50 * (s.frios / Math.max(1, s.sesiones))), peso: PESOS.cache })
  const peso = partes.reduce((a, p) => a + p.peso, 0)
  const puntos = Math.round(partes.reduce((a, p) => a + p.puntos * p.peso, 0) / peso)
  return { letra: letraDe(puntos), puntos, partes }
}

// ---------- Textos ----------

const MESES = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

const DIAS = {
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const ES = {
  titulo: (desde: string, hasta: string, actual: boolean) => `Toki · ${actual ? 'esta semana' : 'semana'} (${desde} – ${hasta})`,
  nota: (letra: Letra, puntos: number) => `Nota: ${letra} (${puntos}/100)`,
  notaPendiente: (p: number, m: number) => `Nota: todavía no. La pongo desde ${NOTA_MIN.pedidos} pedidos y ${NOTA_MIN.mensajes} mensajes tuyos (van ${p} y ${m}).`,
  partes: { contexto: 'Contexto', claridad: 'Claridad', cache: 'Caché' } as Record<ClaveNota, string>,
  porqueContexto: (pct: number) => (pct <= 0 ? 'ningún pedido pasó de 150k de contexto' : `el ${pct}% de tus pedidos pasó de 150k de contexto`),
  porqueClaridad: (c: number, m: number) => (c <= 0 ? `ninguna corrección en ${m} mensajes` : `${c} ${c === 1 ? 'corrección' : 'correcciones'} en ${m} mensajes`),
  porqueCache: (f: number) => (f <= 0 ? 'nunca volviste con el caché vencido' : `volviste ${f === 1 ? 'una vez' : `${f} veces`} con el caché vencido y mucho contexto`),
  ahorre: (t: string) => `Te ahorré ~${t} tokens`,
  sinAhorro: 'Esta semana no hubo salidas grandes que recortar.',
  vsAnterior: (pct: number) => (pct >= 0 ? `▲ ${pct}% vs. la semana anterior` : `▼ ${-pct}% vs. la semana anterior`),
  tipos: { salida: 'salidas de terminal', busqueda: 'búsquedas enormes', pegado: 'textos pegados', repetida: 'salidas repetidas' } as Record<TipoAhorro, string>,
  relecturas: (t: string) => `Además, ~${t} tokens que Claude no tuvo que releer`,
  frenos: (n: number) => `${n} ${n === 1 ? 'lectura frenada' : 'lecturas frenadas'} de archivos generados`,
  ruteo: (ahorro: string, suscripcion: boolean, extra: string | undefined) =>
    `Elegir modelo y esfuerzo por mensaje ahorró ${ahorro} a precio de API${suscripcion ? ' (con suscripción: límite que no gastas)' : ''}${extra !== undefined ? ` · ${extra} de más que aprobaste` : ''}`,
  ruteoSoloExtra: (extra: string) => `Elegir modelo y esfuerzo por mensaje: ${extra} de más que aprobaste (a precio de API)`,
  leyo: (t: string, p: number, s: number) => `Claude leyó ~${t} tokens en ${p} pedidos (${s} ${s === 1 ? 'sesión' : 'sesiones'})`,
  costo: (usd: string) => ` · ~$${usd}`,
  proporcion: (pct: string) => `Lo que Toki evitó equivale al ${pct}% de lo que Claude leyó.`,
  porModelo: (lista: string) => `Mensajes por modelo: ${lista}`,
  pedidosGrandes: (partes: string) => `Pedidos grandes: ${partes}`,
  entrevistaCon: (n: number, r: string) => `${n} con preguntas antes (${r} correcciones por pedido)`,
  entrevistaSin: (n: number, r: string, ambos: boolean) => (ambos ? `${n} sin preguntas (${r} por pedido)` : `${n} sin preguntas antes (${r} correcciones por pedido)`),
  consejosDados: (n: number) => `${n} ${n === 1 ? 'consejo' : 'consejos'} para pedir mejor`,
  consejosSolos: (n: number) => `Toki te dio ${n} ${n === 1 ? 'consejo' : 'consejos'} para pedir mejor`,
  mejorDia: (d: string, t: string) => `Mejor día: ${d} (~${t})`,
  racha: (n: number) => `racha de ${n} ${n === 1 ? 'día' : 'días'}`,
  consejo: 'Consejo:',
  consejoLargos: (pct: number) =>
    `el ${pct}% de tus pedidos pasó de 150k de contexto. Un /clear al cambiar de tarea (o /compact a mitad de una larga) abarata cada mensaje que sigue.`,
  consejoCorrecciones: (pct: number) =>
    `el ${pct}% de tus mensajes corregía lo anterior. Antes de un pedido grande di qué resultado esperas y qué no tocar, o deja que Claude te pregunte antes (/toki-entrevista auto): cada corrección relee toda la conversación.`,
  consejoFrio: (n: number) =>
    `volviste ${n === 1 ? 'una vez' : `${n} veces`} con el caché vencido y mucho contexto: cada uno de esos mensajes reescribe toda la conversación. Antes de una pausa larga, /compact (o /clear si terminaste); al volver, acepta compactar cuando Toki lo ofrezca.`,
  consejoPegado: 'pegaste textos enormes varias veces. Si es un log, guárdalo en un archivo y pídele a Claude que lo lea: así no se relee entero en cada mensaje.',
  consejoFrenos: 'Claude intentó leer archivos generados varias veces. Agregarlos a un CLAUDE.md ("no leas package-lock.json entero") lo evita desde el principio.',
  consejoSonnet: (o: number, t: number) =>
    `${o} de tus ${t} mensajes fueron a Opus. Con /toki-sonnet sí, Toki trabaja en Sonnet (cuesta la mitad) y sube a Opus solo cuando hace falta.`,
  consejoBien: 'vas bien. Mira /toki para ver a dónde se va cada token de la sesión.',
  vacia: 'Toki todavía no tiene cifras de esta semana.',
  aviso: (t: string, cambio: string, letra: Letra | undefined) =>
    `Toki: la semana pasada te ahorré ~${t} tokens${cambio}${letra !== undefined ? ` · nota ${letra}` : ''}. Escribe /toki-semana pasada para ver la tarjeta.`,
  avisoSinAhorro: (letra: Letra | undefined) =>
    `Toki: la tarjeta de la semana pasada está lista${letra !== undefined ? ` (nota ${letra})` : ''}. Escribe /toki-semana pasada para verla.`,
  guardada: (ruta: string) => `Toki: guardé la tarjeta en ${ruta} (Markdown).`,
  noGuardada: (error: string) => `Toki: no pude guardar la tarjeta (${error}).`,
  md: {
    ahorro: 'Ahorro',
    uso: 'Uso',
    consejo: 'Consejo',
    puntos: 'Puntos',
    porque: 'Por qué',
    tipo: 'Tipo',
    tokens: 'Tokens',
    pie: (semana: string, hoy: string) => `Tarjeta de Toki de la semana del ${semana}, generada el ${hoy}.`,
  },
}

type Textos = typeof ES

const EN: Textos = {
  titulo: (desde, hasta, actual) => `Toki · ${actual ? 'this week' : 'week'} (${desde} – ${hasta})`,
  nota: (letra, puntos) => `Grade: ${letra} (${puntos}/100)`,
  notaPendiente: (p, m) => `Grade: not yet. I grade from ${NOTA_MIN.pedidos} requests and ${NOTA_MIN.mensajes} messages of yours (so far ${p} and ${m}).`,
  partes: { contexto: 'Context', claridad: 'Clarity', cache: 'Cache' },
  porqueContexto: pct => (pct <= 0 ? 'no request went past 150k of context' : `${pct}% of your requests went past 150k of context`),
  porqueClaridad: (c, m) => (c <= 0 ? `no corrections in ${m} messages` : `${c} ${c === 1 ? 'correction' : 'corrections'} in ${m} messages`),
  porqueCache: f => (f <= 0 ? 'never came back to an expired cache' : `came back to an expired cache ${f === 1 ? 'once' : `${f} times`} with a big context`),
  ahorre: t => `I saved you ~${t} tokens`,
  sinAhorro: 'No big outputs to trim this week.',
  vsAnterior: pct => (pct >= 0 ? `▲ ${pct}% vs. the week before` : `▼ ${-pct}% vs. the week before`),
  tipos: { salida: 'terminal output', busqueda: 'huge searches', pegado: 'pasted text', repetida: 'repeated output' },
  relecturas: t => `Plus ~${t} tokens Claude didn't have to re-read`,
  frenos: n => `${n} full ${n === 1 ? 'read' : 'reads'} of generated files held back`,
  ruteo: (ahorro, suscripcion, extra) =>
    `Picking model and effort per message saved ${ahorro} at API prices${suscripcion ? " (on a subscription: limit you don't spend)" : ''}${extra !== undefined ? ` · ${extra} extra you approved` : ''}`,
  ruteoSoloExtra: extra => `Picking model and effort per message: ${extra} extra you approved (at API prices)`,
  leyo: (t, p, s) => `Claude read ~${t} tokens over ${p} requests (${s} ${s === 1 ? 'session' : 'sessions'})`,
  costo: usd => ` · ~$${usd}`,
  proporcion: pct => `What Toki avoided equals ${pct}% of what Claude read.`,
  porModelo: lista => `Messages per model: ${lista}`,
  pedidosGrandes: partes => `Big requests: ${partes}`,
  entrevistaCon: (n, r) => `${n} with questions first (${r} corrections each)`,
  entrevistaSin: (n, r, ambos) => (ambos ? `${n} without (${r} each)` : `${n} without questions first (${r} corrections each)`),
  consejosDados: n => `${n} ${n === 1 ? 'tip' : 'tips'} on asking better`,
  consejosSolos: n => `Toki gave you ${n} ${n === 1 ? 'tip' : 'tips'} on asking better`,
  mejorDia: (d, t) => `Best day: ${d} (~${t})`,
  racha: n => `${n}-day streak`,
  consejo: 'Tip:',
  consejoLargos: pct =>
    `${pct}% of your requests went past 150k of context. A /clear when you switch tasks (or /compact in the middle of a long one) makes every following message cheaper.`,
  consejoCorrecciones: pct =>
    `${pct}% of your messages corrected the previous answer. Before a big request, say what result you expect and what not to touch, or let Claude ask you first (/toki-entrevista auto): every correction re-reads the whole conversation.`,
  consejoFrio: n =>
    `you came back to an expired cache with a big context ${n === 1 ? 'once' : `${n} times`}: each of those messages rewrites the whole conversation. Before a long break, /compact (or /clear if you're done); when you're back, accept compacting when Toki offers it.`,
  consejoPegado: 'you pasted huge texts several times. If it is a log, save it to a file and ask Claude to read it, so it is not re-read on every message.',
  consejoFrenos: 'Claude tried to read generated files several times. A line in CLAUDE.md ("don\'t read package-lock.json whole") prevents it from the start.',
  consejoSonnet: (o, t) => `${o} of your ${t} messages went to Opus. With /toki-sonnet on, Toki works in Sonnet (half the cost) and moves up to Opus only when needed.`,
  consejoBien: "you're doing well. Open /toki to see where each token of the session goes.",
  vacia: 'Toki has no numbers for this week yet.',
  aviso: (t, cambio, letra) => `Toki: last week I saved you ~${t} tokens${cambio}${letra !== undefined ? ` · grade ${letra}` : ''}. Type /toki-semana last to see the card.`,
  avisoSinAhorro: letra => `Toki: last week's card is ready${letra !== undefined ? ` (grade ${letra})` : ''}. Type /toki-semana last to see it.`,
  guardada: ruta => `Toki: saved the card to ${ruta} (Markdown).`,
  noGuardada: error => `Toki: couldn't save the card (${error}).`,
  md: {
    ahorro: 'Savings',
    uso: 'Usage',
    consejo: 'Tip',
    puntos: 'Points',
    porque: 'Why',
    tipo: 'Type',
    tokens: 'Tokens',
    pie: (semana, hoy) => `Toki card for the week of ${semana}, generated on ${hoy}.`,
  },
}

const TEXTOS: Record<Idioma, Textos> = { es: ES, en: EN }

function fecha(ms: number, idioma: Idioma): string {
  const d = new Date(ms)
  return idioma === 'en' ? `${MESES.en[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MESES.es[d.getMonth()]}`
}

function fechaLarga(ms: number, idioma: Idioma): string {
  const d = new Date(ms)
  return idioma === 'en' ? `${fecha(ms, idioma)}, ${d.getFullYear()}` : `${fecha(ms, idioma)} ${d.getFullYear()}`
}

function cambioPct(actual: number, anterior: number): number | undefined {
  if (anterior <= 0) return undefined
  return Math.round(((actual - anterior) / anterior) * 100)
}

function totalMensajesPorModelo(s: ResumenSemana): number {
  return FAMILIAS.reduce((a, f) => a + (s.porModelo[f] ?? 0), 0)
}

/** Consejo con las cifras de la semana: lo más flojo de la nota primero, si no el más útil que aplique. */
export function consejoDe(s: ResumenSemana, idioma: Idioma = 'es', opciones: { sonnetPrimero?: boolean } = {}): string {
  const x = TEXTOS[idioma]
  const pctLargos = pct(s.pedidosLargos, s.pedidos)
  const floja = notaDe(s)
    ?.partes.filter(p => p.puntos < 70)
    .sort((a, b) => a.puntos - b.puntos || b.peso - a.peso)[0]
  if (floja?.clave === 'contexto') return x.consejoLargos(Math.max(1, pctLargos))
  if (floja?.clave === 'claridad') return x.consejoCorrecciones(Math.max(1, pct(s.correcciones, s.mensajes)))
  if (floja?.clave === 'cache') return x.consejoFrio(s.frios)
  if (s.pedidos >= 20 && pctLargos >= 30) return x.consejoLargos(pctLargos)
  if ((s.porTipo.pegado ?? 0) >= 30_000) return x.consejoPegado
  if (s.frenos >= 3) return x.consejoFrenos
  // Casi todo en Opus y Sonnet primero apagado: la mitad del precio a un comando.
  const opus = s.porModelo.opus ?? 0
  const total = totalMensajesPorModelo(s)
  if (opciones.sonnetPrimero !== true && opus >= 15 && opus / total >= 0.6) return x.consejoSonnet(opus, total)
  return x.consejoBien
}

function barra(valor: number, maximo: number, ancho: number): string {
  const lleno = valor <= 0 ? 0 : Math.max(1, Math.round((valor / Math.max(1, maximo)) * ancho))
  return '█'.repeat(lleno) + '░'.repeat(ancho - lleno)
}

/** Lo que movió elegir modelo y esfuerzo por mensaje (menos de medio centavo no se muestra). */
function lineaRuteo(s: ResumenSemana, x: Textos, suscripcion: boolean): string | undefined {
  const ahorro = s.ruteo >= 0.005 ? aprox(usd(s.ruteo)) : undefined
  const extra = s.ruteoExtra >= 0.005 ? aprox(usd(s.ruteoExtra)) : undefined
  if (ahorro !== undefined) return x.ruteo(ahorro, suscripcion, extra)
  return extra !== undefined ? x.ruteoSoloExtra(extra) : undefined
}

/** Pedidos grandes con y sin preguntas antes, y cuántas correcciones siguieron a cada uno. */
function lineaEntrevistas(s: ResumenSemana, x: Textos): string | undefined {
  const { con, conCorr, sin, sinCorr } = s.entrevistas
  const partes: string[] = []
  if (con > 0) partes.push(x.entrevistaCon(con, (conCorr / con).toFixed(1)))
  if (sin > 0) partes.push(x.entrevistaSin(sin, (sinCorr / sin).toFixed(1), con > 0))
  if (partes.length === 0) return s.consejos > 0 ? x.consejosSolos(s.consejos) : undefined
  if (s.consejos > 0) partes.push(x.consejosDados(s.consejos))
  return x.pedidosGrandes(partes.join(' · '))
}

function porqueDe(clave: ClaveNota, s: ResumenSemana, x: Textos): string {
  if (clave === 'contexto') return x.porqueContexto(s.pedidosLargos > 0 ? Math.max(1, pct(s.pedidosLargos, s.pedidos)) : 0)
  if (clave === 'claridad') return x.porqueClaridad(s.correcciones, s.mensajes)
  return x.porqueCache(s.frios)
}

export type OpcionesTarjeta = {
  idioma?: Idioma
  mostrarCosto?: boolean
  racha?: number
  /** Con suscripción, lo que ahorra elegir modelo no es dinero: es límite que no se gasta. */
  suscripcion?: boolean
  /** Sonnet primero ya está prendido: el consejo de prenderlo sobra. */
  sonnetPrimero?: boolean
  formato?: 'texto' | 'md'
}

/** La tarjeta en piezas, para armarla en texto (el panel) o en Markdown (el archivo). */
type Piezas = {
  titulo: string
  nota?: { titulo: string; filas: { etiqueta: string; puntos: number; porque: string }[] }
  notaPendiente?: string
  ahorro: string
  tipos: { etiqueta: string; tokens: number }[]
  /** Más ahorro: relecturas, lecturas frenadas, modelo y esfuerzo. */
  extras: string[]
  /** Cómo se usó Claude: lo leído, los modelos, los pedidos grandes, el mejor día. */
  uso: string[]
  consejo: string
}

function piezas(semanas: Semanas, lunes: string, ms: number, historial: Historial, s: ResumenSemana, opciones: OpcionesTarjeta): Piezas {
  const idioma = opciones.idioma ?? 'es'
  const x = TEXTOS[idioma]
  const inicio = msDeClave(lunes)
  const actual = lunesDe(ms) === lunes
  const ahorro = ahorroDe(s)
  let lineaAhorro = x.sinAhorro
  if (ahorro > 0) {
    const cambio = cambioPct(ahorro, ahorroDe(semanas[semanaAnterior(lunes)]))
    lineaAhorro = `${x.ahorre(formatearTokens(ahorro))}${cambio !== undefined && !actual ? `  (${x.vsAnterior(cambio)})` : ''}`
  }
  const tipos = TIPOS_AHORRO.filter(t => (s.porTipo[t] ?? 0) > 0)
    .sort((a, b) => (s.porTipo[b] ?? 0) - (s.porTipo[a] ?? 0))
    .map(t => ({ etiqueta: x.tipos[t], tokens: s.porTipo[t] ?? 0 }))
  const extras: string[] = []
  if (s.relecturas > 0) extras.push(x.relecturas(formatearTokens(s.relecturas)))
  if (s.frenos > 0) extras.push(x.frenos(s.frenos))
  const ruteo = lineaRuteo(s, x, opciones.suscripcion === true)
  if (ruteo !== undefined) extras.push(ruteo)
  const uso: string[] = []
  if (s.pedidos > 0) {
    uso.push(`${x.leyo(formatearTokens(s.tokensLeidos), s.pedidos, Math.max(1, s.sesiones))}${opciones.mostrarCosto === true && s.costo > 0 ? x.costo(s.costo.toFixed(2)) : ''}`)
    const evitado = ahorro + Math.max(0, s.relecturas)
    if (evitado > 0 && s.tokensLeidos > 0) {
      const p = (evitado / s.tokensLeidos) * 100
      uso.push(x.proporcion(p >= 10 ? String(Math.round(p)) : p.toFixed(1)))
    }
  }
  const modelos = FAMILIAS.filter(f => (s.porModelo[f] ?? 0) > 0).sort((a, b) => (s.porModelo[b] ?? 0) - (s.porModelo[a] ?? 0))
  if (modelos.length > 0) uso.push(x.porModelo(modelos.map(f => `${NOMBRE_FAMILIA[f]} ${s.porModelo[f] ?? 0}`).join(' · ')))
  const entrevistas = lineaEntrevistas(s, x)
  if (entrevistas !== undefined) uso.push(entrevistas)
  // Mejor día de la semana, con el historial diario.
  let mejor: { dia: number; tokens: number } | undefined
  for (let i = 0; i < 7; i++) {
    const dia = inicio + i * DIA
    const tokens = historial[claveDia(dia)] ?? 0
    if (tokens > 0 && (mejor === undefined || tokens > mejor.tokens)) mejor = { dia, tokens }
  }
  const dias: string[] = []
  if (mejor !== undefined) dias.push(x.mejorDia(`${DIAS[idioma][new Date(mejor.dia).getDay()]} ${new Date(mejor.dia).getDate()}`, formatearTokens(mejor.tokens)))
  if (actual && (opciones.racha ?? 0) >= 2) dias.push(x.racha(opciones.racha ?? 0))
  if (dias.length > 0) uso.push(dias.join(' · '))
  const nota = notaDe(s)
  return {
    titulo: x.titulo(fecha(inicio, idioma), fecha(inicio + 6 * DIA, idioma), actual),
    nota:
      nota === undefined
        ? undefined
        : { titulo: x.nota(nota.letra, nota.puntos), filas: nota.partes.map(p => ({ etiqueta: x.partes[p.clave], puntos: p.puntos, porque: porqueDe(p.clave, s, x) })) },
    // La semana en curso explica por qué todavía no tiene nota; una pasada sin nota no dice nada.
    notaPendiente: nota === undefined && actual ? x.notaPendiente(s.pedidos, s.mensajes) : undefined,
    ahorro: lineaAhorro,
    tipos,
    extras,
    uso,
    consejo: consejoDe(s, idioma, { sonnetPrimero: opciones.sonnetPrimero }),
  }
}

function enTexto(p: Piezas, x: Textos): string {
  const lineas: string[] = [p.titulo, '']
  if (p.nota !== undefined) {
    lineas.push(p.nota.titulo)
    const ancho = Math.max(...p.nota.filas.map(f => f.etiqueta.length))
    for (const f of p.nota.filas) lineas.push(`  ${f.etiqueta.padEnd(ancho)}  ${barra(f.puntos, 100, 10)}  ${String(f.puntos).padStart(3)}  ${f.porque}`)
    lineas.push('')
  } else if (p.notaPendiente !== undefined) {
    lineas.push(p.notaPendiente, '')
  }
  lineas.push(p.ahorro)
  if (p.tipos.length > 0) {
    const maximo = Math.max(...p.tipos.map(t => t.tokens))
    const ancho = Math.max(...p.tipos.map(t => t.etiqueta.length))
    for (const t of p.tipos) lineas.push(`  ${t.etiqueta.padEnd(ancho)}  ${barra(t.tokens, maximo, 12)}  ~${formatearTokens(t.tokens)}`)
  }
  lineas.push(...p.extras)
  if (p.uso.length > 0) lineas.push('', ...p.uso)
  lineas.push('', `${x.consejo} ${p.consejo}`)
  return lineas.join('\n')
}

/** `$` escapado: algunos visores leen `$…$` como fórmula. */
function escaparMd(texto: string): string {
  return texto.replace(/\$/g, '\\$')
}

function enMarkdown(p: Piezas, x: Textos, pie: string): string {
  const bloques: string[] = [`# ${p.titulo}`]
  if (p.nota !== undefined) {
    bloques.push(`**${p.nota.titulo}**`)
    bloques.push([`| | ${x.md.puntos} | ${x.md.porque} |`, '|---|---:|---|', ...p.nota.filas.map(f => `| ${f.etiqueta} | ${f.puntos} | ${escaparMd(f.porque)} |`)].join('\n'))
  } else if (p.notaPendiente !== undefined) {
    bloques.push(`_${escaparMd(p.notaPendiente)}_`)
  }
  bloques.push(`## ${x.md.ahorro}`, escaparMd(p.ahorro.replace(/ {2,}/g, ' ')))
  if (p.tipos.length > 0) {
    bloques.push([`| ${x.md.tipo} | ${x.md.tokens} |`, '|---|---:|', ...p.tipos.map(t => `| ${t.etiqueta} | ~${formatearTokens(t.tokens)} |`)].join('\n'))
  }
  if (p.extras.length > 0) bloques.push(p.extras.map(l => `- ${escaparMd(l)}`).join('\n'))
  if (p.uso.length > 0) bloques.push(`## ${x.md.uso}`, p.uso.map(l => `- ${escaparMd(l)}`).join('\n'))
  const consejo = p.consejo.charAt(0).toUpperCase() + p.consejo.slice(1)
  bloques.push(`## ${x.md.consejo}`, escaparMd(consejo), `_${pie}_`)
  return `${bloques.join('\n\n')}\n`
}

/**
 * La tarjeta. `lunes` es la semana a mostrar; `ms` el momento actual (para saber si está en curso).
 * En texto para el panel, o en Markdown para guardarla y compartirla.
 */
export function tarjetaSemana(semanas: Semanas, lunes: string, ms: number, historial: Historial, opciones: OpcionesTarjeta = {}): string {
  const idioma = opciones.idioma ?? 'es'
  const x = TEXTOS[idioma]
  const s = semanas[lunes]
  if (s === undefined) return x.vacia
  const p = piezas(semanas, lunes, ms, historial, s, opciones)
  return opciones.formato === 'md' ? enMarkdown(p, x, x.md.pie(fecha(msDeClave(lunes), idioma), fechaLarga(ms, idioma))) : enTexto(p, x)
}

/** El aviso corto del lunes. */
export function avisoSemana(semanas: Semanas, lunes: string, idioma: Idioma = 'es'): string {
  const x = TEXTOS[idioma]
  const s = semanas[lunes]
  const letra = s === undefined ? undefined : notaDe(s)?.letra
  const ahorro = ahorroDe(s)
  if (ahorro <= 0) return x.avisoSinAhorro(letra)
  const cambio = cambioPct(ahorro, ahorroDe(semanas[semanaAnterior(lunes)]))
  return x.aviso(formatearTokens(ahorro), cambio !== undefined ? ` (${x.vsAnterior(cambio)})` : '', letra)
}

/** Lo que responde /toki-semana md: dónde quedó el archivo, o por qué no se pudo. */
export function tarjetaGuardada(ruta: string, idioma: Idioma = 'es'): string {
  return TEXTOS[idioma].guardada(ruta)
}

export function tarjetaNoGuardada(error: string, idioma: Idioma = 'es'): string {
  return TEXTOS[idioma].noGuardada(error)
}
