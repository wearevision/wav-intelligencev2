import { notFound } from 'next/navigation'

import { listStudyMedia } from '@/features/media/server'
import { listStudyParticipants } from '@/features/participants/server'
import { listStudyPipelines } from '@/features/pipeline/server'
import { summarizeStudyTranscripts } from '@/features/transcripts/server'
import { listStudySessions } from '@/features/sessions/server'
import { StudyDetailView } from '@/features/studies/components/study-detail-view'
import { getStudy } from '@/features/studies/server'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [study, sessions, media, participants, pipelines, transcripts] = await Promise.all([
    getStudy(id),
    listStudySessions(id),
    listStudyMedia(id),
    listStudyParticipants(id),
    listStudyPipelines(id),
    summarizeStudyTranscripts(id),
  ])
  if (!study) notFound()

  return (
    <StudyDetailView
      study={study}
      sessions={sessions}
      media={media}
      participants={participants}
      pipelines={pipelines}
      transcripts={transcripts}
      today={new Date()}
    />
  )
}
