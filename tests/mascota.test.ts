import { describe, expect, test } from 'claude-code/testing'

import { actividadDeHerramienta, barra, colorDePorcentaje, cuadro, decidirActividad, frase, relojCache } from '../hooks/mascota'

describe('Toki', () => {
  test('tiene cuadros para cada estado y la animación avanza', async () => {
    expect(cuadro('tranquilo', 0)).toBe('(•‿•)')
    expect(cuadro('tranquilo', 4)).toBe('(−‿−)')
    expect(cuadro('ejecutando', 0)).not.toBe(cuadro('ejecutando', 1))
    expect(cuadro('dormido', 2)).toContain('zZZ')
    expect(cuadro('celebrando', 0)).toContain('(^‿^)/')
  })

  test('actúa según la herramienta', async () => {
    expect(actividadDeHerramienta('Read')).toBe('leyendo')
    expect(actividadDeHerramienta('Grep')).toBe('buscando')
    expect(actividadDeHerramienta('Bash')).toBe('ejecutando')
    expect(actividadDeHerramienta('Edit')).toBe('editando')
    expect(actividadDeHerramienta('Agent')).toBe('pensando')
  })

  test('prioriza la alerta de contexto y el caché frío cuando no trabaja', async () => {
    expect(decidirActividad('tranquilo', false, 78, 0, 60, true)).toBe('alerta')
    expect(decidirActividad('tranquilo', false, 30, 75, 60, true)).toBe('dormido')
    expect(decidirActividad('tranquilo', false, 30, 75, 60, false)).toBe('tranquilo')
    expect(decidirActividad('leyendo', true, 95, 0, 60, true)).toBe('leyendo')
    expect(decidirActividad('alerta', true, 95, 0, 60, true)).toBe('pensando')
    expect(decidirActividad('tranquilo', false, 39, 0, 60, true, 342_000)).toBe('alerta')
    expect(decidirActividad('tranquilo', false, 39, 0, 60, true, 342_000, true)).toBe('tranquilo')
    expect(decidirActividad('tranquilo', false, 30, 0, 60, true, 10_000, false, true)).toBe('celebrando')
    expect(decidirActividad('celebrando', true, 30, 0, 60, true)).toBe('pensando')
    expect(decidirActividad('tranquilo', false, 80, 0, 60, true, 10_000, false, true)).toBe('alerta')
    const pesada = frase({ actividad: 'alerta', contextoPct: 39, contextoTokens: 342_000, inactivoMinutos: 0, ahorradoSesion: 0 })
    expect(pesada.texto).toContain('~342.0k tokens')
    expect(pesada.accion).toBe('compactar')
  })

  test('las frases dicen qué pasa y qué hacer', async () => {
    const alerta = frase({ actividad: 'alerta', contextoPct: 88, inactivoMinutos: 0, ahorradoSesion: 0 })
    expect(alerta.accion).toBe('compactar')
    expect(alerta.tono).toBe('peligro')
    const listo = frase({ actividad: 'listo', inactivoMinutos: 0, ahorradoSesion: 5400, ultimoAhorro: { tokens: 5400, comando: 'npm test' } })
    expect(listo.texto).toContain('~5.4k tokens')
    expect(listo.texto).toContain('npm test')
    const dormido = frase({ actividad: 'dormido', inactivoMinutos: 788, ahorradoSesion: 0 })
    expect(dormido.texto).toContain('13 h 8 min')
    expect(frase({ actividad: 'listo', inactivoMinutos: 0, ahorradoSesion: 2000 }).texto).toBe('Listo. Esta sesión te ahorré ~2.0k tokens.')
    expect(frase({ actividad: 'listo', inactivoMinutos: 0, ahorradoSesion: 2000 }, 'en').texto).toBe('Done. This session I saved you ~2.0k tokens.')
    expect(frase({ actividad: 'tranquilo', inactivoMinutos: 0, ahorradoSesion: 0 }, 'en').texto).toBe('All good. I am watching your tokens.')
  })

  test('los medidores', async () => {
    expect(barra(37, 10)).toBe('████░░░░░░')
    expect(barra(undefined, 4)).toBe('░░░░')
    expect(colorDePorcentaje(37)).toBe('success')
    expect(colorDePorcentaje(72)).toBe('warning')
    expect(colorDePorcentaje(90)).toBe('error')
    expect(relojCache(60, 60)).toBe('●')
    expect(relojCache(10, 60)).toBe('◔')
    expect(relojCache(0, 60)).toBe('○')
  })
})
