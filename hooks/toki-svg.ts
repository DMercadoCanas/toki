// Toki en vector, para la app de escritorio (la terminal usa los cuadros de texto).
// Una alcancía redonda con ojos y un accesorio según lo que Claude hace.
// Usa animación SMIL (respira, parpadea), que funciona con `isInteractive`.

import type { Actividad } from './mascota'

const ROSA = '#f29aa8'
const ROSA_OSCURO = '#d9788a'
const OJO = '#2b2b2b'
const ORO = '#f4c35b'

function ojos(actividad: Actividad): string {
  switch (actividad) {
    case 'dormido':
      return `<path d="M15 19 q3 2 6 0" stroke="${OJO}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M27 19 q3 2 6 0" stroke="${OJO}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    case 'listo':
    case 'celebrando':
      return `<path d="M15 20 q3 -3 6 0" stroke="${OJO}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M27 20 q3 -3 6 0" stroke="${OJO}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    case 'compactando':
      return `<path d="M15 17 l6 3 l-6 3" stroke="${OJO}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M33 17 l-6 3 l6 3" stroke="${OJO}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'esperando':
    case 'alerta':
      return `<circle cx="18" cy="19" r="3" fill="${OJO}"/><circle cx="30" cy="19" r="3" fill="${OJO}"/><circle cx="19" cy="18" r="1" fill="#fff"/><circle cx="31" cy="18" r="1" fill="#fff"/>`
    case 'leyendo':
    case 'buscando':
      return `<circle cx="18" cy="19" r="2.6" fill="${OJO}"><animate attributeName="cx" values="17;19;17" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="30" cy="19" r="2.6" fill="${OJO}"><animate attributeName="cx" values="29;31;29" dur="1.6s" repeatCount="indefinite"/></circle>`
    default:
      // Ojos normales que parpadean cada ~4 s.
      return `<g><circle cx="18" cy="19" r="2.4" fill="${OJO}"/><circle cx="30" cy="19" r="2.4" fill="${OJO}"/><animate attributeName="opacity" values="1;1;0;1;1" keyTimes="0;0.9;0.93;0.96;1" dur="4s" repeatCount="indefinite"/></g><g opacity="0"><path d="M15 19 h6" stroke="${OJO}" stroke-width="1.8" stroke-linecap="round"/><path d="M27 19 h6" stroke="${OJO}" stroke-width="1.8" stroke-linecap="round"/><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.9;0.93;0.96;1" dur="4s" repeatCount="indefinite"/></g>`
  }
}

function boca(actividad: Actividad): string {
  if (actividad === 'alerta' || actividad === 'esperando') return `<ellipse cx="24" cy="29" rx="2.2" ry="2.8" fill="${ROSA_OSCURO}"/>`
  if (actividad === 'celebrando') return `<path d="M20 27.5 q4 5 8 0 z" fill="${ROSA_OSCURO}"/>`
  if (actividad === 'dormido' || actividad === 'pensando') return `<path d="M21 29 h6" stroke="${ROSA_OSCURO}" stroke-width="1.6" stroke-linecap="round"/>`
  return `<path d="M20 28 q4 4 8 0" stroke="${ROSA_OSCURO}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
}

function accesorio(actividad: Actividad): string {
  switch (actividad) {
    case 'pensando':
      return `<g fill="#9aa4b2"><circle cx="40" cy="12" r="1.6"><animate attributeName="opacity" values="0;1;1;0" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="44" cy="7" r="2.2"><animate attributeName="opacity" values="0;0;1;0" dur="1.5s" repeatCount="indefinite"/></circle></g>`
    case 'leyendo':
      return `<g transform="translate(37 3)"><rect x="0" y="0" width="10" height="8" rx="1" fill="#fff" stroke="#9aa4b2"/><path d="M2 2.5 h6 M2 4.5 h6 M2 6.5 h4" stroke="#9aa4b2" stroke-width="0.8"/></g>`
    case 'buscando':
      return `<g transform="translate(38 3)"><circle cx="4" cy="4" r="3.2" fill="none" stroke="#9aa4b2" stroke-width="1.4"/><path d="M6.5 6.5 l3 3" stroke="#9aa4b2" stroke-width="1.6" stroke-linecap="round"/><animateTransform attributeName="transform" type="translate" values="38 3;40 4;38 3" dur="1.4s" repeatCount="indefinite"/></g>`
    case 'ejecutando':
      return `<g transform="translate(42 7)"><circle r="3.5" fill="none" stroke="#9aa4b2" stroke-width="1.6" stroke-dasharray="6 5"/><animateTransform attributeName="transform" type="rotate" from="0 42 7" to="360 42 7" dur="1.2s" repeatCount="indefinite" additive="sum"/></g>`
    case 'editando':
      return `<g transform="translate(38 2)"><path d="M2 8 l6 -6 l2 2 l-6 6 z" fill="${ORO}" stroke="#b98d2e" stroke-width="0.8"/><path d="M2 8 l-0.6 2.6 l2.6 -0.6" fill="#b98d2e"/><animateTransform attributeName="transform" type="translate" values="38 2;39 3;38 2" dur="0.8s" repeatCount="indefinite"/></g>`
    case 'compactando':
      return `<g fill="#9aa4b2"><path d="M38 9 l4 -3 v6 z"><animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite"/></path><path d="M43 9 l4 -3 v6 z"><animate attributeName="opacity" values="0.3;1;0.3" dur="0.9s" repeatCount="indefinite"/></path></g>`
    case 'esperando':
      return `<text x="39" y="12" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#9aa4b2">?<animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></text>`
    case 'listo':
      return `<path d="M38 8 l3 3 l6 -6" fill="none" stroke="#3fb950" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'dormido':
      return `<g font-family="system-ui, sans-serif" font-weight="700" fill="#9aa4b2"><text x="38" y="12" font-size="7">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text><text x="42" y="7" font-size="9">z<animate attributeName="opacity" values="0;0;1;0" dur="2.4s" repeatCount="indefinite"/></text></g>`
    case 'celebrando':
      return confeti()
    case 'alerta':
      return `<text x="40" y="12" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#e5484d">!<animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite"/></text>`
    default:
      return ''
  }
}

