// Toki en pixel art: cada cuadro se dibuja en una cuadrícula de 32×32 y se serializa
// como SVG (un <path> por color, con bordes nítidos). Sin dependencias ni imágenes.
import type { Actividad } from './mascota'

export const ANCHO = 32
export const ALTO = 32

const AZUL = '#3f84dc'
const AZUL_OSCURO = '#2a5cad'
const AZUL_CLARO = '#79b3f2'
const MARINO = '#172744'
const MARINO_CLARO = '#2b4470'
const NARANJA = '#f39a3d'
const NARANJA_OSCURO = '#c96e1e'
const GRIS = '#9aa3ad'
const GRIS_OSCURO = '#4f575f'
const BLANCO = '#f4f7fa'
const CIAN = '#5fe3ea'
const VERDE = '#34a853'
const ROJO = '#ff6b6b'
const AMARILLO = '#ffd84d'
const HUMO = '#b8c0c8'

type Ojos = 'normal' | 'parpadeo' | 'feliz' | 'cerrados' | 'apretados' | 'grandes'

export interface Cuadro {
  /** Desplazamiento vertical del cuerpo (rebote). */
  dy?: number
  /** Desplazamiento horizontal del cuerpo (temblor). */
  dx?: number
  ojos?: Ojos
  /** Hacia dónde miran los ojos. */
  mirada?: { x: number; y: number }
  brazoIzq?: 'abajo' | 'arriba' | 'medio' | 'barbilla' | 'caja'
  brazoDer?: 'abajo' | 'arriba' | 'medio' | 'saludo' | 'manguera' | 'caja'
  /** Cuadro de la manguera (0, 1, 2): el polvo entra en la boquilla. */
  manguera?: number
  /** Caja de tokens comprimida: 0 ancha … 2 apretada. */
  caja?: number
  /** Zetas del sueño (0..2). */
  zzz?: number
  /** Borde rojo (alerta). */
  alerta?: boolean
  /** Confeti (0..2). */
  confeti?: number
  /** Gota de sudor. */
  sudor?: boolean
  /** Signo de pensar. */
  burbuja?: boolean
}

class Lienzo {
  readonly celdas: (string | null)[] = new Array<string | null>(ANCHO * ALTO).fill(null)
  px(x: number, y: number, c: string): void {
    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return
    this.celdas[y * ANCHO + x] = c
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c)
  }
  /** Rectángulo con las esquinas recortadas (r = cuántas filas se redondean). */
  redondo(x: number, y: number, w: number, h: number, c: string, r = 1): void {
    for (let j = 0; j < h; j++) {
      const borde = Math.min(j, h - 1 - j)
      const margen = borde < r ? r - borde : 0
      this.rect(x + margen, y + j, w - margen * 2, 1, c)
    }
  }
  disco(cx: number, cy: number, r: number, c: string): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.px(cx + x, cy + y, c)
  }
  /** El contenido del cuadro: un <path> por color. */
  trazos(): string {
    const porColor = new Map<string, string[]>()
    for (let y = 0; y < ALTO; y++) {
      let x = 0
      while (x < ANCHO) {
        const c = this.celdas[y * ANCHO + x]
        if (c === null || c === undefined) {
          x++
          continue
        }
        let fin = x
        while (fin < ANCHO && this.celdas[y * ANCHO + fin] === c) fin++
        const lista = porColor.get(c) ?? []
        lista.push(`M${x} ${y}h${fin - x}v1h-${fin - x}z`)
        porColor.set(c, lista)
        x = fin
      }
    }
    let cuerpo = ''
    for (const [c, d] of porColor) cuerpo += `<path fill="${c}" d="${d.join('')}"/>`
    return cuerpo
  }
}

