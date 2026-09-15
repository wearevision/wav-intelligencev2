import { buildBoard } from '@/features/control'
import { ControlTowerView } from '@/features/control/components/control-tower-view'
import { listActiveStudiesDetail } from '@/features/studies/server'

export default async function ControlTowerPage() {
  const studies = await listActiveStudiesDetail()
  const { alerts, pulses } = buildBoard(studies, new Date())

  return <ControlTowerView alerts={alerts} pulses={pulses} />
}
