// Presupuesto por tarea: un tope en dólares o en tokens para lo que estás haciendo ahora.
// Avisa al 50 % y al 80 %; al pasarlo, pregunta antes del siguiente mensaje. Lógica pura.

import type { Idioma } from './idioma'
import { formatearTokens } from './mascota'

export type Unidad = 'usd' | 'tokens'

export type Presupuesto = {
  unidad: Unidad
  limite: number
  /** Lo gastado (USD o tokens de la sesión) cuando se fijó: se cuenta desde ahí. */
  base: number
  /** Umbrales ya avisados (50, 80, 100). */
  avisados: number[]
  /** Ya se preguntó al pasarlo. */
  preguntado: boolean
  /** Elegiste seguir en modo ahorro. */
  ahorro: boolean
}

export type Orden = { tipo: 'fijar'; unidad: Unidad; limite: number } | { tipo: 'quitar' } | { tipo: 'estado' } | { tipo: 'invalida' }

export const UMBRALES = [50, 80, 100]

/** `$2`, `2usd`, `1,5 dólares` → USD; `300k`, `1.5M`, `200000`, `200k tokens` → tokens. */
export function leerOrden(arg: string): Orden {
  const a = arg.trim().toLowerCase()
  if (a === '') return { tipo: 'estado' }
  if (/^(quitar|quita|borrar|no|off|ninguno|nada|remove|clear|none)$/.test(a)) return { tipo: 'quitar' }
  const m = /^(\$|us\$|usd)?\s*(\d+(?:[.,]\d+)?)\s*(\$|usd|us\$|d[oó]lar(?:es)?|dollars?|k|m|mil|tokens?)?\s*(tokens?)?$/.exec(a)
  if (m === null) return { tipo: 'invalida' }
  const n = Number((m[2] ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return { tipo: 'invalida' }
  const sufijo = m[3] ?? ''
  if (m[1] !== undefined || /^(\$|usd|us\$|d[oó]lar|dollar)/.test(sufijo)) return { tipo: 'fijar', unidad: 'usd', limite: n }
  const multiplicador = sufijo === 'k' || sufijo === 'mil' ? 1_000 : sufijo === 'm' ? 1_000_000 : 1
  const tokens = Math.round(n * multiplicador)
  // "5" a secas es más probable que sean dólares que 5 tokens.
  if (multiplicador === 1 && m[4] === undefined && !/^tokens?$/.test(sufijo) && tokens < 1_000) return { tipo: 'fijar', unidad: 'usd', limite: n }
  if (tokens < 1_000) return { tipo: 'invalida' }
  return { tipo: 'fijar', unidad: 'tokens', limite: tokens }
}

export function nuevoPresupuesto(unidad: Unidad, limite: number, base: number): Presupuesto {
  return { unidad, limite, base, avisados: [], preguntado: false, ahorro: false }
}

export function gastado(p: Presupuesto, actual: number): number {
  return Math.max(0, actual - p.base)
}

export function porcentaje(p: Presupuesto, actual: number): number {
  return p.limite > 0 ? Math.round((gastado(p, actual) / p.limite) * 100) : 0
}

/** El umbral más alto recién cruzado (y no avisado), o undefined. */
export function umbralCruzado(p: Presupuesto, actual: number): number | undefined {
  const pct = porcentaje(p, actual)
  const cruzados = UMBRALES.filter(u => pct >= u && !p.avisados.includes(u))
  return cruzados.length > 0 ? Math.max(...cruzados) : undefined
}

/** Marca como avisados todos los umbrales hasta `u`: si saltas del 40 al 90 %, un solo aviso. */
export function marcarAvisado(p: Presupuesto, u: number): Presupuesto {
  return { ...p, avisados: [...new Set([...p.avisados, ...UMBRALES.filter(x => x <= u)])] }
}

/** Subir el tope un 50 % desde lo gastado: el aviso del 100 % vuelve a valer para el nuevo tope. */
export function subir(p: Presupuesto, actual: number): Presupuesto {
  const nuevo = Math.max(p.limite * 1.5, gastado(p, actual) * 1.5)
  const limite = p.unidad === 'usd' ? Math.ceil(nuevo * 100 - 1e-6) / 100 : Math.ceil(nuevo / 1_000) * 1_000
  const pct = Math.round((gastado(p, actual) / limite) * 100)
  return { ...p, limite, preguntado: false, avisados: UMBRALES.filter(u => u <= pct) }
}

export function formatear(unidad: Unidad, valor: number): string {
  return unidad === 'usd' ? `$${valor < 10 ? valor.toFixed(2) : valor.toFixed(1)}` : `${formatearTokens(valor)} tokens`
}

export type TipoOpcionPresupuesto = 'ahorro' | 'subir' | 'parar' | 'quitar'

const TEXTOS = {
  es: {
    fijado: (limite: string, unidad: Unidad, suscripcion: boolean) =>
      `Toki: presupuesto de ${limite} para esta tarea. Te aviso al 50 % y al 80 %, y antes de seguir si lo pasas. Se borra con /clear o con /toki-presupuesto quitar.${
        unidad === 'usd' && suscripcion ? ' Con suscripción el costo es una estimación: en tokens (p. ej. /toki-presupuesto 2M) es más fiel.' : ''
      }`,
    sinCosto: 'Toki: Claude Code todavía no informa el costo de esta sesión. Prueba con tokens, p. ej. /toki-presupuesto 2M.',
    quitado: 'Toki: quité el presupuesto de esta tarea.',
    ninguno: 'Toki: no hay presupuesto para esta tarea. Fíjalo con /toki-presupuesto $2 o /toki-presupuesto 2M (tokens).',
    invalida: 'Toki: no entendí la cantidad. Ejemplos: /toki-presupuesto $2 · /toki-presupuesto 500k · /toki-presupuesto quitar',
    estado: (g: string, limite: string, pct: number, ahorro: boolean) => `Toki: esta tarea va en ${g} de ${limite} (${pct} %).${ahorro ? ' Sigue en modo ahorro.' : ''}`,
    aviso: (pct: number, g: string, limite: string) => `Toki: esta tarea ya usó el ${pct} % de su presupuesto (${g} de ${limite}).`,
    pasado: (g: string, limite: string) => `Toki: esta tarea pasó su presupuesto (${g} de ${limite}). Antes de tu próximo mensaje te pregunto qué hacer.`,
    pregunta: (g: string, limite: string) => `Esta tarea ya usó ${g} y su presupuesto era ${limite}. ¿Cómo sigo?`,
    opcion: {
      ahorro: 'Seguir en modo ahorro (modelo y esfuerzo más baratos) ★',
      subir: (nuevo: string) => `Subir el presupuesto a ${nuevo} y seguir`,
      parar: 'Parar aquí (tu mensaje vuelve al cuadro)',
      quitar: 'Seguir sin presupuesto',
    },
    parado: 'Toki: paré antes de enviar. Tu mensaje está en el cuadro: un /clear o /compact antes de seguir abarata lo que viene.',
    enAhorro: 'Toki: sigo en modo ahorro hasta que termine la tarea (/clear) o quites el presupuesto.',
    subido: (nuevo: string) => `Toki: presupuesto subido a ${nuevo}.`,
    cmd: 'Toki: presupuesto para esta tarea ($ o tokens)',
    pista: '$2 | 500k | quitar',
    chip: (pct: number) => `tope ${pct}%`,
  },
  en: {
    fijado: (limite: string, unidad: Unidad, suscripcion: boolean) =>
      `Toki: ${limite} budget for this task. I'll tell you at 50% and 80%, and ask before going on if you pass it. /clear or /toki-presupuesto off removes it.${
        unidad === 'usd' && suscripcion ? ' On a subscription the cost is an estimate: tokens (e.g. /toki-presupuesto 2M) are more accurate.' : ''
      }`,
    sinCosto: "Toki: Claude Code isn't reporting this session's cost yet. Try tokens, e.g. /toki-presupuesto 2M.",
    quitado: 'Toki: removed the budget for this task.',
    ninguno: 'Toki: no budget for this task. Set one with /toki-presupuesto $2 or /toki-presupuesto 2M (tokens).',
    invalida: "Toki: I didn't get the amount. Examples: /toki-presupuesto $2 · /toki-presupuesto 500k · /toki-presupuesto off",
    estado: (g: string, limite: string, pct: number, ahorro: boolean) => `Toki: this task is at ${g} of ${limite} (${pct}%).${ahorro ? ' Still in saving mode.' : ''}`,
    aviso: (pct: number, g: string, limite: string) => `Toki: this task has used ${pct}% of its budget (${g} of ${limite}).`,
    pasado: (g: string, limite: string) => `Toki: this task went over its budget (${g} of ${limite}). I'll ask what to do before your next message.`,
    pregunta: (g: string, limite: string) => `This task has used ${g} and its budget was ${limite}. How should I go on?`,
    opcion: {
      ahorro: 'Go on in saving mode (cheaper model and effort) ★',
      subir: (nuevo: string) => `Raise the budget to ${nuevo} and go on`,
      parar: 'Stop here (your message goes back to the box)',
      quitar: 'Go on without a budget',
    },
    parado: 'Toki: stopped before sending. Your message is back in the box: a /clear or /compact first makes what comes next cheaper.',
    enAhorro: "Toki: staying in saving mode until the task ends (/clear) or you remove the budget.",
    subido: (nuevo: string) => `Toki: budget raised to ${nuevo}.`,
    cmd: 'Toki: budget for this task ($ or tokens)',
    pista: '$2 | 500k | off',
    chip: (pct: number) => `cap ${pct}%`,
  },
}

export type TextosPresupuesto = (typeof TEXTOS)['es']

export function textosPresupuesto(idioma: Idioma): TextosPresupuesto {
  return TEXTOS[idioma]
}