// Geometría base (sin desplazar): cuerpo x 7..24, y 3..27.
function cuerpo(l: Lienzo, ox: number, oy: number, alerta: boolean): void {
  const B = alerta ? ROJO : AZUL_OSCURO
  // Silueta (borde oscuro) y relleno.
  l.redondo(ox + 7, oy + 3, 18, 25, B, 3)
  l.redondo(ox + 8, oy + 4, 16, 23, AZUL, 2)
  // Brillo del lado izquierdo.
  l.rect(ox + 9, oy + 6, 1, 6, AZUL_CLARO)
  l.rect(ox + 10, oy + 5, 2, 1, AZUL_CLARO)
  // Costura de la cintura.
  l.rect(ox + 8, oy + 16, 16, 1, AZUL_OSCURO)
  // Etiqueta "Toki".
  l.rect(ox + 13, oy + 18, 6, 2, BLANCO)
  l.rect(ox + 14, oy + 18, 1, 2, MARINO_CLARO)
  l.rect(ox + 16, oy + 18, 1, 2, MARINO_CLARO)
  // Botón del pecho.
  l.px(ox + 10, oy + 18, MARINO)
  // Ventanilla de reciclaje.
  l.disco(ox + 16, oy + 23, 3, GRIS_OSCURO)
  l.disco(ox + 16, oy + 23, 2, BLANCO)
  l.px(ox + 15, oy + 22, VERDE)
  l.px(ox + 17, oy + 22, VERDE)
  l.px(ox + 16, oy + 24, VERDE)
  l.px(ox + 16, oy + 23, HUMO)
  // Audífonos.
  l.redondo(ox + 4, oy + 8, 3, 6, NARANJA_OSCURO, 1)
  l.rect(ox + 5, oy + 9, 2, 4, NARANJA)
  l.redondo(ox + 25, oy + 8, 3, 6, NARANJA_OSCURO, 1)
  l.rect(ox + 25, oy + 9, 2, 4, NARANJA)
}

function visor(l: Lienzo, ox: number, oy: number): void {
  l.redondo(ox + 10, oy + 5, 12, 9, MARINO, 2)
  // Reflejo.
  l.rect(ox + 12, oy + 7, 1, 2, MARINO_CLARO)
  l.px(ox + 13, oy + 7, MARINO_CLARO)
}

function ojos(l: Lienzo, ox: number, oy: number, tipo: Ojos, mirada: { x: number; y: number }): void {
  const mx = Math.max(-2, Math.min(2, mirada.x))
  const my = Math.max(-1, Math.min(1, mirada.y))
  const li = ox + 13 + mx
  const ld = ox + 18 + mx
  const y = oy + 8 + my
  switch (tipo) {
    case 'normal':
      l.rect(li, y, 2, 3, CIAN)
      l.rect(ld, y, 2, 3, CIAN)
      l.px(li, y, BLANCO)
      l.px(ld, y, BLANCO)
      return
    case 'parpadeo':
      l.rect(li, y + 2, 2, 1, CIAN)
      l.rect(ld, y + 2, 2, 1, CIAN)
      return
    case 'feliz':
      l.px(li, y + 1, CIAN)
      l.px(li + 1, y, CIAN)
      l.px(li + 2, y + 1, CIAN)
      l.px(ld - 1, y + 1, CIAN)
      l.px(ld, y, CIAN)
      l.px(ld + 1, y + 1, CIAN)
      return
    case 'cerrados':
      l.px(li, y + 1, CIAN)
      l.px(li + 1, y + 2, CIAN)
      l.px(li + 2, y + 1, CIAN)
      l.px(ld - 1, y + 1, CIAN)
      l.px(ld, y + 2, CIAN)
      l.px(ld + 1, y + 1, CIAN)
      return
    case 'apretados':
      // > <
      l.px(li, y, CIAN)
      l.px(li + 1, y + 1, CIAN)
      l.px(li, y + 2, CIAN)
      l.px(ld + 1, y, CIAN)
      l.px(ld, y + 1, CIAN)
      l.px(ld + 1, y + 2, CIAN)
      return
    case 'grandes':
      l.rect(li - 1, y - 1, 3, 4, CIAN)
      l.rect(ld, y - 1, 3, 4, CIAN)
      l.px(li - 1, y - 1, BLANCO)
      l.px(ld, y - 1, BLANCO)
      return
  }
}

