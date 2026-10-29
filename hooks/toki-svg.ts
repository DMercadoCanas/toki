// Toki en pixel art, animado dentro del propio SVG (tira de cuadros + animateTransform).
import type { Actividad } from './mascota'
import { animacionSvg } from './toki-pixel'

export function tokiSvg(actividad: Actividad): string {
  return animacionSvg(actividad)
}

