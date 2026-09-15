'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { attachStageFile, detachStageFile, stageFileUrl } from '../actions'
import { studiesCopy } from '../copy'
import type { StudyStageFile } from '../types'

export function StageFileRow({
  file,
  stageId,
  studyId,
}: {
  file: StudyStageFile
  stageId: string
  studyId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    data.set('fileId', file.id)
    data.set('stageId', stageId)
    data.set('studyId', studyId)

    startTransition(async () => {
      setError(null)
      const result = await attachStageFile(data)
      if (!result.ok) setError(result.message ?? 'No se pudo adjuntar.')
      else router.refresh()
    })
  }

  function onOpen() {
    startTransition(async () => {
      setError(null)
      const result = await stageFileUrl(file.id)
      if (!result.ok || !result.url) setError(result.message ?? 'No se pudo abrir.')
      else window.open(result.url, '_blank', 'noopener')
    })
  }

  function onRemove() {
    startTransition(async () => {
      setError(null)
      const result = await detachStageFile(file.id, studyId)
      if (!result.ok) setError(result.message ?? 'No se pudo quitar.')
      else router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-1.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm">{file.label}</span>

        {file.storageKey ? (
          <>
            <span className="text-xs text-muted">{file.filename}</span>
            <button
              type="button"
              onClick={onOpen}
              disabled={pending}
              className="text-xs text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
              {studiesCopy.openFile}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="text-xs text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
            >
              {studiesCopy.removeFile}
            </button>
          </>
        ) : (
          <form onSubmit={onUpload} className="flex items-center gap-2">
            <input
              type="file"
              name="file"
              required
              disabled={pending}
              aria-label={file.label}
              className="max-w-56 text-xs text-muted file:mr-2 file:rounded file:border file:border-border file:bg-sunken file:px-2 file:py-1 file:text-xs file:text-ink"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            >
              {pending ? studiesCopy.attaching : studiesCopy.attach}
            </button>
          </form>
        )}
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </li>
  )
}