function brazoIzquierdo(l: Lienzo, ox: number, oy: number, pose: NonNullable<Cuadro['brazoIzq']>): void {
  switch (pose) {
    case 'abajo':
      l.rect(ox + 5, oy + 17, 2, 5, GRIS)
      l.rect(ox + 4, oy + 22, 3, 2, GRIS_OSCURO)
      return
    case 'medio':
      l.rect(ox + 5, oy + 17, 2, 3, GRIS)
      l.rect(ox + 3, oy + 18, 2, 2, GRIS)
      l.rect(ox + 2, oy + 17, 2, 2, GRIS_OSCURO)
      return
    case 'arriba':
      l.rect(ox + 5, oy + 15, 2, 3, GRIS)
      l.rect(ox + 3, oy + 12, 2, 3, GRIS)
      l.rect(ox + 2, oy + 6, 2, 6, GRIS)
      l.rect(ox + 1, oy + 4, 3, 2, GRIS_OSCURO)
      return
    case 'barbilla':
      l.rect(ox + 5, oy + 17, 2, 2, GRIS)
      l.rect(ox + 6, oy + 15, 2, 2, GRIS)
      l.rect(ox + 8, oy + 13, 3, 2, GRIS_OSCURO)
      return
    case 'caja':
      l.rect(ox + 5, oy + 17, 2, 2, GRIS)
      l.rect(ox + 6, oy + 19, 3, 2, GRIS)
      return
  }
}

function brazoDerecho(l: Lienzo, ox: number, oy: number, pose: NonNullable<Cuadro['brazoDer']>, manguera: number): void {
  switch (pose) {
    case 'abajo':
      l.rect(ox + 25, oy + 17, 2, 5, GRIS)
      l.rect(ox + 25, oy + 22, 3, 2, GRIS_OSCURO)
      return
    case 'medio':
      l.rect(ox + 25, oy + 17, 2, 3, GRIS)
      l.rect(ox + 27, oy + 18, 2, 2, GRIS)
      l.rect(ox + 28, oy + 17, 2, 2, GRIS_OSCURO)
      return
    case 'arriba':
      l.rect(ox + 25, oy + 15, 2, 3, GRIS)
      l.rect(ox + 27, oy + 12, 2, 3, GRIS)
      l.rect(ox + 28, oy + 6, 2, 6, GRIS)
      l.rect(ox + 28, oy + 4, 3, 2, GRIS_OSCURO)
      return
    case 'saludo':
      l.rect(ox + 25, oy + 15, 2, 3, GRIS)
      l.rect(ox + 27, oy + 14, 2, 2, GRIS)
      l.rect(ox + 28, oy + 11, 2, 3, GRIS)
      l.rect(ox + 28, oy + 9, 3, 2, GRIS_OSCURO)
      return
    case 'caja':
      l.rect(ox + 25, oy + 17, 2, 2, GRIS)
      l.rect(ox + 23, oy + 19, 3, 2, GRIS)
      return
    case 'manguera': {
      l.rect(ox + 25, oy + 17, 2, 4, GRIS)
      l.rect(ox + 26, oy + 21, 2, 2, GRIS_OSCURO)
      // Manguera gris azulada que baja al suelo.
      l.rect(ox + 27, oy + 22, 1, 3, AZUL_OSCURO)
      l.rect(ox + 28, oy + 24, 1, 3, AZUL_OSCURO)
      l.rect(ox + 28, oy + 27, 3, 2, AZUL)
      l.rect(ox + 27, oy + 29, 5, 1, AZUL_OSCURO)
      // Polvo que entra en la boquilla.
      const f = manguera % 3
      if (f === 0) {
        l.px(ox + 24, oy + 30, HUMO)
        l.px(ox + 22, oy + 29, HUMO)
      } else if (f === 1) {
        l.px(ox + 25, oy + 30, HUMO)
        l.px(ox + 23, oy + 28, HUMO)
      } else {
        l.px(ox + 26, oy + 30, HUMO)
        l.px(ox + 25, oy + 28, HUMO)
      }
      return
    }
  }
}

