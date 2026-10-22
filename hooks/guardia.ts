/**
 * Dos guardias antes de mandar un mensaje:
 *
 * 1. Caché frío. Si pasó más que la vida del caché (1 h con suscripción, 5 min
 *    en la API), el próximo mensaje reescribe TODO el contexto a precio de
 *    escritura en vez de releerlo a 1/10. Con 200k de contexto eso es como
 *    varios mensajes normales de golpe. Justo ahí compactar o empezar en limpio
 *    sale casi gratis: el caché ya se perdió.
 *
 * 2. Límites. Con la velocidad a la que vas gastando la ventana de 5 h o la
 *    semanal, ¿se acaba antes de renovarse? Si sí, avisa una vez; cerca del
 *    tope (90 %), pregunta si seguir en modo ahorro.
 *
 * Todo aquí es puro: sin `$`, para probarlo sin Claude Code.
 */

import type { Idioma } from './idioma'
import { costoMensaje, PEDIDOS_POR_NIVEL, precio, usd } from './modelo'
import type { Familia } from './modelo'

// ---------- Caché frío ----------

export const FRIO = {
  /** Con menos contexto que esto reescribir no pesa: ni se pregunta. */
  minContexto: 60_000,
  /** Desde aquí compactar gana claramente: es la opción con ★. */
  compactarDesde: 120_000,
  /** Lo que queda después de compactar (resumen + lo que se conserva). Aproximado. */
  trasCompactar: 30_000,
  /** "Enviar así" tantas veces: Toki deja de preguntar en esta sesión. */
  maxRechazos: 2,
} as const

export type Frio = {
  contexto: number
  /** Minutos desde la última vez que algo usó el caché. */
  minutos: number
  /** Lo que cuesta de más reescribir el contexto, frente a releerlo con el caché vivo. */
  extraUsd: number
  /** Ese extra, en mensajes normales (lo que importa con una suscripción). */
  mensajes: number
  /** Cuánto más barato sale cada mensaje después de compactar, en %. */
  despuesPct: number
  recomendada: 'compactar' | 'enviar'
}

export function evaluarCacheFrio(a: {
  ahora: number
  ultimoUsoCache: number
  ttlMin: number
  contexto: number
  familia: Familia
  ttl1h: boolean
}): Frio | undefined {
  if (a.ultimoUsoCache <= 0 || a.contexto < FRIO.minContexto) return undefined
  const pasado = a.ahora - a.ultimoUsoCache
  if (pasado <= a.ttlMin * 60_000) return undefined
  const p = precio(a.familia, a.contexto)
  const escritura = a.ttl1h ? p.escritura1h : p.escritura5m
  const extraUsd = (a.contexto * (escritura - p.lectura)) / 1_000_000
  const base = { familia: a.familia, esfuerzo: 'medium' as const, pedidos: PEDIDOS_POR_NIVEL.normal, cambiaModelo: false, ttl1h: a.ttl1h }
  const normal = costoMensaje({ ...base, contexto: a.contexto }).usd
  const despues = costoMensaje({ ...base, contexto: FRIO.trasCompactar }).usd
  return {
    contexto: a.contexto,
    minutos: Math.round(pasado / 60_000),
    extraUsd,
    mensajes: Math.max(1, Math.round(extraUsd / normal)),
    despuesPct: Math.max(0, Math.round((1 - despues / normal) * 100)),
    recomendada: a.contexto >= FRIO.compactarDesde ? 'compactar' : 'enviar',
  }
}

export type OpcionFrio = 'enviar' | 'compactar' | 'limpio'

/** Las etiquetas del diálogo, la recomendada primero y con ★. */
export function opcionesFrio(f: Frio, x: TextosGuardia): { tipo: OpcionFrio; etiqueta: string }[] {
  const compactar = { tipo: 'compactar' as const, etiqueta: x.frio.compactar(f.despuesPct) }
  const enviar = { tipo: 'enviar' as const, etiqueta: x.frio.enviar }
  const limpio = { tipo: 'limpio' as const, etiqueta: x.frio.limpio }
  const orden = f.recomendada === 'compactar' ? [compactar, enviar, limpio] : [enviar, compactar, limpio]
  return orden.map((o, i) => (i === 0 ? { ...o, etiqueta: `${o.etiqueta} ★` } : o))
}

export function preguntaFrio(f: Frio, esSuscripcion: boolean, x: TextosGuardia): string {
  return x.frio.pregunta(f.minutos, k(f.contexto), esSuscripcion ? x.frio.enMensajes(f.mensajes) : x.frio.enDolares(usd(f.extraUsd)))
}

// ---------- Límites ----------

