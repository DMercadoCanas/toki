// Toki en pixel art: cada cuadro se dibuja en una cuadrícula de 32×32 y se serializa
// como SVG (un <path> por color, con bordes nítidos). Sin dependencias ni imágenes.
//
// Diseño "Cápsula visera · aspiradora": cuerpo bajo y compacto con visor de banda completa y
// ojos anchos, orugas tipo WALL-E vistas de frente, brazos finos con hombro articulado y
// manos de garra de dos pinzas, hoja en el pecho, brote fijo en la cabeza y audífonos discretos.
// Cada parte se pega con su propio contorno de 1 px para que se lea a 64 px.
import type { Actividad } from './mascota'

export const ANCHO = 32
export const ALTO = 32

const C = {
  azul: '#3f84dc',
  azulO: '#2a5cad',
  azulC: '#8cc0f5',
  borde: '#0e1a33',
  marino: '#172744',
  marinoC: '#2e4a7a',
  naranja: '#f39a3d',
  naranjaO: '#b85f14',
  naranjaC: '#ffc27a',
  gris: '#aab3bd',
  grisO: '#5b646d',
  blanco: '#f6f8fb',
  cian: '#5fe3ea',
  verde: '#3cc46a',
  verdeO: '#1f8a45',
  verdeC: '#9af0b4',
  rojo: '#ff5c5c',
  amarillo: '#ffd84d',
  amarilloO: '#b8891a',
  humo: '#c3cad2',
  cafe: '#8a5a2b',
  cafeO: '#5a3817',
  crema: '#f1dcb8',
} as const

type Ojos = 'normal' | 'parpadeo' | 'feliz' | 'cerrados' | 'apretados' | 'grandes'
type Pose = 'abajo' | 'dormido' | 'medio' | 'arriba' | 'cabeza' | 'barbilla' | 'caja' | 'aspiradora'

export interface Cuadro {
  /** Desplazamiento horizontal del cuerpo (temblor o paso al lado). */
  dx?: number
  /** Desplazamiento vertical del cuerpo (rebote). */
  dy?: number
  ojos?: Ojos
  /** Hacia dónde miran los ojos. */
  mx?: number
  my?: number
  pose?: Pose
  /** Paso de la animación de trabajo (0..5). */
  paso?: number
  /** Caja de tokens comprimida: 0 ancha … 2 apretada. */
  caja?: number
  /** Zetas del sueño (0..2). */
  zzz?: number
  /** Cuerpo rojo (alerta). */
  alerta?: boolean
  /** Confeti (0..2). */
  confeti?: number
  /** Gota de sudor. */
  sudor?: boolean
  /** Burbuja de pensar. */
  burbuja?: boolean
}

