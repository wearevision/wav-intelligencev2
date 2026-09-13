'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { kindLabels, mediaCopy, reasonLabels } from '../copy'
import {
  coverageByBlock,
  formatBytes,
  matchFiles,
  parseMicNumber,
  type BlockRef,
  type MediaKind,
} from '../model'
import { deleteMediaFile, mediaFileUrl, presignMediaUpload, registerMediaFile } from '../actions'
import type { MediaFile } from '../types'

/** Lo que la sección necesita saber de una sesión, sin depender de su feature. */
export interface SessionRef {
  id: string
  code: string | null
  name: string
  scheduledAt: string | null
}

type QueueStatus = 'ready' | 'uploading' | 'done' | 'error'

interface QueueItem {
  key: string
  file: File
  sessionId: string | null
  kind: MediaKind | null
  micNumber: number | null
  reason: string
  status: QueueStatus
  progress: number
  error: string | null
}

/**
 * Sube el objeto con XHR y no con fetch, solo por el evento de progreso.
 *
 * Un bloque de audio son cientos de megas: sin barra, la subida parece colgada
 * y la reacción natural es recargar la página a la mitad.
 */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 respondió ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Se cortó la conexión con R2'))
    xhr.send(file)
  })
}

export function MediaSection({
  studyId,
  sessions,
  files,
}: {
  studyId: string
  sessions: readonly SessionRef[]
  files: readonly MediaFile[]
}) {
  const router = useRouter()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const blocks = useMemo<BlockRef[]>(
    () => sessions.map((s) => ({ sessionId: s.id, code: s.code, scheduledAt: s.scheduledAt })),
    [sessions],
  )
  const coverage = useMemo(() => coverageByBlock(files), [files])
  const byBlock = useMemo(() => {
    const map = new Map<string, MediaFile[]>()
    for (const f of files) {
      const list = map.get(f.sessionId)
      if (list) list.push(f)
      else map.set(f.sessionId, [f])
    }
    return map
  }, [files])

  function enqueue(incoming: FileList | null) {
    if (!incoming?.length) return
    const list = [...incoming]
    const matches = matchFiles(
      list.map((f) => ({ filename: f.name, modifiedAt: new Date(f.lastModified) })),
      blocks,
    )

    setQueue((current) => [
      ...current,
      ...list.map((file, i) => {
        const match = matches[i]!
        return {
          key: `${file.name}-${file.size}-${file.lastModified}-${current.length + i}`,
          file,
          sessionId: match.sessionId,
          kind: match.kind,
          micNumber: match.micNumber,
          reason: reasonLabels[match.reason],
          status: 'ready' as QueueStatus,
          progress: 0,
          error: null,
        }
      }),
    ])
  }

  function patch(key: string, changes: Partial<QueueItem>) {
    setQueue((current) => current.map((i) => (i.key === key ? { ...i, ...changes } : i)))
  }

  async function uploadAll() {
    const ready = queue.filter((i) => i.status === 'ready' && i.sessionId && i.kind)
    if (ready.length === 0) return

    setBusy(true)
    // De a uno: varias subidas de cientos de megas en paralelo se pelean el
    // ancho de banda y todas terminan más tarde que si van en fila.
    for (const item of ready) {
      patch(item.key, { status: 'uploading', progress: 0, error: null })
      try {
        const presigned = await presignMediaUpload(studyId, {
          sessionId: item.sessionId,
          filename: item.file.name,
          kind: item.kind,
          micNumber: item.micNumber,
          contentType: item.file.type || null,
          bytes: item.file.size,
        })
        if (!presigned.ok || !presigned.url || !presigned.storageKey) {
          throw new Error(presigned.message ?? 'No se pudo prefirmar la subida')
        }

        await putWithProgress(presigned.url, item.file, (fraction) =>
          patch(item.key, { progress: fraction }),
        )

        const registered = await registerMediaFile(studyId, {
          sessionId: item.sessionId,
          storageKey: presigned.storageKey,
          filename: item.file.name,
          kind: item.kind,
          micNumber: item.micNumber,
          bytes: item.file.size,
        })
        if (!registered.ok) throw new Error(registered.message ?? 'No se pudo registrar')

        patch(item.key, { status: 'done', progress: 1 })
      } catch (error) {
        patch(item.key, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Error desconocido',
        })
      }
    }
    setBusy(false)
    setQueue((current) => current.filter((i) => i.status !== 'done'))
    router.refresh()
  }

  const assigned = queue.filter((i) => i.sessionId !== null)
  const tray = queue.filter((i) => i.sessionId === null)
  const uploadable = queue.some((i) => i.status === 'ready' && i.sessionId && i.kind)

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-muted">{mediaCopy.title}</h2>
        <p className="mt-1 text-xs text-muted">{mediaCopy.hint}</p>
      </div>

      <div
        onDragOver={(e: DragEvent) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          setDragging(false)
          enqueue(e.dataTransfer.files)
        }}
        className={`rounded-lg border border-dashed px-4 py-6 text-center text-sm ${
          dragging ? 'border-accent bg-surface' : 'border-border'
        }`}
      >
        <p className="text-muted">{mediaCopy.drop}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          {mediaCopy.browse}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label={mediaCopy.drop}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            enqueue(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          {assigned.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">{mediaCopy.pending}</p>
              {assigned.map((item) => (
                <QueueRow
                  key={item.key}
                  item={item}
                  sessions={sessions}
                  onChange={(changes) => patch(item.key, changes)}
                  onRemove={() => setQueue((c) => c.filter((i) => i.key !== item.key))}
                />
              ))}
            </div>
          )}

          {tray.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-warn">{mediaCopy.tray}</p>
              <p className="text-xs text-muted">{mediaCopy.trayHint}</p>
              {tray.map((item) => (
                <QueueRow
                  key={item.key}
                  item={item}
                  sessions={sessions}
                  onChange={(changes) => patch(item.key, changes)}
                  onRemove={() => setQueue((c) => c.filter((i) => i.key !== item.key))}
                />
              ))}
            </div>
          )}

          <div>
            <button
              type="button"
              disabled={!uploadable || busy}
              onClick={uploadAll}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              {busy ? mediaCopy.uploading : mediaCopy.upload}
            </button>
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <BlockMedia
              key={session.id}
              studyId={studyId}
              session={session}
              files={byBlock.get(session.id) ?? []}
              hasAudio={coverage.get(session.id)?.hasAudio ?? false}
              hasVideo={coverage.get(session.id)?.hasVideo ?? false}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function QueueRow({
  item,
  sessions,
  onChange,
  onRemove,
}: {
  item: QueueItem
  sessions: readonly SessionRef[]
  onChange: (changes: Partial<QueueItem>) => void
  onRemove: () => void
}) {
  const locked = item.status === 'uploading' || item.status === 'done'

  return (
    <div className="rounded-md border border-border bg-canvas px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-sm" title={item.file.name}>
          {item.file.name}
        </span>
        <span className="text-xs text-muted tabular-nums">{formatBytes(item.file.size)}</span>
        {!locked && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            {mediaCopy.discard}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={item.sessionId ?? ''}
          disabled={locked}
          aria-label={mediaCopy.chooseBlock}
          onChange={(e) => onChange({ sessionId: e.target.value || null })}
          className="rounded-md border border-border bg-canvas px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">{mediaCopy.chooseBlock}</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ?? s.name}
            </option>
          ))}
        </select>

        <select
          value={item.kind ?? ''}
          disabled={locked}
          aria-label={mediaCopy.title}
          onChange={(e) => {
            const kind = (e.target.value || null) as MediaKind | null
            onChange({
              kind,
              micNumber: kind === 'audio_mic' ? parseMicNumber(item.file.name) : null,
            })
          }}
          className="rounded-md border border-border bg-canvas px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">{mediaCopy.unsupported}</option>
          {(Object.keys(kindLabels) as MediaKind[]).map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </select>

        {item.kind === 'audio_mic' && (
          <span className="text-xs text-muted">
            {item.micNumber !== null ? `Mic ${item.micNumber}` : 'Sin número de mic'}
          </span>
        )}

        <span className="text-xs text-muted">{item.reason}</span>
      </div>

      {item.status === 'uploading' && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${Math.round(item.progress * 100)}%` }}
          />
        </div>
      )}

      {item.error && <p className="mt-2 text-xs text-danger">{item.error}</p>}
    </div>
  )
}

function BlockMedia({
  studyId,
  session,
  files,
  hasAudio,
  hasVideo,
}: {
  studyId: string
  session: SessionRef
  files: readonly MediaFile[]
  hasAudio: boolean
  hasVideo: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function open(id: string) {
    setError(null)
    const result = await mediaFileUrl(studyId, id)
    if (result.ok && result.url) window.open(result.url, '_blank', 'noopener')
    else setError(result.message ?? 'No se pudo abrir el archivo.')
  }

  async function remove(id: string) {
    setError(null)
    const result = await deleteMediaFile(studyId, id)
    if (!result.ok) setError(result.message ?? 'No se pudo borrar el archivo.')
    else router.refresh()
  }

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-muted tabular-nums">{session.code ?? session.name}</span>
        {!hasAudio && <span className="text-xs text-warn">{mediaCopy.noAudio}</span>}
        {!hasVideo && <span className="text-xs text-muted">{mediaCopy.noVideo}</span>}
      </div>

      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{mediaCopy.empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-xs text-muted">
                {kindLabels[file.kind]}
                {file.micNumber !== null ? ` ${file.micNumber}` : ''}
              </span>
              <button
                type="button"
                onClick={() => open(file.id)}
                className="min-w-0 flex-1 truncate text-left underline underline-offset-4 hover:text-accent"
                title={file.originalFilename}
              >
                {file.originalFilename}
              </button>
              <span className="text-xs text-muted tabular-nums">{formatBytes(file.bytes)}</span>
              <button
                type="button"
                onClick={() => remove(file.id)}
                className="text-xs text-muted underline underline-offset-4 hover:text-danger"
              >
                {mediaCopy.remove}
              </button>
              {file.sourcePath && (
                <span className="w-full text-xs text-muted">
                  {mediaCopy.master} {file.sourceHost ? `${file.sourceHost}: ` : ''}
                  {file.sourcePath}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
