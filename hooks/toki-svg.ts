// Toki en vector, para la app de escritorio (la terminal usa caras de texto).
// Un robot de limpieza: cabeza con pantalla y cara luminosa, audífonos naranjas,
// un depósito transparente con el símbolo de reciclaje, ruedas y una aspiradora.
// Aspira el ruido de las salidas para que Claude lea solo lo que importa.
// Usa animación SMIL (flota, parpadea, aspira), que funciona con `isInteractive`.

import type { Actividad } from './mascota'

const AZUL = '#4f86c6'
const AZUL_OSCURO = '#2c4f7d'
const NARANJA = '#f39a3d'
const NARANJA_OSCURO = '#b9651d'
const PANTALLA = '#17202e'
const CIAN = '#5fe3ea'
const MEJILLA = '#f08a9c'
const GRIS = '#9aa4b5'
const GRIS_OSCURO = '#5d6678'
const LLANTA = '#2a2f3b'
const VERDE = '#34a853'
const ROJO = '#e5484d'

/** Los ojos en la pantalla. */
function ojos(a: Actividad): string {
  const trazo = `stroke="${CIAN}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  switch (a) {
    case 'listo':
    case 'celebrando':
      return `<path d="M23.8 14.6 q2.2 -2.9 4.4 0" ${trazo}/><path d="M33.8 14.6 q2.2 -2.9 4.4 0" ${trazo}/>`
    case 'dormido':
      return `<g opacity="0.6"><path d="M23.8 13.6 q2.2 1.6 4.4 0" ${trazo}/><path d="M33.8 13.6 q2.2 1.6 4.4 0" ${trazo}/></g>`
    case 'compactando':
      return `<path d="M24 11.6 l3.6 2 l-3.6 2" ${trazo}/><path d="M38 11.6 l-3.6 2 l3.6 2" ${trazo}/>`
    case 'esperando':
    case 'alerta':
      return `<circle cx="26" cy="13.4" r="2.6" fill="${CIAN}"/><circle cx="36" cy="13.4" r="2.6" fill="${CIAN}"/><circle cx="26.9" cy="12.5" r="0.8" fill="#fff"/><circle cx="36.9" cy="12.5" r="0.8" fill="#fff"/>`
    case 'leyendo':
    case 'buscando':
      return `<circle cx="26" cy="13.6" r="2.1" fill="${CIAN}"><animate attributeName="cx" values="25;27;25" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="36" cy="13.6" r="2.1" fill="${CIAN}"><animate attributeName="cx" values="35;37;35" dur="1.6s" repeatCount="indefinite"/></circle>`
    case 'pensando':
      return `<circle cx="27" cy="12.6" r="2" fill="${CIAN}"/><circle cx="37" cy="12.6" r="2" fill="${CIAN}"/>`
    default:
      // Ojos normales que parpadean cada ~4 s.
      return (
        `<g><circle cx="26" cy="13.6" r="2.1" fill="${CIAN}"/><circle cx="36" cy="13.6" r="2.1" fill="${CIAN}"/><animate attributeName="opacity" values="1;1;0;1;1" keyTimes="0;0.9;0.93;0.96;1" dur="4s" repeatCount="indefinite"/></g>` +
        `<g opacity="0"><path d="M24 13.6 h4" ${trazo}/><path d="M34 13.6 h4" ${trazo}/><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.9;0.93;0.96;1" dur="4s" repeatCount="indefinite"/></g>`
      )
  }
}

/** La boca en la pantalla. */
function boca(a: Actividad): string {
  if (a === 'celebrando') return `<path d="M27.4 17.4 q3.6 4.4 7.2 0 z" fill="${CIAN}"/>`
  if (a === 'esperando' || a === 'alerta') return `<ellipse cx="31" cy="18.6" rx="1.3" ry="1.6" fill="${CIAN}"/>`
  if (a === 'dormido' || a === 'pensando') return `<path d="M29 18.6 h4" stroke="${CIAN}" stroke-width="1.3" stroke-linecap="round" opacity="${a === 'dormido' ? 0.6 : 1}"/>`
  if (a === 'compactando') return `<path d="M28.6 18.2 q2.4 1.6 4.8 0" stroke="${CIAN}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
  return `<path d="M27.6 17.6 q3.4 3 6.8 0" stroke="${CIAN}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
}

