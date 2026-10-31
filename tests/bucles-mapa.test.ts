import { describe, expect, test } from 'claude-code/testing'

import { registrar } from '../hooks/bucles'
import { construirMapa, esBusqueda, extraerFicha, extraerOdoo, resolverImport } from '../hooks/mapa'

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

  test('mapa de Odoo: depends, dónde se define y se hereda cada modelo, y las vistas', async () => {
    const manifiesto = extraerOdoo('furips/__manifest__.py', "{\n  'name': 'FURIPS',\n  'depends': ['account', \"acs_hms_base\"],\n}\n")
    expect(manifiesto?.depends).toEqual(['account', 'acs_hms_base'])
    const modelos = extraerOdoo(
      'furips/models/datos.py',
      [
        'class FuripsDatos(models.Model):',
        "    _name = 'furips.datos'",
        "    _inherit = ['mail.thread', 'mail.activity.mixin']",
        '',
        'class Factura(models.Model):',
        "    _inherit = 'account.move'",
        '',
        'class Socio(models.Model):',
        "    _name = 'res.partner'",
        "    _inherit = 'res.partner'",
      ].join('\n'),
    )
    expect(modelos?.modelos).toEqual([
      { nombre: 'furips.datos', hereda: false },
      { nombre: 'account.move', hereda: true },
      { nombre: 'res.partner', hereda: true },
    ])
    const vistas = extraerOdoo(
      'furips/views/factura.xml',
      '<odoo><record id="view_move_form_furips" model="ir.ui.view"><field name="model">account.move</field><field name="inherit_id" ref="account.view_move_form"/></record><record id="accion" model="ir.actions.act_window"><field name="res_model">account.move</field></record></odoo>',
    )
    expect(vistas?.vistas).toEqual([{ id: 'view_move_form_furips', modelo: 'account.move', hereda: 'account.view_move_form' }])
    expect(extraerOdoo('src/util.py', 'def f(): pass')).toBe(undefined)

    const mapa = construirMapa([], '2026-10-31 10:00', false, 'es', [manifiesto, modelos, vistas].filter(f => f !== undefined))
    expect(mapa).toContain('- furips → account, acs_hms_base')
    expect(mapa).toContain('- account.move: hereda furips/models/datos.py')
    expect(mapa).toContain('- furips.datos: define furips/models/datos.py')
    expect(mapa).toContain('- account.move: view_move_form_furips ← account.view_move_form (furips/views/factura.xml)')
    expect(mapa.indexOf('## Odoo')).toBeLessThan(mapa.indexOf('## Archivos y símbolos'))
    expect(construirMapa([], 'f', false)).not.toContain('## Odoo')
  })

  test('reconoce búsquedas', async () => {
    expect(esBusqueda('Grep')).toBe(true)
    expect(esBusqueda('Bash', 'rg "login" src')).toBe(true)
    expect(esBusqueda('Bash', 'npm test')).toBe(false)
  })
})
