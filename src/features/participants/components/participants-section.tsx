'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { participantsCopy, roleLabels, roleNotes, segmentLabels } from '../copy'
import {
  ROLES,
  countsInAnalysis,
  duplicateMics,
  micCoverage,
  nextFreeMic,
  parseRoster,
  summarize,
} from '../model'
import type { Participant, ParticipantRole, Segment } from '../types'
import { addParticipants, removeParticipant, updateParticipant } from '../actions'

/** Un bloque, con los micrófonos que de verdad se grabaron en él. */
export interface ParticipantBlock {
  id: string
  code: string | null
  name: string
  recordedMics: number[]
}

export function ParticipantsSection({
  studyId,
  blocks,
  participants,
}: {
  studyId: string
  blocks: readonly ParticipantBlock[]
  participants: readonly Participant[]
}) {
  const bySession = new Map<string, Participant[]>()
  for (const person of participants) {
    const list = bySession.get(person.sessionId)
    if (list) list.push(person)
    else bySession.set(person.sessionId, [person])
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-muted text-sm font-medium">{participantsCopy.title}</h2>
        <p className="text-muted mt-1 text-xs">{participantsCopy.hint}</p>
      </div>

      <div className="flex flex-col gap-2">
        {blocks.map((block) => (
          <BlockRoster
            key={block.id}
            studyId={studyId}
            block={block}
            people={bySession.get(block.id) ?? []}
          />
        ))}
      </div>
    </section>
  )
}

function BlockRoster({
  studyId,
  block,
  people,
}: {
  studyId: string
  block: ParticipantBlock
  people: readonly Participant[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)

  const { total, analyzed } = summarize(people)
  const duplicates = duplicateMics(people)
  const { unassignedMics, peopleWithoutTrack } = micCoverage(people, block.recordedMics)

  function act(operation: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      setError(null)
      const result = await operation()
      if (!result.ok) setError(result.message ?? 'No se pudo guardar.')
      else router.refresh()
    })
  }

  return (
    <div className="border-border bg-surface rounded-md border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-3">
          <span className="text-muted text-xs tabular-nums">{block.code ?? block.name}</span>
          {total > 0 && (
            <span className="text-muted text-xs">{participantsCopy.summary(total, analyzed)}</span>
          )}
        </span>
        <span className="flex items-baseline gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => setPasting((v) => !v)}
            className="text-muted hover:text-ink text-xs underline underline-offset-4 disabled:opacity-40"
          >
            {participantsCopy.paste}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(() =>
                addParticipants(studyId, block.id, [
                  { name: 'Sin nombre', micNumber: nextFreeMic(people), role: 'participant' },
                ]),
              )
            }
            className="bg-accent text-accent-ink rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {participantsCopy.add}
          </button>
        </span>
      </div>

      {pasting && (
        <PasteRoster
          existing={people}
          pending={pending}
          onCancel={() => setPasting(false)}
          onConfirm={(rows) => {
            act(() => addParticipants(studyId, block.id, rows))
            setPasting(false)
          }}
        />
      )}

      {people.length === 0 ? (
        <p className="text-muted mt-2 text-xs">{participantsCopy.empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              duplicated={person.micNumber !== null && duplicates.includes(person.micNumber)}
              pending={pending}
              onChange={(changes) => act(() => updateParticipant(studyId, person.id, changes))}
              onRemove={() => act(() => removeParticipant(studyId, person.id))}
            />
          ))}
        </ul>
      )}

      {duplicates.length > 0 && (
        <p className="text-danger mt-2 text-xs">{participantsCopy.duplicateMic(duplicates)}</p>
      )}
      {unassignedMics.length > 0 && (
        <p className="text-warn mt-2 text-xs">{participantsCopy.unassignedMics(unassignedMics)}</p>
      )}
      {peopleWithoutTrack.length > 0 && (
        <p className="text-warn mt-2 text-xs">
          {participantsCopy.withoutTrack(peopleWithoutTrack.map((p) => p.name))}
        </p>
      )}
      {error && <p className="text-danger mt-2 text-xs">{error}</p>}
    </div>
  )
}

