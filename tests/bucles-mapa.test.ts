import { describe, expect, test } from 'claude-code/testing'

import { registrar } from '../hooks/bucles'
import { construirMapa, esBusqueda, extraerFicha, resolverImport } from '../hooks/mapa'

describe('bucles', () => {
  test('avisa una sola vez, al tercer fallo seguido', async () => {
    let fallos = {}
    const avisos: boolean[] = []
    for (let i = 0; i < 4; i++) {
      const r = registrar(fallos, 'npm run build', true)
      fallos = r.fallos
      avisos.push(r.avisar)
    }
    expect(avisos).toEqual([false, false, true, false])
  })

  test('un éxito reinicia la cuenta', async () => {
    let r = registrar({}, 'pytest', true)
    r = registrar(r.fallos, 'pytest', true)
    r = registrar(r.fallos, 'pytest', false)
    r = registrar(r.fallos, 'pytest', true)
    expect(r.avisar).toBe(false)
  })
})

describe('mapa', () => {
  test('extrae símbolos e imports de TypeScript', async () => {
    const ficha = extraerFicha(
      'src/auth/login.ts',
      "import { db } from '../lib/db'\nimport x from './tokens.ts'\nexport async function login() {}\nexport class AuthService {}\nexport const LIMITE = 3\nfunction interna() {}\n",
    )
    expect(ficha?.simbolos).toEqual(['login()', 'class AuthService', 'LIMITE', 'interna()'])
    expect(ficha?.imports).toEqual(['src/lib/db', 'src/auth/tokens'])
  })

  test('extrae funciones y clases de Python de primer nivel', async () => {
    const ficha = extraerFicha('app/servicios.py', 'from .modelos import Usuario\nclass Servicio:\n    def metodo(self): pass\ndef crear(): pass\ndef _privada(): pass\n')
    expect(ficha?.simbolos).toEqual(['class Servicio', 'crear()'])
    expect(ficha?.imports).toEqual(['app/modelos'])
  })

  test('ignora archivos que no son código y pruebas', async () => {
    expect(extraerFicha('README.md', '# hola')).toBe(undefined)
    expect(extraerFicha('src/a.test.ts', 'export function x() {}')).toBe(undefined)
  })

  test('resuelve imports relativos', async () => {
    expect(resolverImport('src/a/b.ts', '../c/index', 'js')).toBe('src/c')
    expect(resolverImport('pkg/sub/m.py', '..util', 'py')).toBe('pkg/util')
  })

  test('el mapa lista los módulos más usados', async () => {
    const fichas = [
      { ruta: 'src/lib/db.ts', simbolos: ['conectar()'], imports: [] },
      { ruta: 'src/a.ts', simbolos: [], imports: ['src/lib/db'] },
      { ruta: 'src/b.ts', simbolos: [], imports: ['src/lib/db'] },
    ]
    const mapa = construirMapa(fichas, '2026-10-19 16:00', false)
    expect(mapa).toContain('- src/lib/db.ts ← 2')
    expect(mapa).toContain('- db.ts: conectar()')
  })

  test('reconoce búsquedas', async () => {
    expect(esBusqueda('Grep')).toBe(true)
    expect(esBusqueda('Bash', 'rg "login" src')).toBe(true)
    expect(esBusqueda('Bash', 'npm test')).toBe(false)
  })
})
