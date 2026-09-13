'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { blockLabel, dayLabel, sessionsCopy } from '../copy'
import {
  buildGrid,
  expectedCodes,
  isValidShape,
  isoToLocalInput,
  localInputToIso,
  missingLogistics,
  sessionsOutsideGrid,
  studyShape,
} from '../model'
import type { StudySession } from '../types'
import { generateSessions, updateSessionLogistics } from '../actions'

export function SessionsSection({
  studyId,
  sessions,
}: {
  studyId: string
  sessions: readonly StudySession[]
}) {
  const { blocksPerDay } = studyShape(sessions)
  const grid = buildGrid(sessions)
  const orphans = sessionsOutsideGrid(sessions)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">{sessionsCopy.title}</h2>

      {sessions.length === 0 ? (
        <GenerateForm studyId={studyId} />
      ) : (
        <div className="flex flex-col gap-3">
          {grid.map((row) => (
            <div key={row.day} className="flex flex-col gap-2">
              <p className="text-xs text-muted">{dayLabel(row.day)}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {row.cells.map((cell) =>
                  cell.session ? (
                    <SessionCard
                      key={cell.block}
                      session={cell.session}
                      studyId={studyId}
                      blocksPerDay={blocksPerDay}
                    />
                  ) : (
                    <div
                      key={cell.block}
                      className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted"
                    >
                      {blockLabel(cell.block, blocksPerDay)} — sin sesión
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}

          {orphans.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-warn">{sessionsCopy.outsideGrid}</p>
              <ul className="flex flex-col gap-1">
                {orphans.map((s) => (
                  <li key={s.id} className="text-sm text-muted">
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function GenerateForm({ studyId }: { studyId: string }) {
  const router = useRouter()
  const [days, setDays] = useState(3)
  const [blocks, setBlocks] = useState(2)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const codes = expectedCodes(days, blocks)
  const valid = isValidShape(days, blocks)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      setError(null)
      const result = await generateSessions(studyId, days, blocks)
      if (!result.ok) setError(result.message ?? 'No se pudieron crear las sesiones.')
      else router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm font-medium">{sessionsCopy.generateTitle}</p>
      <p className="mt-1 text-sm text-muted">{sessionsCopy.generateHint}</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">{sessionsCopy.days}</span>
          <input
            type="number"
            min={1}
            max={10}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-20 rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">{sessionsCopy.blocksPerDay}</span>
          <input
            type="number"
            min={1}
            max={6}
            value={blocks}
            onChange={(e) => setBlocks(Number(e.target.value))}
            className="w-20 rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <button
          type="submit"
          disabled={!valid || pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {pending ? sessionsCopy.generating : sessionsCopy.generate}
        </button>
      </div>

      {/* Se muestran los códigos antes de confirmar: crear una agenda de 20
          bloques por error es más fácil de lo que parece. */}
      {codes.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          {sessionsCopy.preview}: <span className="text-foreground">{codes.join(' · ')}</span>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  )
}

function SessionCard({
  session,
  studyId,
  blocksPerDay,
}: {
  session: StudySession
  studyId: string
  blocksPerDay: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const missing = missingLogistics(session)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    startTransition(async () => {
      setError(null)
      const result = await updateSessionLogistics(session.id, studyId, {
        scheduledAt: localInputToIso(String(form.get('scheduledAt') ?? '')),
        venue: String(form.get('venue') ?? '').trim() || null,
        moderatorName: String(form.get('moderatorName') ?? '').trim() || null,
      })
      if (!result.ok) setError(result.message ?? 'No se pudo guardar.')
      else {
        setEditing(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted tabular-nums">{session.code}</span>
          <span className="text-sm">
            {session.blockNumber ? blockLabel(session.blockNumber, blocksPerDay) : session.name}
          </span>
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            {sessionsCopy.edit}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
          <input
            name="scheduledAt"
            type="datetime-local"
            defaultValue={isoToLocalInput(session.scheduledAt)}
            aria-label={sessionsCopy.fieldSchedule}
            className="rounded-md border border-border bg-canvas px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <input
            name="venue"
            defaultValue={session.venue ?? ''}
            placeholder={sessionsCopy.fieldVenue}
            aria-label={sessionsCopy.fieldVenue}
            className="rounded-md border border-border bg-canvas px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <input
            name="moderatorName"
            defaultValue={session.moderatorName ?? ''}
            placeholder={sessionsCopy.fieldModerator}
            aria-label={sessionsCopy.fieldModerator}
            className="rounded-md border border-border bg-canvas px-2 py-1.5 text-xs outline-none focus:border-accent"
          />

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            >
              {pending ? sessionsCopy.saving : sessionsCopy.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setError(null)
              }}
              className="text-xs text-muted underline underline-offset-4"
            >
              {sessionsCopy.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-col gap-1 text-xs text-muted">
          <span>{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString('es-CL') : ''}</span>
          <span>
            {[session.venue, session.moderatorName].filter(Boolean).join(' · ')}
            {session.participantCount > 0 &&
              ` · ${sessionsCopy.participants(session.participantCount)}`}
          </span>
          {missing.length > 0 && (
            <span className="text-warn">
              {missing.map((m) => sessionsCopy.missing[m]).join(' · ')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
