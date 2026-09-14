'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type ChangeEvent } from 'react'

import { applyStudyFiles, previewStudyFiles, type StudyFilesPreview } from '../actions'
import { blockLabel, dayLabel } from '@/features/sessions'

import { intakeCopy } from '../copy'

function when(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Subir los archivos del estudio.
 *
 * El formulario se guarda en memoria entre la vista previa y la confirmación:
 * al aplicar se vuelve a mandar el mismo archivo y el servidor recalcula el
 * plan, en vez de confiar en lo que la pantalla muestra.
 */
export function StudyFilesSection({ studyId }: { studyId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<FormData | null>(null)
  const [preview, setPreview] = useState<StudyFilesPreview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return
    const form = new FormData()
    for (const file of picked) form.append('files', file)
    formRef.current = form
    setNotice(null)
    startTransition(async () => setPreview(await previewStudyFiles(studyId, form)))
  }

  function apply() {
    const form = formRef.current
    const fingerprint = preview?.roster?.fingerprint ?? ''
    if (!form) return
    startTransition(async () => {
      const result = await applyStudyFiles(studyId, form, fingerprint)
      if (result.ok) {
        setPreview(null)
        formRef.current = null
        setNotice(result.notice ?? intakeCopy.done)
        router.refresh()
        return
      }
      setNotice(result.message)
      if (result.preview) setPreview(result.preview)
    })
  }

  const plan = preview?.roster?.plan ?? null
  const blocksPerDay = (day: number) => plan?.blocks.filter((b) => b.dayNumber === day).length ?? 0
  const canApply =
    !!preview?.ok && preview.files.some((f) => f.message === null && f.kind !== 'unknown')

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{intakeCopy.title}</h2>
        <p className="text-muted text-xs">{intakeCopy.hint}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="bg-accent text-accent-ink rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {pending ? intakeCopy.reading : intakeCopy.choose}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setPreview(null)
              formRef.current = null
            }}
            className="text-muted hover:text-ink text-xs underline underline-offset-4"
          >
            {intakeCopy.cancel}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept=".xlsx,.xlsm,.docx"
          aria-label={intakeCopy.choose}
          onChange={onPick}
        />
      </div>

      {notice && <p className="text-muted text-xs">{notice}</p>}
      {preview && !preview.ok && <p className="text-danger text-xs">{preview.message}</p>}

      {preview?.ok && (
        <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
          <ul className="flex flex-col gap-1">
            {preview.files.map((file) => (
              <li key={file.filename} className="flex flex-wrap gap-x-3 text-xs">
                <span className="font-medium">{file.filename}</span>
                <span className="text-muted">{intakeCopy.kind[file.kind]}</span>
                {(file.message ?? intakeCopy.kindNote[file.kind]) && (
                  <span className={file.message ? 'text-warn' : 'text-muted'}>
                    {file.message ?? intakeCopy.kindNote[file.kind]}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {plan && (
            <ul className="flex flex-col gap-2">
              {plan.blocks.map((block) => (
                <li key={block.code} className="flex flex-col gap-0.5 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-muted tabular-nums">{block.code}</span>
                    <span>
                      {dayLabel(block.dayNumber)} ·{' '}
                      {blockLabel(block.blockNumber, blocksPerDay(block.dayNumber))}
                    </span>
                    <span className="text-muted">{when(block.scheduledAt)}</span>
                    {block.isNew && <span className="text-accent">{intakeCopy.newBlock}</span>}
                    {block.scheduleChanged && (
                      <span className="text-warn">{intakeCopy.movedBlock}</span>
                    )}
                    <span className="text-muted">
                      {[
                        intakeCopy.add(block.add.length),
                        intakeCopy.update(block.update.length),
                        intakeCopy.remove(block.remove.length),
                        intakeCopy.keep(block.keep),
                      ].join(' · ')}
                    </span>
                  </div>
                  {block.update.map((u) => (
                    <span key={u.id} className="text-muted pl-4">
                      {u.name}:{' '}
                      {intakeCopy.change(
                        intakeCopy.mic(u.from.micNumber),
                        intakeCopy.mic(u.to.micNumber),
                      )}
                    </span>
                  ))}
                  {block.remove.map((r) => (
                    <span key={r.id} className="text-danger pl-4">
                      − {r.name}
                      {r.verbatims > 0 ? ` (${intakeCopy.orphanVerbatims(r.verbatims)})` : ''}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {plan && plan.untouchedSessions.length > 0 && (
            <p className="text-muted text-xs">
              {intakeCopy.untouched(plan.untouchedSessions.map((s) => s.code).join(', '))}
            </p>
          )}

          {plan && plan.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {plan.warnings.map((w) => (
                <li key={w} className="text-warn text-xs">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {canApply && (
            <div>
              <button
                type="button"
                disabled={pending}
                onClick={apply}
                className="bg-accent text-accent-ink rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {pending ? intakeCopy.applying : intakeCopy.apply}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
