import { notFound } from 'next/navigation'

import { StudyDetailView } from '@/features/studies/components/study-detail-view'
import { getStudy } from '@/features/studies/server'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const study = await getStudy(id)
  if (!study) notFound()

  return <StudyDetailView study={study} today={new Date()} />
}