function ruedas(l: Lienzo, ox: number, oy: number): void {
  for (const cx of [ox + 11, ox + 21]) {
    l.disco(cx, oy + 28, 2, MARINO)
    l.px(cx, oy + 28, GRIS)
  }
}

function caja(l: Lienzo, ox: number, oy: number, nivel: number): void {
  // Caja de cartón delante del pecho; se aprieta a medida que sube el nivel.
  const w = 10 - nivel * 2
  const x = ox + 16 - Math.floor(w / 2)
  l.rect(x, oy + 20, w, 6, NARANJA_OSCURO)
  l.rect(x + 1, oy + 21, w - 2, 4, NARANJA)
  l.rect(x + 1, oy + 22, w - 2, 1, NARANJA_OSCURO)
  if (nivel > 0) {
    // Líneas de presión.
    l.px(x - 2, oy + 21, HUMO)
    l.px(x - 2, oy + 24, HUMO)
    l.px(x + w + 1, oy + 21, HUMO)
    l.px(x + w + 1, oy + 24, HUMO)
  }
}

function zetas(l: Lienzo, ox: number, oy: number, paso: number): void {
  const z = (x: number, y: number, c: string) => {
    l.rect(x, y, 3, 1, c)
    l.px(x + 1, y + 1, c)
    l.rect(x, y + 2, 3, 1, c)
  }
  if (paso >= 0) z(ox + 25, oy + 4 - paso, HUMO)
  if (paso >= 1) z(ox + 28, oy + 1 - (paso - 1), BLANCO)
}

function confeti(l: Lienzo, paso: number): void {
  const puntos: [number, number, string][] = [
    [3, 3, AMARILLO],
    [28, 5, CIAN],
    [6, 1, VERDE],
    [24, 1, ROJO],
    [1, 9, CIAN],
    [30, 10, AMARILLO],
  ]
  for (const [x, y, c] of puntos) l.px(x, (y + paso * 3) % 14, c)
}

export function dibujar(c: Cuadro): string {
  const l = new Lienzo()
  const ox = c.dx ?? 0
  const oy = c.dy ?? 0
  if (c.zzz !== undefined) zetas(l, ox, oy, c.zzz)
  if (c.confeti !== undefined) confeti(l, c.confeti)
  ruedas(l, ox, oy)
  cuerpo(l, ox, oy, c.alerta === true)
  visor(l, ox, oy)
  ojos(l, ox, oy, c.ojos ?? 'normal', c.mirada ?? { x: 0, y: 0 })
  brazoIzquierdo(l, ox, oy, c.brazoIzq ?? 'abajo')
  brazoDerecho(l, ox, oy, c.brazoDer ?? 'abajo', c.manguera ?? 0)
  if (c.caja !== undefined) caja(l, ox, oy, c.caja)
  if (c.sudor === true) {
    l.px(ox + 24, oy + 3, CIAN)
    l.rect(ox + 23, oy + 4, 2, 2, CIAN)
  }
  if (c.burbuja === true) {
    l.px(ox + 26, oy + 3, BLANCO)
    l.px(ox + 28, oy + 1, BLANCO)
    l.rect(ox + 29, oy - 1 < 0 ? 0 : oy - 1, 2, 2, BLANCO)
  }
  return l.trazos()
}

export interface Animacion {
  /** Milisegundos por cuadro. */
  ms: number
  cuadros: Cuadro[]
}

const reposo = (extra: Cuadro = {}): Cuadro[] => [
  { ...extra },
  { ...extra },
  { ...extra, dy: -1 },
  { ...extra, dy: -1 },
  { ...extra, dy: -1, ojos: 'parpadeo' },
  { ...extra, dy: -1 },
  { ...extra },
  { ...extra },
]