/** Lo que Toki muestra arriba a la derecha según lo que Claude hace. */
function accesorio(a: Actividad): string {
  switch (a) {
    case 'pensando':
      return `<g fill="${GRIS}"><circle cx="54" cy="8" r="1.6"><animate attributeName="opacity" values="0;1;1;0" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="58.5" cy="3.8" r="2.2"><animate attributeName="opacity" values="0;0;1;0" dur="1.5s" repeatCount="indefinite"/></circle></g>`
    case 'leyendo':
      return `<g transform="translate(53 1)"><rect x="0" y="0" width="10" height="8" rx="1" fill="#fff" stroke="${GRIS}"/><path d="M2 2.5 h6 M2 4.5 h6 M2 6.5 h4" stroke="${GRIS}" stroke-width="0.8"/></g>`
    case 'buscando':
      return `<g transform="translate(54 1)"><circle cx="4" cy="4" r="3.2" fill="none" stroke="${GRIS}" stroke-width="1.4"/><path d="M6.5 6.5 l3 3" stroke="${GRIS}" stroke-width="1.6" stroke-linecap="round"/><animateTransform attributeName="transform" type="translate" values="54 1;56 2;54 1" dur="1.4s" repeatCount="indefinite"/></g>`
    case 'ejecutando':
      return `<g transform="translate(58 5)"><circle r="3.5" fill="none" stroke="${GRIS}" stroke-width="1.6" stroke-dasharray="6 5"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s" repeatCount="indefinite"/></circle></g>`
    case 'editando':
      return `<g transform="translate(54 0)"><path d="M2 8 l6 -6 l2 2 l-6 6 z" fill="${NARANJA}" stroke="${NARANJA_OSCURO}" stroke-width="0.8"/><path d="M2 8 l-0.6 2.6 l2.6 -0.6" fill="${NARANJA_OSCURO}"/><animateTransform attributeName="transform" type="translate" values="54 0;55 1;54 0" dur="0.8s" repeatCount="indefinite"/></g>`
    case 'esperando':
      return `<text x="55" y="10" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${GRIS}">?<animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></text>`
    case 'listo':
      return `<path d="M53 5 l3 3 l6 -6" fill="none" stroke="${VERDE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'dormido':
      return `<g font-family="system-ui, sans-serif" font-weight="700" fill="${GRIS}"><text x="53" y="10" font-size="7">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text><text x="57" y="5" font-size="9">z<animate attributeName="opacity" values="0;0;1;0" dur="2.4s" repeatCount="indefinite"/></text></g>`
    case 'alerta':
      return `<text x="56" y="10" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="${ROJO}">!<animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite"/></text>`
    case 'celebrando':
      return confeti()
    default:
      return ''
  }
}

/** Confeti que cae y una estrella que brilla: un logro desbloqueado. */
function confeti(): string {
  const piezas: [number, string, string][] = [
    [5, '#f4c35b', '0s'],
    [14, VERDE, '0.35s'],
    [50, '#58a6ff', '0.15s'],
    [58, MEJILLA, '0.5s'],
    [31, '#bc8cff', '0.7s'],
  ]
  const caen = piezas
    .map(
      ([x, color, inicio]) =>
        `<rect x="${x}" y="0" width="2.4" height="3.4" rx="0.6" fill="${color}"><animate attributeName="y" values="-4;54" dur="1.4s" begin="${inicio}" repeatCount="indefinite"/></rect>`,
    )
    .join('')
  const estrella = `<path d="M57 1 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 z" fill="#f4c35b"><animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/></path>`
  return caen + estrella
}

/** Las ruedas; giran mientras Toki trabaja. */
function ruedas(a: Actividad): string {
  const gira = a === 'ejecutando' || a === 'compactando' || a === 'buscando'
  const rueda = (cx: number) =>
    `<g transform="translate(${cx} 50)"><circle r="5" fill="${LLANTA}"/><circle r="2.1" fill="${GRIS}"/>` +
    `<g stroke="${GRIS_OSCURO}" stroke-width="0.9"><path d="M0 -4.2 V-2.3 M0 2.3 V4.2 M-4.2 0 H-2.3 M2.3 0 H4.2"/>` +
    (gira ? `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite"/>` : '') +
    `</g></g>`
  return rueda(19) + rueda(43)
}

/** El depósito transparente: basura de tokens al fondo y el símbolo de reciclaje. */
function deposito(a: Actividad): string {
  const nivel = a === 'compactando' ? `<animate attributeName="y" values="42.5;40;42.5" dur="1.6s" repeatCount="indefinite"/>` : ''
  const basura =
    `<g>` +
    `<rect x="21.5" y="42.5" width="3" height="2" rx="0.5" fill="${GRIS}">${nivel}</rect>` +
    `<rect x="25.2" y="43" width="2.4" height="1.6" rx="0.5" fill="#6ea8d8"/>` +
    `<rect x="34.6" y="42.6" width="2.8" height="2" rx="0.5" fill="${GRIS}"/>` +
    `<rect x="38" y="43" width="2.6" height="1.6" rx="0.5" fill="#6ea8d8">${nivel}</rect>` +
    `</g>`
  const reciclaje =
    `<g stroke="${VERDE}" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M28.2 39.6 a3.2 3.2 0 0 1 4.6 -3.4"/><path d="M32.2 35.1 l0.8 1.2 l-1.4 0.3"/>` +
    `<path d="M34.1 37.8 a3.2 3.2 0 0 1 -3.4 3.8"/><path d="M31.6 42.4 l-1.2 -0.8 l1 -1"/>` +
    `</g>`
  const brillo =
    a === 'listo'
      ? `<path d="M39.5 34.5 l0.6 1.4 l1.4 0.6 l-1.4 0.6 l-0.6 1.4 l-0.6 -1.4 l-1.4 -0.6 l1.4 -0.6 z" fill="#fff"><animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite"/></path>`
      : ''
  return (
    `<rect x="19" y="32.4" width="24" height="2.4" rx="1.2" fill="#9cc4dc"/>` +
    `<rect x="20" y="34" width="22" height="12" rx="3" fill="#d8f0fb" fill-opacity="0.9" stroke="#9cc4dc" stroke-width="1"/>` +
    basura +
    reciclaje +
    brillo
  )
}

