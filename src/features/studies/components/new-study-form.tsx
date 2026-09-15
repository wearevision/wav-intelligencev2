'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { createStudy } from '../actions'
import { studiesCopy } from '../copy'

export function NewStudyForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    startTransition(async () => {
      setError(null)
      const result = await createStudy({
        name: String(form.get('name') ?? ''),
        clientName: String(form.get('clientName') ?? '') || undefined,
        fieldworkStart: String(form.get('fieldworkStart') ?? '') || undefined,
      })
      if (!result.ok) setError(result.message ?? 'No se pudo crear el estudio.')
      else if (result.studyId) router.push(`/studies/${result.studyId}`)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink"
      >
        {studiesCopy.newStudy}
      </button>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-lg border border-border bg-surface p-5 sm:w-96"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{studiesCopy.fieldName}</span>
          <input
            name="name"
            required
            autoFocus
            className="rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{studiesCopy.fieldClient}</span>
          <input
            name="clientName"
            className="rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{studiesCopy.fieldFieldwork}</span>
          <input
            name="fieldworkStart"
            type="date"
            className="rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs text-muted">{studiesCopy.fieldworkHint}</span>
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-60"
        >
          {pending ? studiesCopy.creating : studiesCopy.create}
        </button>
      </div>
    </form>
  )
}
