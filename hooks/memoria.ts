// Memoria que sobrevive la compactación (idea de Token Optimizer):
// antes de compactar guardamos lo que no se puede perder, y después se lo
// recordamos a Claude en una nota corta. Funciones puras.

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
export function instruccionesDeCompactacion(p: PuntoDeControl): string {
  const partes: string[] = ['Conserva textualmente en el resumen:']
  if (p.tareaActual) partes.push(`- La tarea actual: ${p.tareaActual}`)
  if (p.decisiones.length > 0) partes.push(`- Estas decisiones: ${p.decisiones.map(d => `«${d}»`).join(' ')}`)
  if (p.archivosEditados.length > 0) partes.push(`- Los archivos editados: ${p.archivosEditados.join(', ')}`)
  if (p.ultimosErrores.length > 0) partes.push(`- Los últimos errores vistos: ${p.ultimosErrores.join(' | ')}`)
  partes.push('- Qué quedó pendiente y cuál era el siguiente paso.')
  return partes.join('\n')
}

/** La nota que Claude lee después de compactar. Corta: va al final del contexto. */
export function notaPostCompactacion(p: PuntoDeControl): string {
  const partes: string[] = ['[ahorro-tokens] Recordatorio guardado antes de compactar:']
  if (p.tareaActual) partes.push(`- Tarea actual: ${p.tareaActual}`)
  if (p.rama) partes.push(`- Rama: ${p.rama}`)
  if (p.decisiones.length > 0) partes.push(`- Decisiones: ${p.decisiones.join(' · ')}`)
  if (p.archivosEditados.length > 0) partes.push(`- Archivos ya editados (no los releas enteros, usa offset/limit si necesitas): ${p.archivosEditados.join(', ')}`)
  if (p.comandosRecientes.length > 0) partes.push(`- Últimos comandos: ${p.comandosRecientes.join(' · ')}`)
  if (p.ultimosErrores.length > 0) partes.push(`- Últimos errores: ${p.ultimosErrores.join(' | ')}`)
  partes.push('Sigue con la tarea donde quedó; no vuelvas a explorar lo ya hecho.')
  return partes.join('\n')
}

export function vacio(cuando: number): PuntoDeControl {
  return { cuando, tareaActual: '', archivosEditados: [], comandosRecientes: [], ultimosErrores: [], decisiones: [] }
}

export function resumenCorto(p: PuntoDeControl): string {
  const partes: string[] = []
  if (p.archivosEditados.length > 0) partes.push(`${p.archivosEditados.length} archivos`)
  if (p.decisiones.length > 0) partes.push(`${p.decisiones.length} decisiones`)
  if (p.ultimosErrores.length > 0) partes.push(`${p.ultimosErrores.length} errores`)
  return partes.length > 0 ? partes.join(', ') : 'la tarea actual'
}

// ---------- Diagnóstico: por qué sí o por qué no se compactó ----------

export type Decision = {
  comando: string
  resultado: 'compactado' | 'sin-cambio'
  motivo: string
  ahorro?: number
}

export const MOTIVOS = {
  familia: 'el comando no es de una familia ruidosa (tests, builds, instalaciones, linters, logs)',
  filtrado: 'la salida ya venía filtrada (| tail, | grep, | head…)',
  lector: 'es un comando de lectura de contenido exacto (cat, git diff, sed…)',
  corta: 'la salida era corta: no valía la pena compactarla',
  pocoAhorro: 'compactarla ahorraría menos del 30%',
  segundoPlano: 'el comando corrió en segundo plano o fue interrumpido',
  archivar: 'no se pudo guardar el original, así que no se tocó la salida',
  apagado: 'la compactación está apagada en la configuración',
} as const

export function registrarDecision(lista: Decision[], d: Decision): Decision[] {
  return [...lista, d].slice(-12)
}