export type VentanaLimite = 'five_hour' | 'seven_day'
export const VENTANAS: readonly VentanaLimite[] = ['five_hour', 'seven_day']
export const DURACION: Record<VentanaLimite, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 24 * 3_600_000 }
/** Desde aquí, si a este ritmo se acaba antes de renovarse, Toki avisa. */
export const UMBRAL_AVISO: Record<VentanaLimite, number> = { five_hour: 50, seven_day: 30 }
/** Desde aquí Toki pregunta antes de mandar si seguir en modo ahorro. */
export const UMBRAL_CRITICO = 90

const MIN = 60_000
/** Para el ritmo reciente (solo 5 h): muestras de los últimos 45 min, con al menos 10 min y 1 punto de diferencia. */
const RECIENTE = { ventana: 45 * MIN, minimo: 10 * MIN, puntos: 1 }

export type Muestra = { t: number; pct: number }

/** Guarda una muestra nueva solo si el % cambió; descarta las de otra ventana y las viejas. */
export function agregarMuestra(lista: readonly Muestra[], m: Muestra, inicioVentana: number): Muestra[] {
  const vigentes = lista.filter(s => s.t >= inicioVentana && s.pct <= m.pct)
  const ultima = vigentes[vigentes.length - 1]
  if (ultima !== undefined && ultima.pct === m.pct) return vigentes
  return [...vigentes, m].slice(-60)
}

export type Proyeccion = {
  ventana: VentanaLimite
  pct: number
  reinicia: number
  /** Cuándo llegaría al 100 % a este ritmo (sin ritmo: undefined). */
  agotaEn?: number
  /** Puntos por hora. */
  ritmoHora: number
  /** Se acaba antes de renovarse y ya va por encima del umbral: vale un aviso. */
  avisar: boolean
  critico: boolean
}

export function proyectar(a: { ventana: VentanaLimite; pct: number; reinicia: number; ahora: number; muestras: readonly Muestra[] }): Proyeccion | undefined {
  if (!(a.reinicia > a.ahora)) return undefined
  const inicio = a.reinicia - DURACION[a.ventana]
  let ritmo = a.pct / Math.max(a.ahora - inicio, 10 * MIN)
  if (a.ventana === 'five_hour') {
    const base = a.muestras.find(s => s.t >= inicio && a.ahora - s.t <= RECIENTE.ventana && a.ahora - s.t >= RECIENTE.minimo && a.pct - s.pct >= RECIENTE.puntos)
    if (base !== undefined) ritmo = (a.pct - base.pct) / (a.ahora - base.t)
  }
  const agotaEn = ritmo > 0 && a.pct < 100 ? a.ahora + (100 - a.pct) / ritmo : undefined
  const antes = agotaEn !== undefined && agotaEn < a.reinicia
  return {
    ventana: a.ventana,
    pct: a.pct,
    reinicia: a.reinicia,
    agotaEn: antes ? agotaEn : undefined,
    ritmoHora: Math.round(ritmo * 3_600_000 * 10) / 10,
    avisar: antes && a.pct >= UMBRAL_AVISO[a.ventana] && a.pct < 100,
    critico: a.pct >= UMBRAL_CRITICO,
  }
}

/** Una clave por ventana: cada aviso sale una vez por ventana, no una por mensaje. */
export function claveVentana(v: VentanaLimite, reinicia: number): string {
  return `${v}:${Math.round(reinicia / MIN)}`
}

