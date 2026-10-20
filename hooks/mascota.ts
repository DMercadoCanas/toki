// Toki, la alcancía: la mascota que cuida tus tokens.
// Funciones puras: cuadros de animación, frases y medidores. Sin $.

import { t } from './idioma'
import type { Idioma } from './idioma'

export type Actividad =
  | 'tranquilo'
  | 'pensando'
  | 'leyendo'
  | 'buscando'
  | 'ejecutando'
  | 'editando'
  | 'compactando'
  | 'esperando'
  | 'listo'
  | 'dormido'
  | 'alerta'
  | 'celebrando'

/** Cuadros por estado. Se avanza uno cada ~600 ms. */
const CUADROS: Record<Actividad, readonly string[]> = {
  tranquilo: ['(•‿•)', '(•‿•)', '(•‿•)', '(•‿•)', '(−‿−)'],
  pensando: ['(•_•)   ', '(•_•) · ', '(•_•) ··', '(•_•)···'],
  leyendo: ['(⊙‿⊙) ▤', '(⊙‿⊙) ▥'],
  buscando: ['(•‿•) ⌕', '(•‿•)  ⌕', '(•‿•) ⌕'],
  ejecutando: ['(•‿•) ⠋', '(•‿•) ⠙', '(•‿•) ⠹', '(•‿•) ⠸', '(•‿•) ⠼', '(•‿•) ⠴', '(•‿•) ⠦', '(•‿•) ⠧', '(•‿•) ⠇', '(•‿•) ⠏'],
  editando: ['(•‿•) ✎', '(•‿•) ✎.', '(•‿•) ✎..'],
  compactando: ['(>‿<) ▸  ', '(>‿<) ▸▸ ', '(>‿<) ▸▸▸'],
  esperando: ['(•o•) ?', '(•o•)  ', '(•o•) ?'],
  listo: ['(^‿^) ✓', '(^‿^) ✓'],
  dormido: ['(−_−) z  ', '(−_−) zZ ', '(−_−) zZZ', '(−_−)    '],
  alerta: ['(•△•) !', '(•△•)  '],
  celebrando: ['\\(^‿^)/ ✦', ' (^‿^)/ ✧', '\\(^‿^)/ ✦', ' (^‿^)/  '],
}

export function cuadro(actividad: Actividad, tick: number): string {
  const lista = CUADROS[actividad]
  return lista[((tick % lista.length) + lista.length) % lista.length] ?? lista[0] ?? '(•‿•)'
}

export function actividadDeHerramienta(herramienta: string): Actividad {
  if (herramienta === 'Read' || herramienta === 'NotebookRead') return 'leyendo'
  if (herramienta === 'Grep' || herramienta === 'Glob' || herramienta === 'WebSearch' || herramienta === 'WebFetch') return 'buscando'
  if (herramienta === 'Bash' || herramienta === 'PowerShell') return 'ejecutando'
  if (herramienta === 'Edit' || herramienta === 'Write' || herramienta === 'MultiEdit' || herramienta === 'NotebookEdit') return 'editando'
  return 'pensando'
}

/** A partir de aquí la conversación es pesada aunque el porcentaje parezca bajo (ventanas de 1M). */
export const TOKENS_PESADOS = 200_000

export type Situacion = {
  actividad: Actividad
  contextoPct?: number
  contextoTokens?: number
  cacheMinutosRestantes?: number
  inactivoMinutos: number
  ahorradoSesion: number
  ultimoAhorro?: { tokens: number; comando: string }
  bucleReciente?: boolean
}

export function formatearTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(Math.round(tokens))
}

export function formatearMinutos(min: number, idioma: Idioma = 'es'): string {
  const x = t(idioma)
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} ${x.min}`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} ${x.h}` : `${h} ${x.h} ${r} ${x.min}`
}

