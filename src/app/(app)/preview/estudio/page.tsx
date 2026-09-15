import { notFound } from 'next/navigation'

import { StudyDetailView } from '@/features/studies/components/study-detail-view'

import {
  previewMedia,
  previewParticipants,
  previewPipelines,
  previewSessions,
  previewTranscripts,
  previewStudies,
} from '../fixtures'

export default function PreviewStudyPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const today = new Date()
  const [study] = previewStudies(today)

  return <StudyDetailView study={study} sessions={previewSessions(today)}
      media={previewMedia()}
      participants={previewParticipants()}
      pipelines={previewPipelines()}
      transcripts={previewTranscripts()}
      today={today} />
}
