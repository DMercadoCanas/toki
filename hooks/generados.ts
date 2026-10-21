// Archivos generados: lockfiles, código minificado, carpetas de build. Leerlos enteros llena el contexto
// con miles de líneas que casi nunca hacen falta. Lógica pura: sin dependencias.

/** Líneas que entrega la segunda lectura entera de un archivo generado. */
export const TRAMO_GENERADO = 300

export type TipoGenerado = 'lockfile' | 'minificado' | 'carpeta' | 'codegen'

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'uv.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'pubspec.lock',
  'packages.lock.json',
  'podfile.lock',
  'flake.lock',
])

const CARPETAS = new Set(['node_modules', 'dist', '.next', '.nuxt', '.dart_tool', '__pycache__', '.gradle', 'coverage', '.turbo', '.svelte-kit'])

const MINIFICADO = /\.(min\.(js|css|mjs)|map|bundle\.js|chunk\.js)$/i
const CODEGEN = /(\.g\.dart|\.freezed\.dart|\.pb\.go|_pb2(_grpc)?\.py|\.pb\.(ts|js)|\.designer\.cs|\.pyc)$/i

/** ¿Este archivo es generado? Devuelve el tipo, o undefined si es código que alguien escribe. */
export function tipoGenerado(ruta: string): TipoGenerado | undefined {
  const partes = ruta.split(/[\\/]/).filter(Boolean)
  const nombre = (partes[partes.length - 1] ?? '').toLowerCase()
  if (LOCKFILES.has(nombre)) return 'lockfile'
  if (MINIFICADO.test(nombre)) return 'minificado'
  if (CODEGEN.test(nombre)) return 'codegen'
  if (partes.slice(0, -1).some(p => CARPETAS.has(p.toLowerCase()))) return 'carpeta'
  return undefined
}

export interface TextosGenerados {
  /** Mensaje con el que se frena la primera lectura completa. */
  frenado: (nombre: string, tipo: TipoGenerado) => string
  toast: (nombre: string) => string
}

export const textosGenerados: Record<'es' | 'en', TextosGenerados> = {
  es: {
    frenado: (nombre, tipo) =>
      `[Toki] ${nombre} es ${
        { lockfile: 'un archivo de bloqueo de dependencias', minificado: 'código minificado o un mapa', carpeta: 'parte de una carpeta generada (node_modules, dist…)', codegen: 'código generado' }[tipo]
      } y leerlo entero llena el contexto de líneas que casi nunca hacen falta. Busca lo que necesitas con Grep o lee un tramo con offset y limit. Si repites la misma lectura te entrego las primeras ${TRAMO_GENERADO} líneas; si la repites otra vez, el archivo entero.`,
    toast: nombre => `Toki frenó la lectura de ${nombre} (generado). Si hace falta, Claude lo puede volver a pedir.`,
  },
  en: {
    frenado: (nombre, tipo) =>
      `[Toki] ${nombre} is ${
        { lockfile: 'a dependency lockfile', minificado: 'minified code or a source map', carpeta: 'inside a generated folder (node_modules, dist…)', codegen: 'generated code' }[tipo]
      } and reading it whole fills the context with lines you rarely need. Look up what you need with Grep, or read a slice with offset and limit. Repeat the same read and you get the first ${TRAMO_GENERADO} lines; repeat it once more for the whole file.`,
    toast: nombre => `Toki held back reading ${nombre} (generated). Claude can ask again if it needs it.`,
  },
}