function PersonRow({
  person,
  duplicated,
  pending,
  onChange,
  onRemove,
}: {
  person: Participant
  duplicated: boolean
  pending: boolean
  onChange: (changes: {
    name?: string
    micNumber?: number | null
    role?: ParticipantRole
    segment?: Segment | null
  }) => void
  onRemove: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        defaultValue={person.name}
        aria-label={participantsCopy.name}
        disabled={pending}
        // Al salir del campo y solo si cambió: guardar en cada tecla dispararía
        // una escritura por letra.
        onBlur={(e) => {
          const value = e.target.value.trim()
          if (value !== '' && value !== person.name) onChange({ name: value })
        }}
        className="border-border bg-canvas focus:border-accent min-w-40 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
      />

      <select
        value={person.micNumber ?? ''}
        aria-label={participantsCopy.mic}
        disabled={pending}
        onChange={(e) => onChange({ micNumber: e.target.value ? Number(e.target.value) : null })}
        className={`bg-canvas focus:border-accent rounded-md border px-2 py-1 text-xs tabular-nums outline-none ${
          duplicated ? 'border-danger text-danger' : 'border-border'
        }`}
      >
        <option value="">{participantsCopy.noMic}</option>
        {Array.from({ length: 24 }, (_, i) => i + 1).map((mic) => (
          <option key={mic} value={mic}>
            {participantsCopy.mic} {mic}
          </option>
        ))}
      </select>

      <select
        value={person.role}
        aria-label={participantsCopy.role}
        disabled={pending}
        onChange={(e) => onChange({ role: e.target.value as ParticipantRole })}
        className="border-border bg-canvas focus:border-accent rounded-md border px-2 py-1 text-xs outline-none"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>

      {/* Solo los invitados tienen segmento: el moderador no es cliente ni deja
          de serlo, y ofrecerle la opción invita a llenarla sin sentido. */}
      {person.role === 'participant' && (
        <select
          value={person.segment ?? ''}
          aria-label={participantsCopy.segment}
          disabled={pending}
          onChange={(e) => onChange({ segment: (e.target.value || null) as Segment | null })}
          className="border-border bg-canvas focus:border-accent rounded-md border px-2 py-1 text-xs outline-none"
        >
          <option value="">{participantsCopy.segment}</option>
          {(Object.keys(segmentLabels) as Segment[]).map((value) => (
            <option key={value} value={value}>
              {segmentLabels[value]}
            </option>
          ))}
        </select>
      )}

      {/* Que un rol quede fuera del análisis no debería descubrirse leyendo el
          informe: se dice en la misma fila donde se elige. */}
      {!countsInAnalysis(person.role) && (
        <span className="text-muted text-xs">{roleNotes[person.role]}</span>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={onRemove}
        className="text-muted hover:text-danger text-xs underline underline-offset-4 disabled:opacity-40"
      >
        {participantsCopy.remove}
      </button>
    </li>
  )
}

/**
 * Pegar el listado de convocatoria en vez de tipear diez nombres.
 *
 * Se muestra lo entendido antes de escribir nada: el parser adivina el
 * micrófono a partir de un número suelto, y adivinar sin mostrar es la forma
 * de meter a diez personas con el micrófono cambiado.
 */
function PasteRoster({
  existing,
  pending,
  onCancel,
  onConfirm,
}: {
  existing: readonly Participant[]
  pending: boolean
  onCancel: () => void
  onConfirm: (rows: { name: string; micNumber: number | null; role: ParticipantRole }[]) => void
}) {
  const [text, setText] = useState('')
  const rows = parseRoster(text)
  const taken = new Set(existing.map((p) => p.micNumber))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (rows.length > 0) onConfirm(rows)
  }

  return (
    <form onSubmit={submit} className="bg-canvas mt-3 flex flex-col gap-2 rounded-md p-3">
      <p className="text-muted text-xs">{participantsCopy.pasteHint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        aria-label={participantsCopy.paste}
        className="border-border bg-surface focus:border-accent rounded-md border px-2 py-1.5 text-sm outline-none"
      />

      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted text-xs">
            {participantsCopy.pastePreview} ({rows.length})
          </p>
          <ul className="flex flex-col gap-0.5">
            {rows.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span
                  className={`tabular-nums ${taken.has(row.micNumber) ? 'text-danger' : 'text-muted'}`}
                >
                  {row.micNumber === null
                    ? participantsCopy.noMic
                    : `${participantsCopy.mic} ${row.micNumber}`}
                </span>
                <span className="text-muted">{roleLabels[row.role]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || rows.length === 0}
          className="bg-accent text-accent-ink rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {pending ? participantsCopy.saving : participantsCopy.pasteConfirm}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-ink text-xs underline underline-offset-4"
        >
          {participantsCopy.cancel}
        </button>
      </div>
    </form>
  )
}