export const ANIMACIONES: Record<Actividad, Animacion> = {
  tranquilo: { ms: 260, cuadros: reposo() },
  esperando: { ms: 220, cuadros: reposo({ ojos: 'grandes' }) },
  pensando: {
    ms: 300,
    cuadros: [
      { brazoIzq: 'barbilla', mirada: { x: 1, y: -1 }, burbuja: true },
      { brazoIzq: 'barbilla', mirada: { x: 1, y: -1 }, burbuja: true, dy: -1 },
      { brazoIzq: 'barbilla', mirada: { x: 2, y: -1 }, burbuja: true, dy: -1 },
      { brazoIzq: 'barbilla', mirada: { x: 1, y: -1 }, burbuja: true },
      { brazoIzq: 'barbilla', mirada: { x: 1, y: -1 } },
      { brazoIzq: 'barbilla', mirada: { x: 1, y: -1 }, ojos: 'parpadeo' },
    ],
  },
  leyendo: {
    ms: 180,
    cuadros: [
      { mirada: { x: -2, y: 0 } },
      { mirada: { x: -1, y: 0 } },
      { mirada: { x: 0, y: 0 } },
      { mirada: { x: 1, y: 0 } },
      { mirada: { x: 2, y: 0 } },
      { mirada: { x: 2, y: 1 } },
      { mirada: { x: -2, y: 1 }, ojos: 'parpadeo' },
    ],
  },
  buscando: {
    ms: 120,
    cuadros: [
      { mirada: { x: -2, y: 0 }, ojos: 'grandes' },
      { mirada: { x: -1, y: -1 }, ojos: 'grandes' },
      { mirada: { x: 1, y: -1 }, ojos: 'grandes' },
      { mirada: { x: 2, y: 0 }, ojos: 'grandes' },
      { mirada: { x: 1, y: 1 }, ojos: 'grandes' },
      { mirada: { x: -1, y: 1 }, ojos: 'grandes' },
    ],
  },
  ejecutando: {
    ms: 140,
    cuadros: [
      { brazoDer: 'manguera', manguera: 0, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 1, mirada: { x: 1, y: 1 }, dx: 1 },
      { brazoDer: 'manguera', manguera: 2, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 0, mirada: { x: 1, y: 1 }, dx: -1 },
      { brazoDer: 'manguera', manguera: 1, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 2, mirada: { x: 1, y: 1 }, ojos: 'parpadeo' },
    ],
  },
  editando: {
    ms: 140,
    cuadros: [
      { brazoDer: 'manguera', manguera: 0, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 1, mirada: { x: 1, y: 1 }, dy: -1 },
      { brazoDer: 'manguera', manguera: 2, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 0, mirada: { x: 1, y: 1 }, dy: -1 },
      { brazoDer: 'manguera', manguera: 1, mirada: { x: 1, y: 1 } },
      { brazoDer: 'manguera', manguera: 2, mirada: { x: 1, y: 1 }, ojos: 'parpadeo' },
    ],
  },
  compactando: {
    ms: 200,
    cuadros: [
      { brazoIzq: 'caja', brazoDer: 'caja', caja: 0, ojos: 'apretados' },
      { brazoIzq: 'caja', brazoDer: 'caja', caja: 1, ojos: 'apretados', dy: 1 },
      { brazoIzq: 'caja', brazoDer: 'caja', caja: 2, ojos: 'apretados', dy: 1, sudor: true },
      { brazoIzq: 'caja', brazoDer: 'caja', caja: 2, ojos: 'apretados', sudor: true },
      { brazoIzq: 'caja', brazoDer: 'caja', caja: 1, ojos: 'apretados' },
    ],
  },
  listo: {
    ms: 220,
    cuadros: [
      { brazoDer: 'saludo', ojos: 'feliz' },
      { brazoDer: 'arriba', ojos: 'feliz', dy: -1 },
      { brazoDer: 'saludo', ojos: 'feliz' },
      { brazoDer: 'arriba', ojos: 'feliz', dy: -1 },
      { brazoDer: 'saludo', ojos: 'feliz' },
      { brazoDer: 'saludo', ojos: 'feliz' },
    ],
  },
  dormido: {
    ms: 450,
    cuadros: [
      { ojos: 'cerrados', dy: 1, zzz: 0 },
      { ojos: 'cerrados', dy: 1, zzz: 1 },
      { ojos: 'cerrados', zzz: 2 },
      { ojos: 'cerrados', zzz: 2 },
      { ojos: 'cerrados', dy: 1 },
    ],
  },
  alerta: {
    ms: 90,
    cuadros: [
      { alerta: true, ojos: 'grandes', dx: -1, brazoIzq: 'medio', brazoDer: 'medio' },
      { alerta: true, ojos: 'grandes', dx: 1, brazoIzq: 'medio', brazoDer: 'medio' },
      { alerta: true, ojos: 'grandes', dx: -1, brazoIzq: 'medio', brazoDer: 'medio', sudor: true },
      { alerta: true, ojos: 'grandes', dx: 1, brazoIzq: 'medio', brazoDer: 'medio', sudor: true },
    ],
  },
  celebrando: {
    ms: 160,
    cuadros: [
      { brazoIzq: 'arriba', brazoDer: 'arriba', ojos: 'feliz', confeti: 0 },
      { brazoIzq: 'arriba', brazoDer: 'arriba', ojos: 'feliz', confeti: 1, dy: -2 },
      { brazoIzq: 'arriba', brazoDer: 'arriba', ojos: 'feliz', confeti: 2, dy: -3 },
      { brazoIzq: 'arriba', brazoDer: 'arriba', ojos: 'feliz', confeti: 0, dy: -2 },
      { brazoIzq: 'medio', brazoDer: 'medio', ojos: 'feliz', confeti: 1 },
      { brazoIzq: 'medio', brazoDer: 'medio', ojos: 'feliz', confeti: 2, dy: 1 },
    ],
  },
}

