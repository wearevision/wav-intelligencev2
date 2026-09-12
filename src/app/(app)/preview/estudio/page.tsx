import { notFound } from 'next/navigation'

import { StudyDetailView } from '@/features/studies/components/study-detail-view'

import { previewStudies } from '../fixtures'

export default function PreviewStudyPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const today = new Date()
  const [study] = previewStudies(today)

  return <StudyDetailView study={study} today={today} />
}