/** El brazo derecho con la manguera y la boquilla; aspira cuando compacta. */
function aspiradora(a: Actividad): string {
  const activa = a === 'compactando'
  const boquilla =
    `<g>` +
    `<rect x="52.5" y="49.5" width="10" height="3.4" rx="1.5" fill="${GRIS}" stroke="${GRIS_OSCURO}" stroke-width="0.8"/>` +
    (activa ? `<animateTransform attributeName="transform" type="translate" values="0 0;1.4 0;0 0" dur="0.5s" repeatCount="indefinite"/>` : '') +
    `</g>`
  // Lo que se aspira: puntitos que suben por la manguera hacia el depósito.
  const particulas = activa
    ? ['0s', '0.35s', '0.7s']
        .map(
          inicio =>
            `<circle r="0.9" fill="${CIAN}"><animateMotion path="M56 49 C56 43, 53 38.5, 48 36.5 L40 38" dur="1s" begin="${inicio}" repeatCount="indefinite"/></circle>`,
        )
        .join('')
    : ''
  return (
    `<path d="M46 34 L51 37" stroke="${GRIS}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M51 37 C55 39, 57 44, 56 49.5" stroke="${GRIS_OSCURO}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    boquilla +
    particulas
  )
}

/** El SVG completo de Toki para un estado. 64×56 de diseño. */
export function tokiSvg(actividad: Actividad): string {
  // Flota; dormido, más lento; celebrando, da saltitos.
  const flota =
    actividad === 'dormido'
      ? 'values="0 0;0 -0.6;0 0" dur="3.2s"'
      : actividad === 'celebrando'
        ? 'values="0 0;0 -2.6;0 0" dur="0.6s"'
        : 'values="0 0;0 -0.8;0 0" dur="2s"'
  const bordePantalla =
    actividad === 'alerta'
      ? `<rect x="17" y="7" width="28" height="15" rx="6" fill="none" stroke="${ROJO}" stroke-width="1.2"><animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite"/></rect>`
      : ''
  const mejillas =
    actividad === 'dormido' || actividad === 'alerta'
      ? ''
      : `<ellipse cx="22.4" cy="17.8" rx="1.8" ry="1" fill="${MEJILLA}" opacity="0.8"/><ellipse cx="39.6" cy="17.8" rx="1.8" ry="1" fill="${MEJILLA}" opacity="0.8"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 56" width="64" height="56">` +
    ruedas(actividad) +
    `<g><animateTransform attributeName="transform" type="translate" ${flota} repeatCount="indefinite"/>` +
    // brazo izquierdo
    `<path d="M16 34 L11.5 40" stroke="${GRIS}" stroke-width="2.4" stroke-linecap="round"/><circle cx="11" cy="41" r="1.8" fill="${GRIS_OSCURO}"/>` +
    // cuerpo con la etiqueta
    `<rect x="15" y="27" width="32" height="21" rx="7" fill="${AZUL}" stroke="${AZUL_OSCURO}" stroke-width="1.4"/>` +
    `<text x="31" y="31.6" text-anchor="middle" font-family="system-ui, sans-serif" font-size="3.4" font-weight="700" fill="#fff">Toki</text>` +
    deposito(actividad) +
    aspiradora(actividad) +
    // cuello, audífonos y cabeza con pantalla
    `<rect x="27" y="24.5" width="8" height="3.5" rx="1" fill="${AZUL_OSCURO}"/>` +
    `<rect x="9" y="10" width="6" height="10" rx="3" fill="${NARANJA}" stroke="${NARANJA_OSCURO}" stroke-width="1"/>` +
    `<rect x="47" y="10" width="6" height="10" rx="3" fill="${NARANJA}" stroke="${NARANJA_OSCURO}" stroke-width="1"/>` +
    `<rect x="13" y="3" width="36" height="23" rx="10" fill="${AZUL}" stroke="${AZUL_OSCURO}" stroke-width="1.4"/>` +
    `<rect x="17" y="7" width="28" height="15" rx="6" fill="${PANTALLA}"/>` +
    `<path d="M19.5 9.6 q4 -2 9 -1.2" stroke="#fff" stroke-opacity="0.22" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
    bordePantalla +
    ojos(actividad) +
    boca(actividad) +
    mejillas +
    `</g>` +
    accesorio(actividad) +
    `</svg>`
  )
}
