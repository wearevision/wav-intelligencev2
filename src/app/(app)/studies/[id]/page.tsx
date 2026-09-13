import { notFound } from 'next/navigation'

import { listStudyMedia } from '@/features/media/server'
import { listStudySessions } from '@/features/sessions/server'
import { StudyDetailView } from '@/features/studies/components/study-detail-view'
import { getStudy } from '@/features/studies/server'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [study, sessions, media] = await Promise.all([
    getStudy(id),
    listStudySessions(id),
    listStudyMedia(id),
  ])
  if (!study) notFound()

  return <StudyDetailView study={study} sessions={sessions} media={media} today={new Date()} />
}