/** Confeti que cae y una estrella que brilla: un logro desbloqueado. */
function confeti(): string {
  const piezas: [number, string, string][] = [
    [6, '#f4c35b', '0s'],
    [14, '#3fb950', '0.35s'],
    [36, '#58a6ff', '0.15s'],
    [44, '#f29aa8', '0.5s'],
    [26, '#bc8cff', '0.7s'],
  ]
  const caen = piezas
    .map(
      ([x, color, inicio]) =>
        `<rect x="${x}" y="0" width="2.4" height="3.4" rx="0.6" fill="${color}"><animate attributeName="y" values="-4;34" dur="1.4s" begin="${inicio}" repeatCount="indefinite"/><animateTransform attributeName="transform" type="rotate" values="0 ${x + 1} 4;180 ${x + 1} 18;360 ${x + 1} 32" dur="1.4s" begin="${inicio}" repeatCount="indefinite"/></rect>`,
    )
    .join('')
  const estrella = `<path d="M42 2 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 z" fill="${ORO}"><animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/></path>`
  return caen + estrella
}

/** El SVG completo de Toki para un estado. ~50×36 px. */
export function tokiSvg(actividad: Actividad): string {
  // Respira; dormido, más lento; celebrando, da saltitos.
  const respira = actividad === 'dormido' ? 'values="0 0;0 -0.8;0 0" dur="3.2s"' : actividad === 'celebrando' ? 'values="0 0;0 -2.6;0 0" dur="0.6s"' : 'values="0 0;0 -0.8;0 0" dur="2s"'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 36" width="50" height="36">` +
    `<g><animateTransform attributeName="transform" type="translate" ${respira} repeatCount="indefinite"/>` +
    // orejas
    `<path d="M11 13 l-2 -7 l7 4 z" fill="${ROSA_OSCURO}"/><path d="M37 13 l2 -7 l-7 4 z" fill="${ROSA_OSCURO}"/>` +
    // cuerpo
    `<ellipse cx="24" cy="22" rx="16" ry="13" fill="${ROSA}"/>` +
    // ranura de la moneda
    `<rect x="19" y="8.5" width="10" height="2" rx="1" fill="${ROSA_OSCURO}"/>` +
    // moneda entrando (solo cuando acaba de ahorrar)
    (actividad === 'listo' ? `<circle cx="24" cy="6" r="3" fill="${ORO}" stroke="#b98d2e" stroke-width="0.8"><animate attributeName="cy" values="2;8;8" dur="1.2s" repeatCount="indefinite"/></circle>` : '') +
    // patas
    `<rect x="13" y="32" width="5" height="3.5" rx="1.5" fill="${ROSA_OSCURO}"/><rect x="30" y="32" width="5" height="3.5" rx="1.5" fill="${ROSA_OSCURO}"/>` +
    // hocico
    `<ellipse cx="24" cy="24.5" rx="5" ry="3.6" fill="${ROSA_OSCURO}"/><circle cx="22.3" cy="24.5" r="0.9" fill="${OJO}"/><circle cx="25.7" cy="24.5" r="0.9" fill="${OJO}"/>` +
    ojos(actividad) +
    boca(actividad) +
    `</g>` +
    accesorio(actividad) +
    `</svg>`
  )
}