export function formatearHora(ms: number, idioma: Idioma, conDia: boolean): string {
  const locale = idioma === 'es' ? 'es' : 'en-US'
  try {
    return new Date(ms).toLocaleString(locale, conDia ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { hour: 'numeric', minute: '2-digit' })
  } catch {
    const d = new Date(ms)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}

export function hora(ms: number, v: VentanaLimite, idioma: Idioma): string {
  return formatearHora(ms, idioma, v === 'seven_day')
}

function k(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1_000)}k`
}

// ---------- Textos ----------

export type OpcionLimite = 'ahorro' | 'seguir' | 'esperar'

export type TextosGuardia = {
  frio: {
    pregunta: (min: number, tokens: string, costo: string) => string
    enMensajes: (n: number) => string
    enDolares: (usd: string) => string
    compactar: (pct: number) => string
    enviar: string
    limpio: string
    compactando: string
    noCompacto: string
    limpiando: string
    pulsaEnter: string
    devuelto: string
    callado: string
    notaTitulo: string
  }
  limite: {
    nombre: Record<VentanaLimite, string>
    seAcaba: (hora: string) => string
    aviso: (nombre: string, hora: string, renueva: string) => string
    pregunta: (pct: number, nombre: string, renueva: string) => string
    opcion: Record<OpcionLimite, string>
    modoAhorro: (hora: string) => string
    enAhorro: (hora: string) => string
    esperando: string
  }
}

export const textosGuardia: Record<Idioma, TextosGuardia> = {
  es: {
    frio: {
      pregunta: (min, tokens, costo) => `Tu caché venció (pasaron ${min} min). Este mensaje reescribe ${tokens} de contexto: ${costo}. Compactar ahora casi no cuesta más.`,
      enMensajes: n => `cuenta como ~${n} ${n === 1 ? 'mensaje normal' : 'mensajes normales'} de tu límite`,
      enDolares: u => `≈${u} más que con el caché vivo`,
      compactar: pct => `Compactar y enviar (después, cada mensaje ~${pct}% más barato)`,
      enviar: 'Enviar así',
      limpio: 'Empezar en limpio (/clear, te devuelvo el mensaje con un resumen)',
      compactando: 'Toki: compacto y envío tu mensaje enseguida…',
      noCompacto: 'Toki: no pude compactar ahora; tu mensaje quedó en el cuadro.',
      limpiando: 'Toki: limpiando la conversación. Tu mensaje vuelve al cuadro con un resumen.',
      pulsaEnter: 'Toki: pulsa Enter para limpiar; después te devuelvo el mensaje.',
      devuelto: 'Toki: tu mensaje está en el cuadro, con lo importante de antes. Revísalo y envíalo.',
      callado: 'Toki: no te pregunto más por el caché vencido en esta sesión.',
      notaTitulo: '[Toki] Lo importante de la conversación anterior:',
    },
    limite: {
      nombre: { five_hour: '5 h', seven_day: 'la semana' },
      seAcaba: h => `se acaba ~${h}`,
      aviso: (n, h, r) => `Toki: a este ritmo tu límite de ${n} se acaba ~${h}, antes de renovarse (${r}). Menos esfuerzo en lo simple y /compact ayudan.`,
      pregunta: (pct, n, r) => `Llevas ${pct}% de tu límite de ${n} (se renueva ${r}). ¿Cómo sigo?`,
      opcion: {
        ahorro: 'Modo ahorro hasta que se renueve (Sonnet si se puede, menos esfuerzo)',
        seguir: 'Seguir igual',
        esperar: 'Esperar (tu mensaje queda en el cuadro)',
      },
      modoAhorro: h => `Toki: modo ahorro hasta ${h}. /toki-modelo preguntar lo quita.`,
      enAhorro: h => `Modo ahorro por límite hasta ${h} (/toki-modelo preguntar lo quita)`,
      esperando: 'Toki: tu mensaje quedó en el cuadro. Envíalo cuando se renueve el límite.',
    },
  },
  en: {
    frio: {
      pregunta: (min, tokens, costo) => `Your cache expired (${min} min ago). This message rewrites ${tokens} of context: ${costo}. Compacting now costs barely more.`,
      enMensajes: n => `about ${n} normal ${n === 1 ? 'message' : 'messages'} of your limit`,
      enDolares: u => `≈${u} more than with a live cache`,
      compactar: pct => `Compact and send (then each message ~${pct}% cheaper)`,
      enviar: 'Send as is',
      limpio: 'Start fresh (/clear, I give your message back with a summary)',
      compactando: 'Toki: compacting, then sending your message…',
      noCompacto: "Toki: couldn't compact right now; your message is back in the box.",
      limpiando: 'Toki: clearing the conversation. Your message comes back to the box with a summary.',
      pulsaEnter: "Toki: press Enter to clear; then I'll give your message back.",
      devuelto: "Toki: your message is in the box, with what mattered before. Review it and send it.",
      callado: "Toki: I won't ask about expired caches again this session.",
      notaTitulo: '[Toki] What mattered in the previous conversation:',
    },
    limite: {
      nombre: { five_hour: '5-hour', seven_day: 'weekly' },
      seAcaba: h => `runs out ~${h}`,
      aviso: (n, h, r) => `Toki: at this pace your ${n} limit runs out ~${h}, before it resets (${r}). Less effort on simple things and /compact help.`,
      pregunta: (pct, n, r) => `You've used ${pct}% of your ${n} limit (resets ${r}). How should I go on?`,
      opcion: {
        ahorro: 'Saving mode until it resets (Sonnet when possible, less effort)',
        seguir: 'Keep going as is',
        esperar: 'Wait (your message stays in the box)',
      },
      modoAhorro: h => `Toki: saving mode until ${h}. /toki-modelo preguntar turns it off.`,
      enAhorro: h => `Saving mode for your limit until ${h} (/toki-modelo preguntar turns it off)`,
      esperando: 'Toki: your message stayed in the box. Send it when your limit resets.',
    },
  },
}
