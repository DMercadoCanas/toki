// Toki, la alcancía: la mascota que cuida tus tokens.
// Funciones puras: cuadros de animación, frases y medidores. Sin $.

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

export function formatearMinutos(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

/** La frase que Toki dice, con la acción sugerida cuando hay una. */
export function frase(s: Situacion): { texto: string; tono: 'normal' | 'bien' | 'aviso' | 'peligro'; accion?: 'compactar' | 'limpiar' } {
  const ahorro = s.ahorradoSesion > 0 ? ` Esta sesión te ahorré ~${formatearTokens(s.ahorradoSesion)} tokens.` : ''
  switch (s.actividad) {
    case 'alerta':
      if ((s.contextoPct ?? 0) < 70 && (s.contextoTokens ?? 0) >= TOKENS_PESADOS) {
        return {
          texto: `Tu conversación ya pesa ~${formatearTokens(s.contextoTokens ?? 0)} tokens y se reenvía completa en cada mensaje. Si terminaste una tarea, compacta; si cambias de tema, /clear.`,
          tono: 'aviso',
          accion: 'compactar',
        }
      }
      return {
        texto: `Contexto al ${s.contextoPct ?? 0}%: compacta en esta pausa, antes de que se haga solo a mitad de una tarea.`,
        tono: (s.contextoPct ?? 0) >= 85 ? 'peligro' : 'aviso',
        accion: 'compactar',
      }
    case 'dormido':
      return {
        texto: `El caché se enfrió (sin actividad ${formatearMinutos(s.inactivoMinutos)}): el próximo mensaje reprocesa todo el contexto. Si cambias de tema, mejor /clear.`,
        tono: 'aviso',
        accion: 'limpiar',
      }
    case 'pensando':
      return { texto: 'Claude está pensando…', tono: 'normal' }
    case 'leyendo':
      return { texto: 'Leyendo archivos. Si ya leyó uno sin cambios, Claude Code no lo vuelve a cargar.', tono: 'normal' }
    case 'buscando':
      return { texto: 'Buscando en el proyecto. Le recordé que hay un mapa para no leer a ciegas.', tono: 'normal' }
    case 'ejecutando':
      return { texto: 'Ejecutando un comando. Si la salida es larga, te la compacto y guardo el original.', tono: 'normal' }
    case 'editando':
      return { texto: 'Editando archivos.', tono: 'normal' }
    case 'compactando':
      return { texto: 'Compactando el contexto. Los errores y decisiones importantes se conservan.', tono: 'normal' }
    case 'esperando':
      return { texto: 'Claude espera tu permiso para continuar.', tono: 'aviso' }
    case 'listo':
      if (s.bucleReciente) return { texto: 'Ojo: un comando falló 3 veces seguidas. Le pedí a Claude cambiar de enfoque.', tono: 'aviso' }
      if (s.ultimoAhorro) {
        return { texto: `Listo. En «${recortar(s.ultimoAhorro.comando, 28)}» te ahorré ~${formatearTokens(s.ultimoAhorro.tokens)} tokens.`, tono: 'bien' }
      }
      return { texto: `Listo.${ahorro}`, tono: 'bien' }
    case 'tranquilo':
    default:
      return { texto: s.ahorradoSesion > 0 ? `Todo en orden.${ahorro}` : 'Todo en orden. Estoy pendiente de tus tokens.', tono: 'normal' }
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
): Actividad {
  if (trabajando) return base === 'tranquilo' || base === 'listo' || base === 'dormido' || base === 'alerta' ? 'pensando' : base
  if (contextoPct !== undefined && contextoPct >= 70) return 'alerta'
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

export function formatearDuracion(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'menos de 1 min'
  return formatearMinutos(min)
}
