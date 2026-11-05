/**
 * Preguntas justo a tiempo: cuando una respuesta tuya cambia lo que Claude hace, Toki te
 * pregunta con el diálogo de Claude Code (cero tokens) en vez de darte un consejo:
 * (a) dónde buscar, (b) cómo sabremos que quedó, (c) cómo seguir tras dos correcciones,
 * (d) separar un mensaje que trae varias tareas y (e) qué no olvidar al compactar. Además,
 * el criterio de listo que la entrevista guarda en spec.md se propone como /goal.
 *
 * La detección va aparte y sin el modelo (es lo que funciona, según Ask or Assume), y cada
 * pregunta se calla tras dos rechazos seguidos: el exceso de preguntas cansa.
 *
 * Todo aquí es puro: sin `$`, para probarlo sin Claude Code.
 */

import { CONTEXTO_PARA_LIMPIAR, RUTA_SPEC, diceComoComprobar, esCorreccion, esDiagnostico, esProyectoNuevo, nombraLugar, palabrasDe, pideCambio } from './entrevista'
import type { Idioma } from './idioma'
import { CARPETAS_IGNORADAS } from './mapa'
import { limpiarPrompt, type Nivel } from './modelo'
import { conAcentos } from './palabras'

export type TipoPregunta = 'donde' | 'listo' | 'fallos' | 'tareas' | 'recordar' | 'goal'
export const TIPOS_PREGUNTA: readonly TipoPregunta[] = ['donde', 'listo', 'fallos', 'tareas', 'recordar', 'goal']

/** Dos «no» seguidos a la misma pregunta y Toki deja de hacerla (vuelve con /toki-entrevista auto). */
export const RECHAZOS_PARA_CALLAR = 2

export type EstadoPreguntas = Partial<Record<TipoPregunta, { rechazos: number; callada?: true }>>

export function leerEstadoPreguntas(v: unknown): EstadoPreguntas {
  if (v === null || typeof v !== 'object') return {}
  const salida: EstadoPreguntas = {}
  for (const tipo of TIPOS_PREGUNTA) {
    const r = (v as Record<string, unknown>)[tipo]
    if (r === null || typeof r !== 'object') continue
    const n = Number((r as { rechazos?: unknown }).rechazos)
    salida[tipo] = { rechazos: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, ...((r as { callada?: unknown }).callada === true ? { callada: true as const } : {}) }
  }
  return salida
}

export function estaCallada(estado: EstadoPreguntas, tipo: TipoPregunta): boolean {
  return estado[tipo]?.callada === true
}

/** Un sí reinicia la cuenta; dos «no» seguidos callan esa pregunta. */
export function contarRespuesta(estado: EstadoPreguntas, tipo: TipoPregunta, aceptada: boolean): { estado: EstadoPreguntas; seCallo: boolean } {
  if (aceptada) return { estado: { ...estado, [tipo]: { rechazos: 0 } }, seCallo: false }
  const antes = estado[tipo]
  const rechazos = (antes?.rechazos ?? 0) + 1
  const callada = rechazos >= RECHAZOS_PARA_CALLAR
  return { estado: { ...estado, [tipo]: callada ? { rechazos, callada: true } : { rechazos } }, seCallo: callada && antes?.callada !== true }
}

export type Lectura = { texto: string; nivel: Nivel; motivo: string }

// ---------- (a) Dónde buscar ----------

/** Con menos carpetas que estas, buscar sale barato: no vale la pena preguntar. */
export const CARPETAS_PARA_PREGUNTAR = 3

export type Carpeta = { ruta: string; peso: number }

