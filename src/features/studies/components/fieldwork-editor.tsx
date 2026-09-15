'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { setFieldworkStart } from '../actions'
import { studiesCopy } from '../copy'

export function FieldworkEditor({
  studyId,
  value,
}: {
  studyId: string
  value: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        {value ?? studiesCopy.noFieldwork}
      </button>
    )
  }

  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-md border border-border bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await setFieldworkStart(studyId, draft === '' ? null : draft)
              if (!result.ok) setError(result.message ?? 'No se pudo guardar.')
              else {
                setOpen(false)
                router.refresh()
              }
            })
          }
          className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
        >
          {studiesCopy.fieldworkSave}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setDraft(value ?? '')
            setError(null)
          }}
          className="text-xs text-muted underline underline-offset-4"
        >
          {studiesCopy.fieldworkCancel}
        </button>
      </span>
      <span className="text-xs text-muted">{studiesCopy.fieldworkRecalcHint}</span>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  )
}
