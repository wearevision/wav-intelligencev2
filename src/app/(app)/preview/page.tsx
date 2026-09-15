import { notFound } from 'next/navigation'

import { buildBoard } from '@/features/control'
import { ControlTowerView } from '@/features/control/components/control-tower-view'

import { previewStudies } from './fixtures'

// Vista previa de la interfaz con datos de prueba, para iterar diseño sin base
// de datos. No existe en producción.
export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const today = new Date()
  const { alerts, pulses } = buildBoard(previewStudies(today), today)

  return <ControlTowerView alerts={alerts} pulses={pulses} />
}