/** La frase que Toki dice, con la acción sugerida cuando hay una. */
export function frase(s: Situacion, idioma: Idioma = 'es'): { texto: string; tono: 'normal' | 'bien' | 'aviso' | 'peligro'; accion?: 'compactar' | 'limpiar' } {
  const x = t(idioma)
  const ahorro = s.ahorradoSesion > 0 ? ` ${x.sesionAhorro(formatearTokens(s.ahorradoSesion))}` : ''
  switch (s.actividad) {
    case 'alerta':
      if ((s.contextoPct ?? 0) < 70 && (s.contextoTokens ?? 0) >= TOKENS_PESADOS) {
        return { texto: x.frasePesada(formatearTokens(s.contextoTokens ?? 0)), tono: 'aviso', accion: 'compactar' }
      }
      return { texto: x.fraseContexto(s.contextoPct ?? 0), tono: (s.contextoPct ?? 0) >= 85 ? 'peligro' : 'aviso', accion: 'compactar' }
    case 'dormido':
      return { texto: x.fraseDormido(formatearMinutos(s.inactivoMinutos, idioma)), tono: 'aviso', accion: 'limpiar' }
    case 'pensando':
      return { texto: x.frasePensando, tono: 'normal' }
    case 'leyendo':
      return { texto: x.fraseLeyendo, tono: 'normal' }
    case 'buscando':
      return { texto: x.fraseBuscando, tono: 'normal' }
    case 'ejecutando':
      return { texto: x.fraseEjecutando, tono: 'normal' }
    case 'editando':
      return { texto: x.fraseEditando, tono: 'normal' }
    case 'compactando':
      return { texto: x.fraseCompactando, tono: 'normal' }
    case 'esperando':
      return { texto: x.fraseEsperando, tono: 'aviso' }
    case 'celebrando':
      return { texto: x.fraseCelebrando, tono: 'bien' }
    case 'listo':
      if (s.bucleReciente) return { texto: x.fraseBucle, tono: 'aviso' }
      if (s.ultimoAhorro) return { texto: x.fraseListoAhorro(recortar(s.ultimoAhorro.comando, 28), formatearTokens(s.ultimoAhorro.tokens)), tono: 'bien' }
      return { texto: x.fraseListo(ahorro), tono: 'bien' }
    case 'tranquilo':
    default:
      return { texto: s.ahorradoSesion > 0 ? x.fraseTranquiloAhorro(formatearTokens(s.ahorradoSesion)) : x.fraseTranquilo, tono: 'normal' }
  }
}

export function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio
}

/** Decide el estado visible a partir de la actividad y las condiciones. */
export function decidirActividad(
  base: Actividad,
  trabajando: boolean,
  contextoPct: number | undefined,
  inactivoMinutos: number,
  ttlMinutos: number,
  hayTurnos: boolean,
  contextoTokens?: number,
  silenciado = false,
  celebrando = false,
): Actividad {
  if (trabajando) return base === 'tranquilo' || base === 'listo' || base === 'dormido' || base === 'alerta' || base === 'celebrando' ? 'pensando' : base
  if (contextoPct !== undefined && contextoPct >= 70) return 'alerta'
  if (celebrando) return 'celebrando'
  if (!silenciado && contextoTokens !== undefined && contextoTokens >= TOKENS_PESADOS) return 'alerta'
  if (hayTurnos && inactivoMinutos >= ttlMinutos) return 'dormido'
  return base
}

/** Medidor de bloques: ████░░░░ */
export function barra(pct: number | undefined, ancho: number): string {
  if (pct === undefined) return '░'.repeat(ancho)
  const lleno = Math.max(0, Math.min(ancho, Math.round((pct / 100) * ancho)))
  return '█'.repeat(lleno) + '░'.repeat(ancho - lleno)
}

export function colorDePorcentaje(pct: number | undefined): 'success' | 'warning' | 'error' | 'inactive' {
  if (pct === undefined) return 'inactive'
  if (pct >= 80) return 'error'
  if (pct >= 50) return 'warning'
  return 'success'
}

/** Reloj del caché: ● lleno, ◕ ◑ ◔ vaciándose, ○ frío. */
export function relojCache(restante: number | undefined, ttl: number): string {
  if (restante === undefined) return '○'
  const f = restante / ttl
  if (f <= 0) return '○'
  if (f < 0.25) return '◔'
  if (f < 0.5) return '◑'
  if (f < 0.75) return '◕'
  return '●'
}

export function formatearDuracion(ms: number, idioma: Idioma = 'es'): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return t(idioma).menosDe1Min
  return formatearMinutos(min, idioma)
}
