import { notFound } from 'next/navigation'

import { StudyDetailView } from '@/features/studies/components/study-detail-view'

import {
  previewMedia,
  previewPipelines,
  previewSessions,
  previewStudies,
} from '../fixtures'

export default function PreviewStudyPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const today = new Date()
  const [study] = previewStudies(today)

  return <StudyDetailView study={study} sessions={previewSessions(today)}
      media={previewMedia()}
      pipelines={previewPipelines()}
      today={today} />
}
