import { notFound } from 'next/navigation'

import { listStudySessions } from '@/features/sessions/server'
import { TranscriptView } from '@/features/transcripts/components/transcript-view'
import { listBlockVerbatims } from '@/features/transcripts/server'

export default async function BlockTranscriptPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params

  // Se piden las sesiones del estudio y se busca la del bloque: así se
  // comprueba que pertenece a este estudio y se obtiene su etiqueta de una vez.
  const [sessions, verbatims] = await Promise.all([
    listStudySessions(id),
    listBlockVerbatims(sessionId),
  ])

  const block = sessions.find((s) => s.id === sessionId)
  if (!block) notFound()

  return (
    <TranscriptView
      studyId={id}
      blockLabel={block.code ?? block.name}
      verbatims={verbatims}
    />
  )
}
