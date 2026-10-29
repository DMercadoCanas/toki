// Toki en pixel art, animado dentro del propio SVG (tira de cuadros + animateTransform).
import type { Actividad } from './mascota'
import { animacionSvg } from './toki-pixel'

export function tokiSvg(actividad: Actividad): string {
  return animacionSvg(actividad)
}


/** El anillo del contexto de la barra en la app: el arco crece con el %, y Toki va dentro. */
export function anilloSvg(actividad: Actividad, pct: number | undefined): string {
  const r = 26
  const vuelta = 2 * Math.PI * r
  const lleno = Math.max(0, Math.min(100, pct ?? 0)) / 100
  const color = pct === undefined ? '#8f8d86' : pct >= 80 ? '#ef6a6a' : pct >= 50 ? '#e5a63d' : '#5fb37c'
  const arco = lleno > 0 ? `<circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(vuelta * lleno).toFixed(1)} ${vuelta.toFixed(1)}" transform="rotate(-90 28 28)"/>` : ''
  const toki = tokiSvg(actividad).replace('<svg ', '<svg x="9" y="9" width="38" height="38" ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><title>Toki</title><circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(143,141,134,0.35)" stroke-width="3.5"/>${arco}${toki}</svg>`
}
