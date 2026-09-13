import { notFound } from 'next/navigation'

import { listStudySessions } from '@/features/sessions/server'
import { StudyDetailView } from '@/features/studies/components/study-detail-view'
import { getStudy } from '@/features/studies/server'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [study, sessions] = await Promise.all([getStudy(id), listStudySessions(id)])
  if (!study) notFound()

  return <StudyDetailView study={study} sessions={sessions} today={new Date()} />
}
