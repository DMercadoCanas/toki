import { describe, expect, test } from 'claude-code/testing'

import { detectarIdioma, idiomaDeTexto, t, textos } from '../hooks/idioma'

describe('idioma', () => {
  test('la configuración manda; si no, el sistema', async () => {
    expect(detectarIdioma('en', 'es_CO.UTF-8')).toBe('en')
    expect(detectarIdioma('es', 'en_US.UTF-8')).toBe('es')
    expect(detectarIdioma('auto', 'es_CO.UTF-8')).toBe('es')
    expect(detectarIdioma('auto', 'pt_BR.UTF-8')).toBe('es')
    expect(detectarIdioma('auto', 'en_US.UTF-8')).toBe('en')
    expect(detectarIdioma('auto', 'de_DE.UTF-8')).toBe('en')
    expect(detectarIdioma('auto', undefined)).toBe('es')
    expect(detectarIdioma('auto', 'C.UTF-8')).toBe('es')
  })

  test('reconoce el idioma en que le escribes a Claude', async () => {
    expect(idiomaDeTexto('Arregla el test que falla en el login, por favor')).toBe('es')
    expect(idiomaDeTexto('¿Por qué falla esto?')).toBe('es')
    expect(idiomaDeTexto('Please fix the failing test in the login flow')).toBe('en')
    expect(idiomaDeTexto('Can you check why this is slow?')).toBe('en')
  })

  test('no adivina con textos cortos, código o rutas', async () => {
    expect(idiomaDeTexto('ok')).toBe(undefined)
    expect(idiomaDeTexto('npm test')).toBe(undefined)
    expect(idiomaDeTexto('```\nconst the = and.is.to.of\n```')).toBe(undefined)
  })

  test('el código pegado no cambia el idioma', async () => {
    const pegado = 'Mira este error y arréglalo:\n```\nError: the value is not defined and cannot be read from the config\n  at load (src/config.ts:12)\n```'
    expect(idiomaDeTexto(pegado)).toBe('es')
  })

  test('los dos idiomas tienen los mismos textos', async () => {
    expect(Object.keys(textos.en).sort()).toEqual(Object.keys(textos.es).sort())
    expect(Object.keys(textos.en.logroNombres).sort()).toEqual(Object.keys(textos.es.logroNombres).sort())
    expect(t('en').lema).toBe('Your token-saving companion')
    expect(t('es').eslogan).toBe('Cada token cuenta.')
    expect(t('en').toastAhorro('1.2k', 'npm test')).toBe('Toki saved you ~1.2k tokens on "npm test"')
  })
})