class Lienzo {
  readonly celdas: (string | null)[] = new Array<string | null>(ANCHO * ALTO).fill(null)
  px(x: number, y: number, c: string): void {
    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return
    this.celdas[y * ANCHO + x] = c
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return null
    return this.celdas[y * ANCHO + x] ?? null
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
  /** Pega otra capa encima, dibujándole antes un contorno de 1 px. */
  pegar(capa: Lienzo, borde: string = C.borde): void {
    for (let y = 0; y < ALTO; y++)
      for (let x = 0; x < ANCHO; x++) {
        if (capa.get(x, y) !== null) continue
        if (capa.get(x - 1, y) !== null || capa.get(x + 1, y) !== null || capa.get(x, y - 1) !== null || capa.get(x, y + 1) !== null) this.px(x, y, borde)
      }
    for (let i = 0; i < ANCHO * ALTO; i++) {
      const c = capa.celdas[i]
      if (c !== null && c !== undefined) this.celdas[i] = c
    }
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

const parte = (l: Lienzo, fn: (k: Lienzo) => void, borde?: string): void => {
  const k = new Lienzo()
  fn(k)
  l.pegar(k, borde)
}

// ---- Geometría base: cuerpo x 8..23, y 9..25; hombros en y 20; suelo en y 30 ----
const G = { x: 8, y: 9, w: 16, h: 17, visorY: 2, visorH: 5, ojosY: 3, audif: 3, ojoW: 3, ojoSep: 1 } as const
const SUELO = 30

// ---- Adornos ----
function zetas(l: Lienzo, x: number, y: number, paso: number): void {
  const z = (zx: number, zy: number, c: string): void => {
    l.rect(zx, zy, 3, 1, c)
    l.px(zx + 1, zy + 1, c)
    l.rect(zx, zy + 2, 3, 1, c)
  }
  if (paso >= 0) z(x, y - paso, C.humo)
  if (paso >= 1) z(x + 3, y - 3 - (paso - 1), C.blanco)
}
function confeti(l: Lienzo, paso: number): void {
  const p: [number, number, string][] = [
    [3, 3, C.amarillo],
    [28, 5, C.cian],
    [6, 1, C.verde],
    [24, 1, C.rojo],
    [1, 9, C.cian],
    [30, 10, C.amarillo],
  ]
  for (const [x, y, c] of p) l.px(x, (y + paso * 3) % 14, c)
}
function sudor(l: Lienzo, x: number, y: number): void {
  l.px(x, y, C.cian)
  l.rect(x - 1, y + 1, 2, 2, C.cian)
}
function burbuja(l: Lienzo, x: number, y: number): void {
  l.px(x, y, C.blanco)
  l.px(x + 2, y - 2, C.blanco)
  l.rect(x + 3, y - 5, 3, 3, C.blanco)
  l.px(x + 4, y - 4, C.humo)
}
function token(l: Lienzo, x: number, y: number): void {
  l.rect(x, y, 2, 2, C.amarillo)
  l.px(x, y, C.blanco)
}
function caja(l: Lienzo, x: number, y: number, w: number, nivel: number): void {
  parte(l, (k) => {
    k.rect(x, y, w, 8, C.naranja)
    k.rect(x, y, w, 2, C.naranjaC)
    k.rect(x + Math.floor(w / 2) - 1, y, 2, 8, C.naranjaO)
    k.rect(x, y + 4, w, 1, C.naranjaO)
  })
  if (nivel > 0) {
    l.px(x - 2, y + 1, C.humo)
    l.px(x - 2, y + 6, C.humo)
    l.px(x + w + 1, y + 1, C.humo)
    l.px(x + w + 1, y + 6, C.humo)
  }
}

/** Aspiradora: manguera anillada desde la mano hasta la boquilla, que chupa tokens del suelo. */
function aspiradora(l: Lienzo, hx: number, hy: number, paso: number): void {
  const n = SUELO - 2 - (hy + 3)
  parte(l, (k) => {
    k.rect(hx, hy, 2, 3, C.grisO)
    k.px(hx, hy, C.gris)
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1)
      const dx = -Math.round(Math.sin(t * Math.PI) * 2.2)
      k.rect(hx + dx, hy + 3 + i, 2, 1, i % 2 ? C.azulO : C.azul)
    }
  })
  const bx = hx - 5 + (paso % 3 === 1 ? 1 : 0)
  parte(l, (k) => {
    k.rect(bx, SUELO - 3, 8, 3, C.azulO)
    k.rect(bx + 1, SUELO - 3, 6, 1, C.azul)
    k.px(bx + 1, SUELO - 3, C.azulC)
    k.rect(bx - 1, SUELO, 10, 1, C.grisO)
    for (let i = 0; i < 10; i += 2) k.px(bx - 1 + i, SUELO, C.gris)
  })
  // Rachas de aire que entran a la boquilla
  for (let j = 0; j < 3; j++) {
    const f = (paso + j * 2) % 6
    l.rect(bx - 3 - f, SUELO - 3 + j, 2, 1, C.humo)
  }
  token(l, bx - 8 + ((paso * 2) % 7), SUELO - 2)
  l.px(bx - 9, SUELO - 1, C.amarilloO)
  l.px(bx - 11, SUELO - 1, C.amarilloO)
}

// ---- Partes del cuerpo ----
function orugas(l: Lienzo, x: number, y: number, paso: number): void {
  const top = y + G.h - 5
  for (const tx of [x - 2, x + G.w - 4])
    parte(l, (k) => {
      k.redondo(tx, top, 6, 8, C.marino, 1)
      for (let j = 0; j < 8; j++) if ((j + paso) % 2 === 0) k.rect(tx + 1, top + j, 4, 1, C.marinoC)
      k.rect(tx + 1, top, 1, 8, C.grisO)
      k.rect(tx + 4, top, 1, 8, C.grisO)
    })
}
function plantita(l: Lienzo, cx: number, y: number): void {
  parte(l, (k) => {
    k.rect(cx - 2, y - 2, 5, 2, C.cafe)
    k.rect(cx - 1, y - 2, 3, 1, C.cafeO)
  })
  l.rect(cx, y - 5, 1, 3, C.verdeO)
  l.px(cx - 1, y - 5, C.verde)
  l.px(cx - 2, y - 5, C.verde)
  l.px(cx - 2, y - 6, C.verde)
  l.px(cx - 3, y - 6, C.verdeO)
  l.px(cx + 1, y - 6, C.verde)
  l.px(cx + 2, y - 6, C.verdeC)
  l.px(cx + 2, y - 7, C.verde)
  l.px(cx + 3, y - 7, C.verdeO)
  l.px(cx, y - 6, C.verdeC)
}
/** Hoja del pecho: placa clara con una hoja inclinada, nervio central y tallo. */
function hoja(l: Lienzo, cx: number, py: number): void {
  parte(
    l,
    (k) => {
      k.redondo(cx - 5, py, 10, 7, C.crema, 1)
      k.rect(cx - 4, py + 5, 8, 1, C.humo)
      k.px(cx + 4, py + 1, C.humo)
    },
    C.azulO,
  )
  const filas = ['......##', '....####', '..######', '.######.', '.#####..', '.###....']
  filas.forEach((f, j) => {
    for (let i = 0; i < f.length; i++) if (f[i] === '#') l.px(cx - 4 + i, py + j, C.verde)
  })
  for (const [i, j] of [[6, 1], [5, 2], [4, 3], [3, 4], [2, 5]] as const) l.px(cx - 4 + i, py + j, C.verdeC)
  for (const [i, j] of [[1, 3], [1, 4], [2, 2], [4, 1]] as const) l.px(cx - 4 + i, py + j, C.verdeO)
  l.px(cx - 3, py + 5, C.verdeO)
  l.px(cx - 4, py + 6, C.verdeO)
}
/** Mano de garra de dos pinzas (4×3 o 3×4). dir: hacia dónde apunta. */
function garra(k: Lienzo, x: number, y: number, dir: 'abajo' | 'arriba' | 'der' | 'izq'): void {
  const c = C.gris
  const o = C.grisO
  if (dir === 'abajo') {
    k.rect(x + 1, y, 2, 1, c); k.rect(x, y + 1, 1, 2, c); k.rect(x + 3, y + 1, 1, 2, c)
    k.px(x, y + 2, o); k.px(x + 3, y + 2, o); k.px(x + 1, y, C.humo)
  } else if (dir === 'arriba') {
    k.rect(x + 1, y + 2, 2, 1, c); k.rect(x, y, 1, 2, c); k.rect(x + 3, y, 1, 2, c)
    k.px(x, y, o); k.px(x + 3, y, o); k.px(x + 1, y + 2, C.humo)
  } else if (dir === 'der') {
    k.rect(x, y + 1, 1, 2, c); k.rect(x + 1, y, 2, 1, c); k.rect(x + 1, y + 3, 2, 1, c)
    k.px(x + 2, y, o); k.px(x + 2, y + 3, o); k.px(x, y + 1, C.humo)
  } else {
    k.rect(x + 2, y + 1, 1, 2, c); k.rect(x, y, 2, 1, c); k.rect(x, y + 3, 2, 1, c)
    k.px(x, y, o); k.px(x, y + 3, o); k.px(x + 2, y + 1, C.humo)
  }
}
/** Brazos finos con hombro articulado. Las poses de trabajo dibujan su herramienta. */
function brazos(l: Lienzo, c: Cuadro, x: number, y: number): void {
  const pose = c.pose ?? 'abajo'
  const paso = c.paso ?? 0
  const hombroY = y + G.visorY + G.visorH + 4
  const cx = x + G.w / 2
  const barbillaY = y + G.visorY + G.visorH - 1
  const uno = (lado: 'izq' | 'der'): void => {
    const s = lado === 'izq' ? -1 : 1
    const bx = lado === 'izq' ? x - 2 : x + G.w
    const brazo = (k: Lienzo, x0: number, y0: number, h: number): void => {
      k.rect(x0, y0, 2, h, C.gris)
      k.rect(x0 + (s > 0 ? 1 : 0), y0, 1, h, C.grisO)
    }
    const abajo = (k: Lienzo, extra = 0): void => {
      brazo(k, bx, hombroY + extra, 7)
      garra(k, bx - 1, hombroY + 7 + extra, 'abajo')
    }
    const sostener = (k: Lienzo): void => {
      brazo(k, bx, hombroY - 2, 3)
      k.rect(bx + 2, hombroY - 3, 3, 2, C.gris)
      k.px(bx + 3, hombroY - 2, C.grisO)
      garra(k, bx + 4, hombroY - 3, 'abajo')
    }
    const arriba = (k: Lienzo): void => {
      brazo(k, bx, hombroY - 1, 2)
      k.rect(bx + s * 2, hombroY - 6, 2, 6, C.gris)
      k.rect(bx + s * 2 + (s > 0 ? 1 : 0), hombroY - 6, 1, 6, C.grisO)
      garra(k, bx + s * 2 - 1, hombroY - 9, 'arriba')
    }
    parte(l, (k) => {
      switch (pose) {
        case 'abajo':
          abajo(k)
          break
        case 'dormido':
          abajo(k, 1)
          break
        case 'medio':
          brazo(k, bx, hombroY, 3)
          k.rect(bx + s * 2, hombroY + 1, 2, 2, C.gris)
          garra(k, lado === 'izq' ? bx - 5 : bx + 4, hombroY, lado === 'izq' ? 'izq' : 'der')
          break
        case 'arriba':
        case 'cabeza':
          arriba(k)
          break
        case 'barbilla':
          if (lado === 'izq') {
            brazo(k, bx, hombroY, 2)
            k.rect(bx + 2, hombroY - 1, 2, 2, C.gris)
            garra(k, x + 1, barbillaY - 1, 'arriba')
          } else abajo(k)
          break
        case 'caja': {
          const cw = 12 - (c.caja ?? 0) * 2
          const cxx = cx - cw / 2
          brazo(k, bx, hombroY, 2)
          if (lado === 'izq') {
            k.rect(bx, hombroY + 2, cxx - 3 - bx + 1, 2, C.gris)
            garra(k, cxx - 3, hombroY + 1, 'der')
          } else {
            k.rect(cxx + cw + 2, hombroY + 2, bx - (cxx + cw + 2) + 2, 2, C.gris)
            garra(k, cxx + cw, hombroY + 1, 'izq')
          }
          break
        }
        case 'aspiradora':
          if (lado === 'izq') abajo(k)
          else sostener(k)
          break
      }
    })
  }
  if (pose === 'caja') {
    const cw = 12 - (c.caja ?? 0) * 2
    caja(l, cx - cw / 2, hombroY, cw, c.caja ?? 0)
  }
  uno('izq')
  if (pose === 'aspiradora') aspiradora(l, x + G.w + 5, hombroY, paso)
  uno('der')
}

function ojos(l: Lienzo, c: Cuadro, x: number, y: number): void {
  const tipo = c.ojos ?? 'normal'
  const mx = c.mx ?? 0
  const my = c.my ?? 0
  const cx = x + G.w / 2
  const ey = y + G.ojosY + my
  const ew = G.ojoW
  const li = cx - G.ojoSep - ew + mx
  const ld = cx + G.ojoSep + mx
  if (tipo === 'parpadeo' || tipo === 'cerrados') {
    l.rect(li, ey + 1, ew, 1, C.cian)
    l.rect(ld, ey + 1, ew, 1, C.cian)
  } else if (tipo === 'feliz') {
    l.rect(li, ey, ew, 1, C.cian)
    l.rect(ld, ey, ew, 1, C.cian)
    l.px(li - 1, ey + 1, C.cian)
    l.px(li + ew, ey + 1, C.cian)
    l.px(ld - 1, ey + 1, C.cian)
    l.px(ld + ew, ey + 1, C.cian)
  } else if (tipo === 'apretados') {
    l.rect(li, ey, ew, 1, C.cian)
    l.rect(ld, ey, ew, 1, C.cian)
    l.px(li + ew - 1, ey + 1, C.cian)
    l.px(ld, ey + 1, C.cian)
  } else {
    const gr = tipo === 'grandes' ? 1 : 0
    l.rect(li, ey - gr, ew, 2 + gr, C.cian)
    l.rect(ld, ey - gr, ew, 2 + gr, C.cian)
    l.px(li, ey - gr, C.blanco)
    l.px(ld, ey - gr, C.blanco)
  }
}

export function dibujar(c: Cuadro): string {
  const l = new Lienzo()
  const x = G.x + (c.dx ?? 0)
  const y = G.y + (c.dy ?? 0)
  const w = G.w
  const h = G.h
  const cx = x + w / 2
  if (c.zzz !== undefined) zetas(l, x + w + 1, y + 2, c.zzz)
  if (c.confeti !== undefined) confeti(l, c.confeti)
  if (c.burbuja === true) burbuja(l, x + w, y + 3)
  orugas(l, x, y, c.pose === 'aspiradora' ? (c.paso ?? 0) : 0)
  parte(l, (k) => {
    k.redondo(x, y, w, h, c.alerta === true ? C.rojo : C.azul, 3)
    k.rect(x + w - 2, y + 3, 1, h - 6, C.azulO)
    k.rect(x + 3, y + h - 1, w - 6, 1, C.azulO)
    k.rect(x + w - 3, y + h - 2, 2, 1, C.azulO)
    k.rect(x + 1, y + 3, 1, 6, C.azulC)
    k.rect(x + 2, y + 2, 2, 1, C.azulC)
    k.rect(x + 1, y + G.visorY + G.visorH + 2, w - 2, 1, C.azulO)
  })
  plantita(l, cx, y)
  hoja(l, cx, y + G.visorY + G.visorH + 4)
  parte(l, (k) => {
    k.rect(x - 1, y + G.audif, 2, 4, C.naranja)
    k.rect(x + w - 1, y + G.audif, 2, 4, C.naranja)
    k.px(x - 1, y + G.audif, C.naranjaC)
    k.px(x + w, y + G.audif, C.naranjaC)
  })
  parte(
    l,
    (k) => {
      k.rect(x + 1, y + G.visorY, w - 2, G.visorH, C.marino)
      k.px(x + 2, y + G.visorY + 1, C.marinoC)
      k.rect(x + 3, y + G.visorY + G.visorH - 2, w - 6, 1, C.marinoC)
    },
    C.marino,
  )
  ojos(l, c, x, y)
  const hombroY = y + G.visorY + G.visorH + 4
  for (const sx of [x, x + w - 2]) {
    l.rect(sx, hombroY - 1, 2, 3, C.azulO)
    l.px(sx + (sx === x ? 0 : 1), hombroY, C.gris)
    l.px(sx + (sx === x ? 1 : 0), hombroY, C.marinoC)
  }
  brazos(l, c, x, y)
  if (c.sudor === true) sudor(l, x + w - 1, y - 1)
  return l.trazos()
}

export interface Animacion {
  /** Milisegundos por cuadro. */
  ms: number
  cuadros: Cuadro[]
}

const reposo = (e: Cuadro = {}): Cuadro[] => [{ ...e }, { ...e }, { ...e, dy: -1 }, { ...e, dy: -1 }, { ...e, dy: -1, ojos: 'parpadeo' }, { ...e, dy: -1 }, { ...e }, { ...e, mx: 1 }]
const pensar = (): Cuadro[] => [0, 1, 2, 3, 4, 5].map((i): Cuadro => ({ pose: 'barbilla', mx: 1, my: -1, burbuja: i < 4, dy: i === 1 || i === 2 ? -1 : 0, ojos: i === 5 ? 'parpadeo' : 'normal' }))
const dormir = (): Cuadro[] => [
  { ojos: 'cerrados', dy: 1, zzz: 0, pose: 'dormido' },
  { ojos: 'cerrados', dy: 1, zzz: 1, pose: 'dormido' },
  { ojos: 'cerrados', zzz: 2, pose: 'dormido' },
  { ojos: 'cerrados', zzz: 2, pose: 'dormido' },
  { ojos: 'cerrados', dy: 1, pose: 'dormido' },
]
const alertar = (): Cuadro[] => [0, 1, 2, 3].map((i): Cuadro => ({ alerta: true, ojos: 'grandes', dx: i % 2 ? 1 : -1, sudor: i >= 2, pose: 'cabeza' }))
const celebrar = (): Cuadro[] =>
  [
    { dy: 0, c: 0 },
    { dy: -2, c: 1 },
    { dy: -3, c: 2 },
    { dy: -2, c: 0 },
    { dy: 0, c: 1 },
    { dy: 1, c: 2 },
  ].map(({ dy, c }, i): Cuadro => ({ ojos: 'feliz', confeti: c, dy, pose: i < 4 ? 'arriba' : 'medio' }))
const compactar = (): Cuadro[] =>
  [{ caja: 0 }, { caja: 1, dy: 1 }, { caja: 2, dy: 1, sudor: true }, { caja: 2, sudor: true }, { caja: 1 }, { caja: 0 }].map((c): Cuadro => ({ ...c, ojos: c.caja === 0 ? 'normal' : 'apretados', pose: 'caja' }))
const aspirar = (dy = 0): Cuadro[] => [0, 1, 2, 3, 4, 5].map((i): Cuadro => ({ pose: 'aspiradora', paso: i, dx: -4, dy: i % 2 ? dy : 0, mx: 1, my: 1, ojos: i === 4 ? 'parpadeo' : 'normal' }))
const mirar = (ojos: Ojos, puntos: [number, number][]): Cuadro[] => puntos.map(([mx, my], i): Cuadro => ({ mx, my, ojos: i === puntos.length - 1 && ojos === 'normal' ? 'parpadeo' : ojos }))

export const ANIMACIONES: Record<Actividad, Animacion> = {
  tranquilo: { ms: 260, cuadros: reposo() },
  esperando: { ms: 220, cuadros: reposo({ ojos: 'grandes' }) },
  pensando: { ms: 300, cuadros: pensar() },
  leyendo: { ms: 180, cuadros: mirar('normal', [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [2, 1], [-2, 1]]) },
  buscando: { ms: 120, cuadros: mirar('grandes', [[-2, 0], [-1, -1], [1, -1], [2, 0], [1, 1], [-1, 1]]) },
  ejecutando: { ms: 160, cuadros: aspirar() },
  editando: { ms: 160, cuadros: aspirar(-1) },
  compactando: { ms: 200, cuadros: compactar() },
  listo: {
    ms: 220,
    cuadros: [
      { pose: 'medio', ojos: 'feliz' },
      { pose: 'arriba', ojos: 'feliz', dy: -1 },
      { pose: 'medio', ojos: 'feliz' },
      { pose: 'arriba', ojos: 'feliz', dy: -1 },
      { pose: 'medio', ojos: 'feliz' },
      { pose: 'medio', ojos: 'feliz' },
    ],
  },
  dormido: { ms: 450, cuadros: dormir() },
  alerta: { ms: 90, cuadros: alertar() },
  celebrando: { ms: 160, cuadros: celebrar() },
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
