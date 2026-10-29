import { describe, expect, test } from 'claude-code/testing'

import { claveDia } from '../hooks/historial'
import { ahorroDe, ahorroUsdDe, avisoSemana, consejoDe, leerSemanas, letraDe, lunesDe, notaDe, semanaAnterior, SEMANA_VACIA, sumarSemana, tarjetaGuardada, tarjetaNoGuardada, tarjetaPendiente, tarjetaSemana } from '../hooks/semana'
import type { ResumenSemana, Semanas } from '../hooks/semana'

// Miércoles 21 de octubre de 2026, mediodía local.
const MIE = new Date(2026, 9, 21, 12).getTime()
const DIA = 86_400_000

/** La semana del 19 de octubre con estas cifras. */
const semana = (r: Partial<ResumenSemana>): Semanas => ({ '2026-10-19': { ...SEMANA_VACIA, ...r } })

// 34 pedidos (4 largos), 10 mensajes (1 corrección), 1 vuelta en frío en 2 sesiones: contexto 76, claridad 60, caché 75 → B (71).
const HABITOS: Partial<ResumenSemana> = { pedidos: 34, pedidosLargos: 4, sesiones: 2, mensajes: 10, correcciones: 1, frios: 1 }

describe('tarjeta semanal (puro)', () => {
  test('costo por tarea: cuántas, lo que costó cada una y sus correcciones', () => {
    let s = sumarSemana({}, MIE, { tarea: { usd: 0.3, correcciones: 0 } })
    s = sumarSemana(s, MIE, { tarea: { usd: 0.5, correcciones: 3 } })
    expect(s['2026-10-19']).toMatchObject({ tareas: 2, tareasUsd: 0.8, tareasCorr: 3 })
    expect(leerSemanas(JSON.parse(JSON.stringify(s)))['2026-10-19']?.tareas).toBe(2)
    expect(tarjetaSemana(s, '2026-10-19', MIE, {})).toContain('2 tareas: ~$0.40 por tarea · 1.5 correcciones por tarea')
    expect(tarjetaSemana(s, '2026-10-19', MIE, {}, { idioma: 'en' })).toContain('2 tasks: ~$0.40 per task · 1.5 corrections per task')
    expect(tarjetaSemana(semana({ mensajes: 3 }), '2026-10-19', MIE, {})).not.toContain('por tarea')
  })

  test('la semana empieza el lunes, también un domingo', () => {
    expect(lunesDe(MIE)).toBe('2026-10-19')
    expect(lunesDe(MIE + 4 * DIA)).toBe('2026-10-19') // domingo 25
    expect(lunesDe(MIE + 5 * DIA)).toBe('2026-10-26')
    expect(semanaAnterior('2026-10-19')).toBe('2026-10-12')
  })

  test('suma por tipo y guarda solo 12 semanas', () => {
    let s = sumarSemana({}, MIE, { tipo: 'salida', ahorro: 1000 })
    s = sumarSemana(s, MIE, { tipo: 'busqueda', ahorro: 500, pedidos: 2, tokensLeidos: 90_000 })
    s = sumarSemana(s, MIE, { costo: -3 })
    expect(ahorroDe(s['2026-10-19'])).toBe(1500)
    expect(s['2026-10-19']?.pedidos).toBe(2)
    expect(s['2026-10-19']?.costo).toBe(0)
    for (let i = 1; i <= 14; i++) s = sumarSemana(s, MIE + i * 7 * DIA, { pedidos: 1 })
    expect(Object.keys(s).length).toBe(12)
    expect(leerSemanas({ basura: 1, '2026-10-19': { porTipo: { salida: 'x' }, pedidos: 3 } })['2026-10-19']?.pedidos).toBe(3)
    expect(leerSemanas(null)).toEqual({})
  })

  test('la tarjeta de la semana pasada se avisa una sola vez, y solo si hubo algo', () => {
    const s = sumarSemana({}, MIE, { tipo: 'pegado', ahorro: 20_000 })
    const lunesSiguiente = MIE + 5 * DIA
    expect(tarjetaPendiente(s, MIE, undefined)).toBeUndefined() // la pasada está vacía
    expect(tarjetaPendiente(s, lunesSiguiente, undefined)).toBe('2026-10-19')
    expect(tarjetaPendiente(s, lunesSiguiente, '2026-10-19')).toBeUndefined()
  })

  test('la tarjeta muestra el reparto, la comparación, lo leído y el mejor día', () => {
    let s = sumarSemana({}, MIE - 7 * DIA, { tipo: 'salida', ahorro: 10_000 })
    s = sumarSemana(s, MIE, { tipo: 'salida', ahorro: 12_000 })
    s = sumarSemana(s, MIE, { tipo: 'busqueda', ahorro: 3_000, relecturas: 40_000, pedidos: 30, tokensLeidos: 2_000_000, costo: 1.234, sesiones: 2, frenos: 1 })
    const historial = { [claveDia(MIE)]: 9_000, [claveDia(MIE - DIA)]: 6_000 }
    const tarjeta = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, historial, { mostrarCosto: true })
    expect(tarjeta).toContain('19 oct – 25 oct')
    expect(tarjeta).toContain('Te ahorré ~15.0k tokens')
    expect(tarjeta).toContain('▲ 50% vs. la semana anterior')
    expect(tarjeta.indexOf('salidas de terminal')).toBeLessThan(tarjeta.indexOf('búsquedas enormes'))
    expect(tarjeta).toContain('~$1.23')
    expect(tarjeta).toContain('Mejor día: mié 21 (~9.0k)')
    expect(tarjeta).toContain('1 lectura frenada')
    expect(tarjetaSemana(s, '2026-10-19', MIE, historial)).not.toContain('$')
    expect(tarjetaSemana({}, '2026-10-19', MIE, {})).toContain('todavía no tiene cifras')
    expect(tarjetaSemana(s, '2026-10-19', MIE, historial, { idioma: 'en' })).toContain('I saved you ~15.0k tokens')
    expect(avisoSemana(s, '2026-10-19')).toContain('/toki-semana')
  })

  test('el consejo sale de las cifras', () => {
    expect(consejoDe({ ...SEMANA_VACIA, pedidos: 40, pedidosLargos: 20 })).toContain('50% de tus pedidos')
    expect(consejoDe({ ...SEMANA_VACIA, porTipo: { pegado: 50_000 } })).toContain('pegaste textos enormes')
    expect(consejoDe({ ...SEMANA_VACIA, frenos: 4 })).toContain('CLAUDE.md')
    expect(consejoDe(SEMANA_VACIA)).toContain('vas bien')
  })

  test('la nota necesita cifras y pondera tres hábitos', () => {
    expect(notaDe({ ...SEMANA_VACIA, pedidos: 19, mensajes: 30 })).toBeUndefined()
    expect(notaDe({ ...SEMANA_VACIA, pedidos: 40, mensajes: 4 })).toBeUndefined()
    const perfecta = notaDe({ ...SEMANA_VACIA, pedidos: 40, mensajes: 12, sesiones: 3 })
    expect(perfecta?.puntos).toBe(100)
    expect(perfecta?.letra).toBe('A')
    const b = notaDe({ ...SEMANA_VACIA, ...HABITOS })
    expect(b?.partes.map(p => [p.clave, p.puntos])).toEqual([
      ['contexto', 76],
      ['claridad', 60],
      ['cache', 75],
    ])
    expect(b?.puntos).toBe(71)
    expect(b?.letra).toBe('B')
    // Con menos de 10 mensajes no hay claridad: los pesos se reparten entre contexto y caché.
    const corta = notaDe({ ...SEMANA_VACIA, pedidos: 40, pedidosLargos: 10, mensajes: 6, sesiones: 1, frios: 1 })
    expect(corta?.partes.map(p => p.clave)).toEqual(['contexto', 'cache'])
    expect(corta?.puntos).toBe(50)
    expect(corta?.letra).toBe('D')
    // Nada baja de 0 ni pasa de 100.
    expect(notaDe({ ...SEMANA_VACIA, pedidos: 20, pedidosLargos: 20, mensajes: 10, correcciones: 10, sesiones: 1, frios: 9 })?.puntos).toBe(0)
    expect([85, 84, 70, 69, 55, 54, 40, 39].map(letraDe)).toEqual(['A', 'B', 'B', 'C', 'C', 'D', 'D', 'F'])
  })

  test('suma mensajes, modelos, pedidos grandes y ruteo; lo de antes se lee en cero', () => {
    let s = sumarSemana({}, MIE, { mensajes: 1, correcciones: 1, frios: 1 })
    for (const modelo of ['sonnet', 'sonnet', 'opus'] as const) s = sumarSemana(s, MIE, { modelo })
    s = sumarSemana(s, MIE, { entrevista: 'con' })
    s = sumarSemana(s, MIE, { entrevista: 'conCorr' })
    s = sumarSemana(s, MIE, { consejos: 1 })
    s = sumarSemana(s, MIE, { ruteo: 0.5 })
    s = sumarSemana(s, MIE, { ruteo: -0.8 }) // deshacer de más: queda en 0
    s = sumarSemana(s, MIE, { ruteoExtra: 0.2 })
    const w = s['2026-10-19']
    expect(w?.porModelo).toEqual({ sonnet: 2, opus: 1 })
    expect(w?.entrevistas).toEqual({ con: 1, conCorr: 1, sin: 0, sinCorr: 0 })
    expect(w?.ruteo).toBe(0)
    expect(w?.ruteoExtra).toBe(0.2)
    expect([w?.mensajes, w?.correcciones, w?.frios, w?.consejos]).toEqual([1, 1, 1, 1])
    expect(SEMANA_VACIA.porModelo).toEqual({})
    expect(SEMANA_VACIA.entrevistas).toEqual({ con: 0, conCorr: 0, sin: 0, sinCorr: 0 })
    const leida = leerSemanas({ '2026-10-19': { pedidos: 3, porModelo: { opus: 2, gpt: 9, sonnet: 'x' }, entrevistas: { con: 2 }, ruteo: -1 } })['2026-10-19']
    expect(leida?.porModelo).toEqual({ opus: 2 })
    expect(leida?.entrevistas).toEqual({ con: 2, conCorr: 0, sin: 0, sinCorr: 0 })
    expect(leida?.ruteo).toBe(0)
    expect(leida?.mensajes).toBe(0)
  })

  test('la tarjeta lleva la nota, el ruteo, los modelos y los pedidos grandes', () => {
    const s = semana({
      ...HABITOS,
      porTipo: { salida: 5_000 },
      tokensLeidos: 1_000_000,
      porModelo: { opus: 3, sonnet: 7 },
      ruteo: 0.42,
      ruteoExtra: 0.1,
      entrevistas: { con: 2, conCorr: 1, sin: 3, sinCorr: 6 },
      consejos: 1,
    })
    const t = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {})
    expect(t).toContain('Nota: B (71/100)')
    expect(t).toContain('el 12% de tus pedidos pasó de 150k de contexto')
    expect(t).toContain('1 corrección en 10 mensajes')
    expect(t).toContain('volviste una vez con el caché vencido y mucho contexto')
    expect(t.indexOf('Nota: B')).toBeLessThan(t.indexOf('Te ahorré'))
    expect(t).toContain('Elegir modelo y esfuerzo por mensaje ahorró ~$0.42 a precio de API · ~$0.10 de más que aprobaste')
    expect(t).toContain('Mensajes por modelo: Sonnet 7 · Opus 3')
    expect(t).toContain('Pedidos grandes: 2 con preguntas antes (0.5 correcciones por pedido) · 3 sin preguntas (2.0 por pedido) · 1 consejo para pedir mejor')
    // Lo más flojo es la claridad (60): el consejo va ahí.
    expect(t).toContain('Consejo: el 10% de tus mensajes corregía lo anterior')
    // Con suscripción, la nota va debajo de la cifra en dólares y no se repite en la línea del modelo.
    const suscrita = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { suscripcion: true })
    expect(suscrita).toContain('Te ahorré ~$0.32 a precio de API\nCon suscripción no lo pagas aparte: es uso de tus límites que te queda libre.\nRecorté ~5.0k tokens:')
    expect(suscrita).not.toContain('límite que no gastas')
    const en = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { idioma: 'en' })
    expect(en).toContain('Grade: B (71/100)')
    expect(en).toContain('Picking model and effort per message saved ~$0.42 at API prices · ~$0.10 extra you approved')
    expect(en).toContain('Messages per model: Sonnet 7 · Opus 3')
    expect(en).toContain('Big requests: 2 with questions first (0.5 corrections each) · 3 without (2.0 each) · 1 tip on asking better')
    // Solo lo de más, o menos de medio centavo.
    expect(tarjetaSemana(semana({ ruteoExtra: 0.3 }), '2026-10-19', MIE, {})).toContain('Elegir modelo y esfuerzo por mensaje: ~$0.30 de más que aprobaste (a precio de API)')
    expect(tarjetaSemana(semana({ ruteo: 0.004 }), '2026-10-19', MIE, {})).not.toContain('Elegir modelo')
    expect(tarjetaSemana(semana({ entrevistas: { con: 0, conCorr: 0, sin: 2, sinCorr: 1 } }), '2026-10-19', MIE, {})).toContain(
      'Pedidos grandes: 2 sin preguntas antes (0.5 correcciones por pedido)',
    )
    expect(tarjetaSemana(semana({ consejos: 2 }), '2026-10-19', MIE, {})).toContain('Toki te dio 2 consejos para pedir mejor')
  })

  test('sin cifras suficientes: la semana en curso explica, una pasada no dice nada', () => {
    const poca = semana({ pedidos: 5, mensajes: 2 })
    expect(tarjetaSemana(poca, '2026-10-19', MIE, {})).toContain('Nota: todavía no. La pongo desde 20 pedidos y 5 mensajes tuyos (van 5 y 2).')
    expect(tarjetaSemana(poca, '2026-10-19', MIE + 7 * DIA, {})).not.toContain('Nota')
    expect(tarjetaSemana(poca, '2026-10-19', MIE, {}, { idioma: 'en' })).toContain('Grade: not yet. I grade from 20 requests and 5 messages of yours (so far 5 and 2).')
  })

  test('el consejo va a lo más flojo de la nota, y sugiere Sonnet si casi todo fue a Opus', () => {
    expect(consejoDe({ ...SEMANA_VACIA, pedidos: 30, mensajes: 20, correcciones: 5, sesiones: 1 })).toContain('/toki-entrevista auto')
    const frio = consejoDe({ ...SEMANA_VACIA, pedidos: 30, mensajes: 20, sesiones: 1, frios: 2 })
    expect(frio).toContain('volviste 2 veces con el caché vencido')
    expect(frio).toContain('/compact')
    // Un 25% de pedidos largos ya baja la nota de contexto a 50: el consejo de /clear sale antes del 30%.
    expect(consejoDe({ ...SEMANA_VACIA, pedidos: 40, pedidosLargos: 10, mensajes: 20, sesiones: 1 })).toContain('el 25% de tus pedidos')
    const opus = { ...SEMANA_VACIA, porModelo: { opus: 18, sonnet: 2 } }
    expect(consejoDe(opus)).toContain('18 de tus 20 mensajes fueron a Opus')
    expect(consejoDe(opus)).toContain('/toki-sonnet sí')
    expect(consejoDe(opus, 'en')).toContain('With /toki-sonnet on')
    expect(consejoDe(opus, 'es', { sonnetPrimero: true })).toContain('vas bien')
    expect(consejoDe({ ...SEMANA_VACIA, porModelo: { opus: 10, sonnet: 1 } })).toContain('vas bien')
    expect(consejoDe({ ...SEMANA_VACIA, porModelo: { opus: 15, sonnet: 11 } })).toContain('vas bien')
  })

  test('la tarjeta en Markdown: tablas, $ escapado y pie', () => {
    const s = semana({ ...HABITOS, porTipo: { salida: 5_000, busqueda: 2_000 }, tokensLeidos: 1_000_000, costo: 2.5, ruteo: 0.42 })
    const md = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { formato: 'md', mostrarCosto: true })
    expect(md.startsWith('# Toki · semana (19 oct – 25 oct)\n\n**Nota: B (71/100)**\n\n| | Puntos | Por qué |\n|---|---:|---|\n')).toBe(true)
    expect(md).toContain('| Contexto | 76 | el 12% de tus pedidos pasó de 150k de contexto |')
    expect(md).toContain('| Claridad | 60 | 1 corrección en 10 mensajes |')
    expect(md).toContain('## Ahorro\n\nTe ahorré ~\\$0.42 a precio de API\n\nRecorté ~7.0k tokens:\n\n| Tipo | Tokens |\n|---|---:|\n| salidas de terminal | ~5.0k |\n| búsquedas enormes | ~2.0k |')
    expect(md).toContain('- Elegir modelo y esfuerzo por mensaje ahorró ~\\$0.42 a precio de API')
    expect(md).toContain('~\\$2.50')
    expect(md).toContain('## Consejo\n\nEl 10% de tus mensajes corregía lo anterior')
    expect(md.endsWith('_Tarjeta de Toki de la semana del 19 oct, generada el 28 oct 2026._\n')).toBe(true)
    expect(md).not.toMatch(/(^|[^\\])\$/)
    const en = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { formato: 'md', idioma: 'en' })
    expect(en).toContain('| | Points | Why |')
    expect(en).toContain('## Savings')
    expect(en).toContain('## Tip\n\n10% of your messages corrected the previous answer')
    expect(en).toContain('_Toki card for the week of Oct 19, generated on Oct 28, 2026._')
    // La semana en curso sin nota: la explicación va en cursiva.
    expect(tarjetaSemana(semana({ pedidos: 5, mensajes: 2 }), '2026-10-19', MIE, {}, { formato: 'md' })).toContain('_Nota: todavía no.')
  })

  test('el aviso del lunes lleva la nota y apunta a la semana pasada', () => {
    const s = semana({ ...HABITOS, porTipo: { pegado: 8_000 } })
    const aviso = avisoSemana(s, '2026-10-19')
    expect(aviso).toContain('te ahorré ~8.0k tokens · nota B.')
    expect(aviso).toContain('Escribe /toki-semana pasada para ver la tarjeta.')
    expect(avisoSemana(semana({ pedidos: 3 }), '2026-10-19')).toBe('Toki: la tarjeta de la semana pasada está lista. Escribe /toki-semana pasada para verla.')
    expect(avisoSemana(semana(HABITOS), '2026-10-19')).toContain('lista (nota B).')
    expect(avisoSemana(s, '2026-10-19', 'en')).toContain('· grade B. Type /toki-semana last to see the card.')
    expect(tarjetaGuardada('/p/.claude/toki/semana-2026-10-19.md')).toBe('Toki: guardé la tarjeta en /p/.claude/toki/semana-2026-10-19.md (Markdown).')
    expect(tarjetaNoGuardada('sin permiso', 'en')).toBe("Toki: couldn't save the card (sin permiso).")
  })

  test('la cifra de la semana va en dólares: neto, cuánto menos que sin Toki y contra la anterior', () => {
    const semanas: Semanas = {
      '2026-10-12': { ...SEMANA_VACIA, ahorroUsd: 1, pedidos: 10 },
      '2026-10-19': { ...SEMANA_VACIA, ...HABITOS, porTipo: { salida: 30_000 }, ahorroUsd: 0.9, ruteo: 0.5, ruteoExtra: 0.2, gastoUsd: 4.8 },
    }
    // Recortes y relecturas (0.90) + modelo (0.50) − lo de más (0.20).
    expect(Math.round(ahorroUsdDe(semanas['2026-10-19']) * 100)).toBe(120)
    expect(ahorroUsdDe(undefined)).toBe(0)
    const t = tarjetaSemana(semanas, '2026-10-19', MIE + 7 * DIA, {})
    expect(t).toContain('Te ahorré ~$1.20 a precio de API, un 20 % menos que sin Toki  (▲ 20% vs. la semana anterior)\nRecorté ~30.0k tokens:\n  salidas de terminal')
    expect(t).toContain('Elegir modelo y esfuerzo por mensaje ahorró ~$0.50 a precio de API · ~$0.20 de más que aprobaste')
    // La semana en curso no se compara todavía.
    expect(tarjetaSemana(semanas, '2026-10-19', MIE, {})).toContain('Te ahorré ~$1.20 a precio de API, un 20 % menos que sin Toki\n')
    expect(tarjetaSemana(semanas, '2026-10-19', MIE + 7 * DIA, {}, { idioma: 'en' })).toContain('I saved you ~$1.20 at API prices, 20% less than without Toki  (▲ 20% vs. the week before)\nTrimmed ~30.0k tokens:')
    expect(avisoSemana(semanas, '2026-10-19')).toBe(
      'Toki: la semana pasada te ahorré ~$1.20 a precio de API, un 20 % menos que sin Toki (▲ 20% vs. la semana anterior) · nota B. Escribe /toki-semana pasada para ver la tarjeta.',
    )
    expect(avisoSemana(semanas, '2026-10-19', 'en')).toBe(
      'Toki: last week I saved you ~$1.20 at API prices, 20% less than without Toki (▲ 20% vs. the week before) · grade B. Type /toki-semana last to see the card.',
    )
    // En Markdown, el $ va escapado.
    expect(tarjetaSemana(semanas, '2026-10-19', MIE + 7 * DIA, {}, { formato: 'md' })).toContain('## Ahorro\n\nTe ahorré ~\\$1.20 a precio de API, un 20 % menos que sin Toki (▲ 20% vs. la semana anterior)\n\nRecorté ~30.0k tokens:')
    // Solo modelo, sin gasto medido: sin porcentaje ni línea de tokens.
    const soloModelo = semana({ pedidos: 4, ruteo: 0.3 })
    expect(tarjetaSemana(soloModelo, '2026-10-19', MIE, {})).toContain('Te ahorré ~$0.30 a precio de API\n')
    expect(tarjetaSemana(soloModelo, '2026-10-19', MIE, {})).not.toContain('Recorté')
    expect(tarjetaSemana(soloModelo, '2026-10-19', MIE, {})).not.toContain('no hubo salidas grandes')
    expect(tarjetaPendiente({ '2026-10-19': { ...SEMANA_VACIA, ruteo: 0.3 } }, MIE + 5 * DIA, undefined)).toBe('2026-10-19')
    // Menos de un centavo: la cifra sigue en tokens.
    expect(tarjetaSemana(semana({ porTipo: { salida: 2_000 }, ahorroUsd: 0.004 }), '2026-10-19', MIE, {})).toContain('Te ahorré ~2.0k tokens')
  })

  test('si en neto costó de más, la tarjeta lo dice primero y el aviso no presume', () => {
    const s = semana({ ...HABITOS, porTipo: { pegado: 8_000 }, ahorroUsd: -0.5, ruteo: 0.2 })
    const t = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { suscripcion: true })
    expect(t).toContain('En neto, Toki costó ~$0.30 de más a precio de API (por más esfuerzo que aprobaste o por compactar)\nRecorté ~8.0k tokens:')
    expect(t).not.toContain('Te ahorré')
    // Sin cifra en dólares arriba, la nota de la suscripción sigue en la línea del modelo.
    expect(t).toContain('ahorró ~$0.20 a precio de API (con suscripción: límite que no gastas)')
    expect(tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, {}, { idioma: 'en' })).toContain('On net, Toki cost ~$0.30 extra at API prices (more effort you approved, or compacting)')
    expect(avisoSemana(s, '2026-10-19')).toBe('Toki: la tarjeta de la semana pasada está lista (nota B). Escribe /toki-semana pasada para verla.')
  })
})