const cache = new Map<Actividad, string[]>()

/** Los cuadros de una actividad, cada uno como trazos SVG (se generan una vez). */
export function cuadrosDe(actividad: Actividad): string[] {
  let lista = cache.get(actividad)
  if (lista === undefined) {
    lista = ANIMACIONES[actividad].cuadros.map(dibujar)
    cache.set(actividad, lista)
  }
  return lista
}

const ENCABEZADO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" shape-rendering="crispEdges"><title>Toki</title>`

/** Un solo cuadro, quieto. */
export function cuadroSvg(actividad: Actividad, indice = 0): string {
  const lista = cuadrosDe(actividad)
  return `${ENCABEZADO}${lista[indice] ?? lista[0] ?? ''}</svg>`
}

/**
 * La animación completa en un SVG: los cuadros van en fila (una "tira de película")
 * y un animateTransform discreto la desplaza cuadro a cuadro tras una ventana recortada.
 * Así anima sin que el motor redibuje nada.
 */
export function animacionSvg(actividad: Actividad): string {
  const lista = cuadrosDe(actividad)
  const n = lista.length
  const { ms } = ANIMACIONES[actividad]
  const valores = lista.map((_, i) => `${-i * ANCHO} 0`).join(';')
  const tiempos = lista.map((_, i) => (i / n).toFixed(4)).join(';')
  const tira = lista.map((t, i) => (i === 0 ? `<g>${t}</g>` : `<g transform="translate(${i * ANCHO} 0)">${t}</g>`)).join('')
  const dur = ((n * ms) / 1000).toFixed(3)
  return (
    `${ENCABEZADO}<clipPath id="toki-ventana"><rect width="${ANCHO}" height="${ALTO}"/></clipPath>` +
    `<g clip-path="url(#toki-ventana)"><g>` +
    `<animateTransform attributeName="transform" type="translate" values="${valores}" keyTimes="${tiempos}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>` +
    `${tira}</g></g></svg>`
  )
}
