// Bordes de palabra que entienden las tildes y la ñ. Funciones puras.
//
// En JavaScript, `\b` y `\w` solo conocen letras ASCII. Para ellos, la «ó» de
// «sirvió» no es una letra: /no sirvió\b/ nunca coincide, y dentro de «área»
// ven una palabra «rea». `conAcentos` reescribe la expresión para que `\b` y
// `\w` cuenten cualquier letra, marca o número de Unicode, y le pone la bandera
// `u`. Solo cambia `\b` y `\w`; lo demás queda igual.

const LETRA = '\\p{L}\\p{M}\\p{N}_'
const BORDE = `(?:(?<=[${LETRA}])(?![${LETRA}])|(?<![${LETRA}])(?=[${LETRA}]))`

export function conAcentos(re: RegExp): RegExp {
  const s = re.source
  let fuente = ''
  let enClase = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      const sig = s[i + 1] ?? ''
      i++
      // Dentro de una clase, \b es el retroceso: se deja como está.
      if (sig === 'b' && !enClase) fuente += BORDE
      else if (sig === 'w') fuente += enClase ? LETRA : `[${LETRA}]`
      else fuente += `\\${sig}`
      continue
    }
    if (c === '[') enClase = true
    else if (c === ']') enClase = false
    fuente += c
  }
  return new RegExp(fuente, re.flags.includes('u') ? re.flags : `${re.flags}u`)
}