/** Lo que marca la raíz de un proyecto (y no tu carpeta personal): git o el archivo de su gestor. */
const MARCAS_DE_PROYECTO = new Set(['.git', 'package.json', 'pyproject.toml', 'setup.py', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile', 'mix.exs', 'Package.swift', 'deno.json', 'deno.jsonc', 'Makefile', 'CMakeLists.txt'])

export function esRaizDeProyecto(nombres: readonly string[]): boolean {
  return nombres.some(n => MARCAS_DE_PROYECTO.has(n) || /\.(sln|csproj|fsproj)$/i.test(n))
}

/** Una carpeta donde puede estar lo que pides: ni dependencias, ni builds, ni ocultas. */
export function esCarpetaDeBusqueda(nombre: string): boolean {
  return !CARPETAS_IGNORADAS.has(nombre) && !nombre.startsWith('.')
}

/** Algo nuevo que obliga a buscar: cambiar o averiguar algo sin decir dónde. */
export function pideDonde(e: Lectura & { nueva: boolean }): boolean {
  if (!e.nueva || e.nivel === 'trivial' || e.motivo === 'seguimiento' || esCorreccion(e.texto)) return false
  if (palabrasDe(e.texto) < 8 || nombraLugar(e.texto) || esProyectoNuevo(e.texto)) return false
  return pideCambio(e.texto) || esDiagnostico(e.texto)
}

function normal(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Las carpetas que más pesan, primero las que el mensaje nombra. */
export function opcionesDonde(carpetas: readonly Carpeta[], texto: string, max = 3): string[] {
  const palabras = limpiarPrompt(texto).split(/[^\p{L}\p{N}]+/u).map(normal).filter(w => w.length >= 3)
  const nombra = (c: Carpeta): number => (c.ruta.split('/').some(p => {
    const q = normal(p)
    return q.length >= 3 && palabras.some(w => q.startsWith(w) || w.startsWith(q))
  }) ? 1 : 0)
  return [...carpetas]
    .sort((a, b) => nombra(b) - nombra(a) || b.peso - a.peso || a.ruta.localeCompare(b.ruta))
    .slice(0, max)
    .map(c => `${c.ruta}/`)
}

// ---------- (b) Cómo sabremos que quedó ----------

/** Un cambio que no dice cómo se comprueba. */
export function pideListo(e: Lectura): boolean {
  if (e.nivel === 'trivial' || e.motivo === 'seguimiento' || esCorreccion(e.texto)) return false
  return palabrasDe(e.texto) >= 10 && pideCambio(e.texto) && !diceComoComprobar(e.texto)
}

/** Los archivos de la raíz que dicen cómo se comprueba un proyecto: Toki lee estos y nada más. */
export const ARCHIVOS_DE_COMPROBACION = ['package.json', 'Makefile', 'makefile', 'GNUmakefile', 'justfile', 'pyproject.toml', 'setup.cfg', 'tox.ini', 'composer.json', 'deno.json'] as const

function json(texto: string | undefined): Record<string, unknown> | undefined {
  if (texto === undefined) return undefined
  try {
    const v: unknown = JSON.parse(texto)
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function texto(v: unknown, clave: string): string | undefined {
  const o = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[clave] : undefined
  return typeof o === 'string' && o.trim() !== '' ? o : undefined
}

/**
 * Lo que el proyecto ya sabe correr para comprobarse (pruebas, tipos, lint, build), según
 * sus propios archivos: `nombres` es lo que hay en la raíz y `leer` da los de
 * ARCHIVOS_DE_COMPROBACION. Nada se inventa: sin esos archivos, no hay opciones.
 */
export function comprobacionesDe(nombres: readonly string[], leer: (nombre: string) => string | undefined): string[] {
  const hay = new Set(nombres)
  const salida: string[] = []
  const scripts = json(leer('package.json'))?.['scripts']
  if (scripts !== undefined) {
    const gestor = hay.has('bun.lockb') || hay.has('bun.lock') ? 'bun' : hay.has('pnpm-lock.yaml') ? 'pnpm' : hay.has('yarn.lock') ? 'yarn' : 'npm'
    for (const s of ['test', 'typecheck', 'check', 'lint', 'build']) {
      const c = texto(scripts, s)
      if (c === undefined || /no test specified/i.test(c)) continue
      salida.push(s === 'test' ? `${gestor} test` : `${gestor} run ${s}`)
    }
  }
  const make = leer('Makefile') ?? leer('makefile') ?? leer('GNUmakefile')
  for (const t of ['test', 'check', 'lint']) if (make !== undefined && new RegExp(`^${t}\\s*:(?!=)`, 'm').test(make)) salida.push(`make ${t}`)
  if (/^test\b[^\n:=]*:(?!=)/m.test(leer('justfile') ?? '')) salida.push('just test')
  const pytest = ['pyproject.toml', 'setup.cfg', 'tox.ini'].some(n => /\bpytest\b/.test(leer(n) ?? ''))
  if (pytest || hay.has('pytest.ini') || hay.has('conftest.py')) salida.push('pytest')
  if (hay.has('Cargo.toml')) salida.push('cargo test')
  if (hay.has('go.mod')) salida.push('go test ./...')
  if (hay.has('gradlew')) salida.push('./gradlew test')
  else if (hay.has('build.gradle') || hay.has('build.gradle.kts')) salida.push('gradle test')
  if (hay.has('pom.xml')) salida.push('mvn test')
  if (nombres.some(n => /\.(sln|csproj|fsproj)$/i.test(n))) salida.push('dotnet test')
  if (hay.has('mix.exs')) salida.push('mix test')
  if (hay.has('Package.swift')) salida.push('swift test')
  if (texto(json(leer('composer.json'))?.['scripts'], 'test') !== undefined) salida.push('composer test')
  if (texto(json(leer('deno.json'))?.['tasks'], 'test') !== undefined) salida.push('deno task test')
  else if (hay.has('deno.json') || hay.has('deno.jsonc')) salida.push('deno test')
  return [...new Set(salida)]
}

export type OpcionListo = { etiqueta: string; criterio: string }

/** Hasta tres comprobaciones del proyecto, la primera recomendada; «lo reviso yo» va aparte. */
export function opcionesListo(comprobaciones: readonly string[], x: TextosPreguntas, max = 3): OpcionListo[] {
  return comprobaciones.slice(0, max).map((c, i) => ({ etiqueta: i === 0 ? x.recomendado(x.listo.pasa(c)) : x.listo.pasa(c), criterio: x.listo.criterio(c) }))
}

// ---------- (c) Cómo seguir tras dos correcciones ----------

export type ComoSeguir = 'limpio' | 'causa' | 'seguir'

/** Con mucho contexto, empezar en limpio va primero; con poco, buscar la causa. Sin la tarea no hay pedido mejorado. */
export function opcionesFallos(contexto: number, conTarea: boolean): ComoSeguir[] {
  if (!conTarea) return ['causa', 'seguir']
  return contexto >= CONTEXTO_PARA_LIMPIAR ? ['limpio', 'causa', 'seguir'] : ['causa', 'limpio', 'seguir']
}

// ---------- (d) Un mensaje con varias tareas ----------

/** A partir de tantas tareas en lista, Toki propone hacerlas una por una. */
export const TAREAS_PARA_PARTIR = 3

const ITEM = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/
const VERBO_TAREA = conAcentos(
  /^(?:y |luego |despu[eé]s |tambi[eé]n |adem[aá]s |and |then |also )?(?:arregl|corrig|cambi|agreg|a[ñn]ad|implement|cre[ae]|elimin|borr|quit|modific|actualiz|refactoriz|reescrib|renombr|muev|mover|haz|hacer|pon|revis|document|escrib|configur|migr|optimiz|mejor|traduc|sub[eai]|instal|integr|separ|extra[ei]|gener|ajust|limpi|investig|prueb|verific|fix|change|add|implement|create|remove|delete|update|modify|refactor|rewrite|rename|move|make|put|review|document|write|configure|migrate|optimi[sz]e|improve|translate|upload|install|integrate|split|extract|generate|adjust|clean|investigate|test|check|build|set up)\w*/i,
)

function esTarea(item: string): boolean {
  const limpio = item.replace(/^\[[ xX]\]\s*/, '').replace(/\*\*|__/g, '').trim()
  // «Login: arregla…» también es una tarea.
  const sinEtiqueta = limpio.replace(/^[^:]{1,30}:\s*/, '')
  return palabrasDe(limpio) >= 3 && (VERBO_TAREA.test(limpio) || VERBO_TAREA.test(sinEtiqueta))
}

export type Tarea = { tarea: string; mensaje: string }

/**
 * Un mensaje que trae tres tareas o más, en lista y cada una con su verbo. Cada tarea
 * lleva lo que va antes y después de la lista (el archivo, «al final corre las pruebas»).
 * Una lista de requisitos de una sola cosa no se parte: sus puntos no empiezan con un verbo.
 */
export function partirTareas(texto: string): Tarea[] | undefined {
  // Con avisos de la app (<task-notification>…) no es un mensaje que escribiste: no se parte.
  if (/<\/?[a-z]+[-_][\w-]*\b[^>]*>/i.test(texto)) return undefined
  const antes: string[] = []
  const despues: string[] = []
  const items: string[] = []
  let base: number | undefined
  for (const linea of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const m = despues.length === 0 ? ITEM.exec(linea) : null
    if (m !== null) {
      const sangria = (m[1] ?? '').length
      base = base ?? sangria
      // Un punto más adentro es detalle de la tarea anterior.
      if (sangria > base && items.length > 0) items[items.length - 1] += ` ${m[2] ?? ''}`
      else items.push(m[2] ?? '')
    } else if (items.length === 0) {
      antes.push(linea)
    } else if (linea.trim() === '') {
      if (despues.length > 0) despues.push(linea)
    } else if (/^\s/.test(linea) && despues.length === 0) {
      items[items.length - 1] += ` ${linea.trim()}`
    } else {
      despues.push(linea)
    }
  }
  if (items.length < TAREAS_PARA_PARTIR || !items.every(esTarea)) return undefined
  const comun = antes.join('\n').trim()
  if (esProyectoNuevo(comun)) return undefined
  const final = despues.join('\n').trim()
  return items.map(tarea => ({ tarea, mensaje: [comun, tarea, final].filter(p => p !== '').join('\n') }))
}

/** ¿El mensaje que llegó es la tarea que Toki dejó en el cuadro (tal cual o retocada)? */
export function esLaTarea(texto: string, tarea: string): boolean {
  const n = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()
  return n(texto).includes(n(tarea).slice(0, 25))
}

// ---------- (e) Qué no olvidar al compactar ----------

/** Con la conversación a este % de donde Claude Code compacta, Toki pregunta qué no olvidar (una vez por tramo). */
export const PCT_PARA_RECORDAR = 85

export type Enfasis = 'reglas' | 'probado'

// ---------- spec.md como /goal ----------

const CRITERIO = conAcentos(/^(?:listo cuando|criterios? de listo|criterios? de aceptaci[oó]n|definici[oó]n de listo|done when|definition of done|acceptance criteria)\b/i)

function recortar(s: string): string {
  return s.length > 300 ? `${s.slice(0, 299)}…` : s
}

/** La línea «Listo cuando: …» del spec, o los puntos bajo un título así. */
export function criterioDeSpec(texto: string): string | undefined {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lineas.length; i++) {
    const l = (lineas[i] ?? '').replace(/^\s*(?:[-*]\s+|#{1,6}\s+)?/, '').replace(/\*\*|__/g, '').trim()
    const m = CRITERIO.exec(l)
    if (m === null) continue
    const resto = l.slice(m[0].length).replace(/^\s*[:：—–-]\s*/, '').trim()
    if (resto !== '') return recortar(resto)
    const puntos: string[] = []
    for (let j = i + 1; j < lineas.length && puntos.length < 4; j++) {
      const s = (lineas[j] ?? '').trim()
      if (s === '') {
        if (puntos.length > 0) break
        continue
      }
      if (/^#{1,6}\s/.test(s)) break
      puntos.push(s.replace(/^(?:[-*]|\d+[.)])\s+/, '').replace(/\*\*|__/g, ''))
    }
    if (puntos.length > 0) return recortar(puntos.join('; '))
  }
  return undefined
}

// ---------- Textos ----------

export type TextosPreguntas = {
  recomendado: (etiqueta: string) => string
  /** El nombre de cada pregunta, para /toki-entrevista y el aviso de que se calló. */
  nombre: Record<TipoPregunta, string>
  callada: (nombre: string) => string
  estado: (activas: string[], calladas: string[]) => string
  donde: { pregunta: string; buscaClaude: string; nota: (lugar: string) => string }
  listo: { pregunta: string; pasa: (comando: string) => string; criterio: (comando: string) => string; yo: string; nota: (criterio: string) => string }
  fallos: { pregunta: (tokens?: string) => string; opcion: Record<ComoSeguir, string>; nota: string; notaLibre: (texto: string) => string }
  tareas: { pregunta: (n: number) => string; una: string; todas: string; nota: (k: number, n: number) => string; notaLibre: (n: number, texto: string) => string; enCuadro: (k: number, n: number) => string }
  recordar: { pregunta: (pct?: number) => string; nada: string; enfasis: Record<Enfasis, string>; anotado: string }
  goal: { pregunta: (criterio: string) => string; si: string; no: string; condicion: (criterio: string) => string; enCuadro: string; tuyo: string }
}

export const textosPreguntas: Record<Idioma, TextosPreguntas> = {
  es: {
    recomendado: e => `${e} (Recomendado)`,
    nombre: {
      donde: 'dónde buscar',
      listo: 'cómo sabremos que quedó',
      fallos: 'cómo seguir tras dos correcciones',
      tareas: 'si separar las tareas',
      recordar: 'qué no olvidar al compactar',
      goal: 'si dejar el criterio del spec como /goal',
    },
    callada: n => `Toki ya no preguntará ${n}. Con /toki-entrevista auto vuelve.`,
    estado: (a, c) => `Preguntas justo a tiempo: ${a.length > 0 ? a.join(', ') : 'ninguna'}${c.length > 0 ? ` · calladas: ${c.join(', ')}` : ''}`,
    donde: {
      pregunta: '¿En qué parte del proyecto está? Si lo sabes, Claude va directo y no lee de más.',
      buscaClaude: 'Que Claude lo busque',
      nota: l => `[Toki] La persona dice dónde buscar: «${l}». Empieza por ahí y amplía solo si no está.`,
    },
    listo: {
      pregunta: '¿Cómo sabremos que quedó? Con eso Claude lo comprueba antes de terminar y te ahorras ir y volver.',
      pasa: c => `Que pase ${c}`,
      criterio: c => `que pase \`${c}\``,
      yo: 'Lo reviso yo',
      nota: c => `[Toki] La persona dijo cómo sabrá que quedó: ${c}. Antes de dar la tarea por terminada, compruébalo; si no se cumple, sigue o di qué falta.`,
    },
    fallos: {
      pregunta: t =>
        t === undefined
          ? 'Ya corregiste dos veces lo mismo. ¿Cómo sigo? Que Claude busque por qué falló antes de otro intento suele evitar el tercero.'
          : `Ya corregiste dos veces lo mismo y la conversación (~${t} tokens) está llena de intentos fallidos. ¿Cómo sigo? Empezar en limpio con un pedido que junta tus correcciones suele funcionar mejor.`,
      opcion: { limpio: 'Empezar en limpio con el pedido mejorado', causa: 'Que Claude busque la causa antes de otro intento', seguir: 'Seguir aquí' },
      nota: '[Toki] Es la segunda corrección sobre lo mismo. Antes de otro intento, busca la causa: explica en 2-3 líneas por qué fallaron los intentos anteriores (la causa, no el síntoma), compruébalo leyendo o ejecutando lo necesario y solo entonces cambia el código.',
      notaLibre: t => `[Toki] Sobre cómo seguir tras dos correcciones, la persona dijo: «${t}».`,
    },
    tareas: {
      pregunta: n => `Tu mensaje trae ${n} tareas. ¿Las hago una por una? Cada una por separado sale mejor y se corrige menos; al terminar cada una, Toki te deja la siguiente en el cuadro.`,
      una: 'Una por una',
      todas: 'Todas juntas',
      nota: (k, n) => `[Toki] La persona partió su mensaje en ${n} tareas y las manda una por una: esta es la ${k}. Haz solo esta.`,
      notaLibre: (n, t) => `[Toki] Sobre cómo hacer las ${n} tareas de su mensaje, la persona dijo: «${t}».`,
      enCuadro: (k, n) => `Toki: la tarea ${k} de ${n} está en el cuadro. Envíala cuando quieras; si no depende de la anterior, /clear antes ahorra.`,
    },
    recordar: {
      pregunta: pct =>
        `${pct === undefined ? 'Antes de compactar' : `La conversación va en ${pct} % de donde Claude Code la compacta`}: ¿algo que Claude no deba olvidar? Toki ya guarda la tarea, las decisiones, los archivos y los errores. Elige o escríbelo tú.`,
      nada: 'Nada más',
      enfasis: { reglas: 'Mis reglas y preferencias, al pie de la letra', probado: 'Lo que ya se probó y no funcionó' },
      anotado: 'Toki: lo tendré en cuenta al compactar.',
    },
    goal: {
      pregunta: c =>
        `Claude guardó el pedido en ${RUTA_SPEC} con este criterio de listo: «${c}». ¿Lo dejo como /goal? Claude Code lo revisa cada vez que Claude va a detenerse y lo hace seguir hasta que se cumpla.`,
      si: 'Sí, como /goal',
      no: 'No hace falta',
      condicion: c => `Se cumple el criterio de listo de ${RUTA_SPEC}: ${c}`,
      enCuadro: 'Toki: no pude poner el /goal; quedó en el cuadro, pulsa Enter.',
      tuyo: 'Toki: tu /goal quedó en el cuadro; revísalo y pulsa Enter.',
    },
  },
  en: {
    recomendado: e => `${e} (Recommended)`,
    nombre: {
      donde: 'where to look',
      listo: 'how we will know it is done',
      fallos: 'how to go on after two corrections',
      tareas: 'whether to split the tasks',
      recordar: 'what not to forget when compacting',
      goal: 'whether to set the spec criterion as /goal',
    },
    callada: n => `Toki will no longer ask ${n}. /toki-entrevista auto brings it back.`,
    estado: (a, c) => `Just-in-time questions: ${a.length > 0 ? a.join(', ') : 'none'}${c.length > 0 ? ` · silenced: ${c.join(', ')}` : ''}`,
    donde: {
      pregunta: 'Where in the project is it? If you know, Claude goes straight there instead of reading too much.',
      buscaClaude: 'Let Claude search',
      nota: l => `[Toki] The person says where to look: "${l}". Start there and widen only if it is not there.`,
    },
    listo: {
      pregunta: 'How will we know it is done? Claude then checks it before finishing and you skip the back and forth.',
      pasa: c => `${c} passes`,
      criterio: c => `\`${c}\` passes`,
      yo: "I'll check it myself",
      nota: c => `[Toki] The person said how they will know it is done: ${c}. Before calling the task done, check it; if it does not hold, keep going or say what is missing.`,
    },
    fallos: {
      pregunta: t =>
        t === undefined
          ? 'You have corrected the same thing twice. How should I go on? Having Claude find why it failed before another attempt usually avoids a third.'
          : `You have corrected the same thing twice and the conversation (~${t} tokens) is full of failed attempts. How should I go on? Starting clean with a request that gathers your corrections usually works better.`,
      opcion: { limpio: 'Start clean with the improved request', causa: 'Have Claude find the cause before another attempt', seguir: 'Stay here' },
      nota: '[Toki] This is the second correction on the same thing. Before another attempt, find the cause: explain in 2-3 lines why the previous attempts failed (the cause, not the symptom), check it by reading or running what is needed, and only then change the code.',
      notaLibre: t => `[Toki] On how to go on after two corrections, the person said: "${t}".`,
    },
    tareas: {
      pregunta: n => `Your message has ${n} tasks. One at a time? Each on its own comes out better with fewer corrections; when each one is done, Toki puts the next one in the box.`,
      una: 'One at a time',
      todas: 'All together',
      nota: (k, n) => `[Toki] The person split their message into ${n} tasks and is sending them one at a time: this is number ${k}. Do only this one.`,
      notaLibre: (n, t) => `[Toki] On how to do the ${n} tasks in their message, the person said: "${t}".`,
      enCuadro: (k, n) => `Toki: task ${k} of ${n} is in the box. Send it when ready; if it does not depend on the previous one, /clear first saves tokens.`,
    },
    recordar: {
      pregunta: pct =>
        `${pct === undefined ? 'Before compacting' : `The conversation is at ${pct}% of where Claude Code compacts it`}: anything Claude must not forget? Toki already keeps the task, the decisions, the files and the errors. Pick one or type it.`,
      nada: 'Nothing else',
      enfasis: { reglas: 'My rules and preferences, verbatim', probado: 'What was tried and did not work' },
      anotado: 'Toki: noted for the compaction.',
    },
    goal: {
      pregunta: c =>
        `Claude saved the request to ${RUTA_SPEC} with this done criterion: "${c}". Set it as /goal? Claude Code checks it every time Claude is about to stop and keeps it going until it holds.`,
      si: 'Yes, as /goal',
      no: 'Not needed',
      condicion: c => `The done criterion in ${RUTA_SPEC} holds: ${c}`,
      enCuadro: 'Toki: could not set the /goal; it is in the box, press Enter.',
      tuyo: 'Toki: your /goal is in the box; check it and press Enter.',
    },
  },
}
