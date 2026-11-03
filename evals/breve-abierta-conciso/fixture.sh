#!/bin/bash
mkdir -p src
cat > src/turnos.ts <<'TS'
// Reparte citas entre médicos por turnos de 30 minutos, sin pisarse.
export type Cita = { medico: string; inicio: number; fin: number } // minutos desde las 00:00

export function seCruzan(a: Cita, b: Cita): boolean {
  return a.medico === b.medico && a.inicio <= b.fin && b.inicio <= a.fin
}

export function agendar(citas: Cita[], nueva: Cita): Cita[] {
  if (citas.some(c => seCruzan(c, nueva))) throw new Error('turno ocupado')
  return [...citas, nueva].sort((x, y) => x.inicio - y.inicio)
}
TS
cat > src/turnos.test.ts <<'TS'
import { agendar } from './turnos'
// Falla: una cita de 9:00 a 9:30 y otra de 9:30 a 10:00 del mismo médico deberían caber.
const dia = agendar([], { medico: 'ana', inicio: 540, fin: 570 })
agendar(dia, { medico: 'ana', inicio: 570, fin: 600 })
TS
