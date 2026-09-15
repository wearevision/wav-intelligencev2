'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { advanceStage } from '../actions'
import { studiesCopy } from '../copy'

export function AdvanceButton({
  stageId,
  studyId,
  disabled,
}: {
  stageId: string
  studyId: string
  disabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await advanceStage(stageId, studyId)
            if (!result.ok) setError(result.message ?? 'No se pudo cerrar la etapa.')
            else router.refresh()
          })
        }
        className="self-start rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
      >
        {pending ? studiesCopy.advancing : studiesCopy.advance}
      </button>
      {/* La base es la autoridad de la compuerta: si rechaza, se muestra su razón. */}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  )
}
