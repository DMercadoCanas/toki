import { describe, expect, test } from 'claude-code/testing'

import { conAcentos } from '../hooks/palabras'

// \b y \w con cualquier letra de Unicode, no solo las de ASCII.

describe('conAcentos', () => {
  test('una palabra que termina en tilde tiene borde', () => {
    expect(/\bno sirvió\b/i.test('no sirvió')).toBe(false)
    expect(conAcentos(/\bno sirvió\b/i).test('no sirvió')).toBe(true)
  })

  test('una tilde no parte la palabra en dos', () => {
    expect(/\brea\b/i.test('el área')).toBe(true)
    expect(conAcentos(/\brea\b/i).test('el área')).toBe(false)
    expect(conAcentos(/\brea\b/i).test('la rea')).toBe(true)
  })

  test('\\w cuenta la ñ y las tildes, también dentro de una clase', () => {
    expect(conAcentos(/\bdiseñ\w*/i).exec('el diseñador gráfico')?.[0]).toBe('diseñador')
    expect(conAcentos(/^[\w-]+$/).test('pequeña-aplicación')).toBe(true)
  })

  test('conserva las banderas y agrega u', () => {
    expect(conAcentos(/a/gi).flags).toBe('giu')
    expect(conAcentos(/a/u).flags).toBe('u')
  })
})
