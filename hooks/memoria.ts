// Memoria que sobrevive la compactación (idea de Token Optimizer):
// antes de compactar guardamos lo que no se puede perder, y después se lo
// recordamos a Claude en una nota corta. Funciones puras.

import { t } from './idioma'
import type { Idioma } from './idioma'

export type PuntoDeControl = {
  cuando: number
  tareaActual: string
  rama?: string
  archivosEditados: string[]
  comandosRecientes: string[]
  ultimosErrores: string[]
  decisiones: string[]
}

export const LIMITES_MEMORIA = { archivos: 15, comandos: 8, errores: 5, decisiones: 8, tarea: 400 } as const

/** Mantiene una lista corta, sin repetidos, con lo más reciente al final. */
export function recordar(lista: string[], item: string, maximo: number): string[] {
  const limpio = item.trim()
  if (limpio === '') return lista
  return [...lista.filter(x => x !== limpio), limpio].slice(-maximo)
}

const DECISION = /\b(decid\w+|vamos a usar|usaremos|optamos|acordamos|se queda con|elegimos|la opción elegida|en lugar de|no vamos a|descartamos|mantenemos|we decided|we'll use|going with|instead of)\b/i

/** Extrae frases que parecen decisiones de una respuesta del asistente. */
export function extraerDecisiones(texto: string): string[] {
  const frases = texto
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?\n])\s+/)
    .map(f => f.replace(/^[\s\-*#>•]+/, '').trim())
  return frases.filter(f => f.length >= 25 && f.length <= 220 && DECISION.test(f)).slice(0, 3)
}

/** Primera línea de error útil en la salida de un comando. */
export function primerError(texto: string): string | undefined {
  const linea = texto.split('\n').find(l => /\b(error|exception|failed|fatal|panic|assert)/i.test(l) && !/^\s*at\s/.test(l))
  return linea === undefined ? undefined : linea.trim().slice(0, 200)
}

/** Las instrucciones que se agregan al resumen de la compactación. */
export function instruccionesDeCompactacion(p: PuntoDeControl, idioma: Idioma = 'es'): string {
  const x = t(idioma).instrucciones
  const partes: string[] = [x.titulo]
  if (p.tareaActual) partes.push(`- ${x.tarea}: ${p.tareaActual}`)
  if (p.decisiones.length > 0) partes.push(`- ${x.decisiones}: ${p.decisiones.map(d => `«${d}»`).join(' ')}`)
  if (p.archivosEditados.length > 0) partes.push(`- ${x.archivos}: ${p.archivosEditados.join(', ')}`)
  if (p.ultimosErrores.length > 0) partes.push(`- ${x.errores}: ${p.ultimosErrores.join(' | ')}`)
  partes.push(`- ${x.pendiente}`)
  return partes.join('\n')
}

/** La nota que Claude lee después de compactar. Corta: va al final del contexto. */
export function notaPostCompactacion(p: PuntoDeControl, idioma: Idioma = 'es'): string {
  const x = t(idioma).notaPost
  const partes: string[] = [x.titulo]
  if (p.tareaActual) partes.push(`- ${x.tarea}: ${p.tareaActual}`)
  if (p.rama) partes.push(`- ${x.rama}: ${p.rama}`)
  if (p.decisiones.length > 0) partes.push(`- ${x.decisiones}: ${p.decisiones.join(' · ')}`)
  if (p.archivosEditados.length > 0) partes.push(`- ${x.archivos}: ${p.archivosEditados.join(', ')}`)
  if (p.comandosRecientes.length > 0) partes.push(`- ${x.comandos}: ${p.comandosRecientes.join(' · ')}`)
  if (p.ultimosErrores.length > 0) partes.push(`- ${x.errores}: ${p.ultimosErrores.join(' | ')}`)
  partes.push(x.cierre)
  return partes.join('\n')
}

/** Sin nada que recordar: no vale la pena gastar tokens en una nota. */
export function estaVacia(p: PuntoDeControl): boolean {
  return p.tareaActual === '' && p.archivosEditados.length === 0 && p.comandosRecientes.length === 0 && p.ultimosErrores.length === 0 && p.decisiones.length === 0
}

export function vacio(cuando: number): PuntoDeControl {
  return { cuando, tareaActual: '', archivosEditados: [], comandosRecientes: [], ultimosErrores: [], decisiones: [] }
}

export function resumenCorto(p: PuntoDeControl, idioma: Idioma = 'es'): string {
  const x = t(idioma).resumenMemoria
  const partes: string[] = []
  if (p.archivosEditados.length > 0) partes.push(x.archivos(p.archivosEditados.length))
  if (p.decisiones.length > 0) partes.push(x.decisiones(p.decisiones.length))
  if (p.ultimosErrores.length > 0) partes.push(x.errores(p.ultimosErrores.length))
  return partes.length > 0 ? partes.join(', ') : x.tarea
}

// ---------- Diagnóstico: por qué sí o por qué no se compactó ----------

export type Decision = {
  comando: string
  resultado: 'compactado' | 'sin-cambio' | 'rescatado'
  motivo: string
  ahorro?: number
}

export type Motivo = 'familia' | 'filtrado' | 'lector' | 'corta' | 'pocoAhorro' | 'segundoPlano' | 'archivar' | 'apagado' | 'formato'

export function motivo(clave: Motivo, idioma: Idioma = 'es'): string {
  return t(idioma).motivos[clave]
}

export function registrarDecision(lista: Decision[], d: Decision): Decision[] {
  return [...lista, d].slice(-12)
}
