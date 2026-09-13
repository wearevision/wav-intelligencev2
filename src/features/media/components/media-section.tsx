'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { kindLabels, mediaCopy, reasonLabels } from '../copy'
import {
  classifyKind,
  coverageByBlock,
  formatBytes,
  matchFiles,
  parseMicNumber,
  type BlockRef,
  type MediaKind,
} from '../model'
import { readDurations } from '../duration'
import { formatGap, groupRecordings, parseTimestampName, type PartInput } from '../parts'
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
  /** Cuando el archivo es una parte: de qué grabación y en qué orden. */
  recordingKey: string | null
  partNumber: number | null
  durationSeconds: number | null
  /** Aviso de la grabación a la que pertenece, ya redactado. */
  note: string | null
  /** true cuando el bloque lo eligió una persona y no el emparejador. */
  manual: boolean
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

/**
 * El aviso que acompaña a una grabación en partes.
 *
 * Un hueco se dice en palabras y no se esconde dentro del cálculo: si alguien
 * detuvo la grabadora cuatro minutos, esos cuatro minutos no existen en el
 * material y quien revisa la transcripción tiene que saberlo.
 */
function describeRecording(
  partCount: number,
  gaps: readonly { afterPart: number; seconds: number }[],
  assumedContiguous: boolean,
): string {
  const partes = `${partCount} partes`
  if (gaps.length > 0) {
    const total = gaps.reduce((sum, g) => sum + g.seconds, 0)
    const cuantos = gaps.length === 1 ? 'una pausa' : `${gaps.length} pausas`
    return `${partes} · ${cuantos} de ${formatGap(total)} sin grabar`
  }
  if (assumedContiguous) return `${partes} · sin hora de grabación, se asume continuo`
  return `${partes} · continuas`
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
  const [reading, setReading] = useState(false)
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

  /**
   * Suma los archivos a la cola, agrupando las partes de una misma grabación.
   *
   * Es asíncrono porque antes de agrupar hay que saber cuánto dura cada
   * archivo: sin la duración no se puede distinguir un corte del equipo de una
   * pausa real, y esa diferencia decide los tiempos de la transcripción.
   */
  async function enqueue(incoming: FileList | null) {
    if (!incoming?.length) return
    const list = [...incoming]

    setReading(true)
    const durations = await readDurations(list)
    setReading(false)

    const inputs: PartInput[] = list.map((file, i) => ({
      filename: file.name,
      // Muchas grabadoras ponen la hora de inicio en el nombre. Vale más que la
      // marca del archivo: copiar la carpeta reescribe la marca y no el nombre.
      startsAt: parseTimestampName(file.name),
      modifiedAt: new Date(file.lastModified),
      durationSeconds: durations[i],
    }))

    // Todo el cálculo va dentro del actualizador porque necesita la cola
    // actual: las partes de una grabación se pueden arrastrar en dos tandas, y
    // mirar solo la tanda nueva las dejaría sueltas. Es puro, así que se puede
    // recalcular sin efectos.
    setQueue((current) => {
      const pending = current.filter((i) => i.status === 'ready' || i.status === 'error')
      const { recordings } = groupRecordings([
        ...pending.map((i) => ({
          filename: i.file.name,
          startsAt: parseTimestampName(i.file.name),
          modifiedAt: new Date(i.file.lastModified),
          durationSeconds: i.durationSeconds,
        })),
        ...inputs,
      ])

      // Qué grabación y qué orden le toca a cada archivo, por nombre.
      const partOf = new Map<string, { key: string; part: number; note: string }>()
      for (const recording of recordings) {
        const note = describeRecording(
          recording.parts.length,
          recording.gaps,
          recording.assumedContiguous,
        )
        for (const part of recording.parts) {
          partOf.set(part.filename, { key: recording.key, part: part.partNumber, note })
        }
      }

      // Una grabación se empareja una sola vez y todas sus partes van al mismo
      // bloque: son la misma toma cortada, no archivos independientes. Se usa
      // el inicio de la primera parte, que es su marca menos lo que dura.
      const anchors = new Map<string, { filename: string; modifiedAt: Date | null }>()
      for (const recording of recordings) {
        const first = recording.parts[0]!
        const start =
          first.startsAt ??
          (first.modifiedAt && first.durationSeconds
            ? new Date(first.modifiedAt.getTime() - first.durationSeconds * 1000)
            : (first.modifiedAt ?? null))
        anchors.set(recording.key, { filename: first.filename, modifiedAt: start })
      }

      const matches = matchFiles(
        list.map((file, i) => {
          const belongs = partOf.get(file.name)
          const anchor = belongs ? anchors.get(belongs.key) : null
          return anchor
            ? { filename: anchor.filename, modifiedAt: anchor.modifiedAt }
            : {
                filename: file.name,
                modifiedAt: inputs[i]!.startsAt ?? inputs[i]!.modifiedAt ?? null,
              }
        }),
        blocks,
      )

      // Si una parte que ya estaba en la cola tenía bloque, ese manda para toda
      // la grabación: alguien ya lo decidió a mano.
      const chosen = new Map<string, string>()
      for (const item of pending) {
        const belongs = partOf.get(item.file.name)
        if (belongs && item.sessionId) chosen.set(belongs.key, item.sessionId)
      }

      return [
        ...current.map((item) => {
          const belongs = partOf.get(item.file.name)
          if (!belongs || item.status === 'uploading' || item.status === 'done') return item
          return {
            ...item,
            recordingKey: belongs.key,
            partNumber: belongs.part,
            note: belongs.note,
          }
        }),
        ...list.map((file, i) => {
          const match = matches[i]!
          const belongs = partOf.get(file.name) ?? null
          return {
            key: `${file.name}-${file.size}-${file.lastModified}-${current.length + i}`,
            file,
            sessionId: (belongs ? chosen.get(belongs.key) : null) ?? match.sessionId,
            // El tipo se mira del nombre real y no del ancla de la grabación.
            kind: classifyKind(file.name),
            micNumber: parseMicNumber(file.name),
            reason: reasonLabels[match.reason],
            status: 'ready' as QueueStatus,
            progress: 0,
            error: null,
            recordingKey: belongs?.key ?? null,
            partNumber: belongs?.part ?? null,
            durationSeconds: durations[i] ?? null,
            note: belongs?.note ?? null,
            manual: false,
          }
        }),
      ]
    })
  }

  function patch(key: string, changes: Partial<QueueItem>) {
    setQueue((current) => current.map((i) => (i.key === key ? { ...i, ...changes } : i)))
  }

  /** Un cambio sobre una grabación alcanza a todas sus partes a la vez. */
  function patchRecording(recordingKey: string, changes: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((i) => (i.recordingKey === recordingKey ? { ...i, ...changes } : i)),
    )
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
          recordingKey: item.recordingKey,
          partNumber: item.partNumber,
          recordedAt: new Date(item.file.lastModified).toISOString(),
          durationSeconds: item.durationSeconds,
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

  const assigned = groupQueue(queue.filter((i) => i.sessionId !== null))
  const tray = groupQueue(queue.filter((i) => i.sessionId === null))
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
        <p className="text-muted">{reading ? mediaCopy.reading : mediaCopy.drop}</p>
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
              {assigned.map((entry) =>
                entry.recordingKey === null ? (
                  <QueueRow
                    key={entry.items[0]!.key}
                    item={entry.items[0]!}
                    sessions={sessions}
                    onChange={(changes) => patch(entry.items[0]!.key, changes)}
                    onRemove={() =>
                      setQueue((c) => c.filter((i) => i.key !== entry.items[0]!.key))
                    }
                  />
                ) : (
                  <RecordingRow
                    key={entry.recordingKey}
                    recordingKey={entry.recordingKey}
                    items={entry.items}
                    sessions={sessions}
                    onChange={(changes) => patchRecording(entry.recordingKey!, changes)}
                    onRemove={() =>
                      setQueue((c) => c.filter((i) => i.recordingKey !== entry.recordingKey))
                    }
                  />
                ),
              )}
            </div>
          )}

          {tray.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-warn">{mediaCopy.tray}</p>
              <p className="text-xs text-muted">{mediaCopy.trayHint}</p>
              {tray.map((entry) =>
                entry.recordingKey === null ? (
                  <QueueRow
                    key={entry.items[0]!.key}
                    item={entry.items[0]!}
                    sessions={sessions}
                    onChange={(changes) => patch(entry.items[0]!.key, changes)}
                    onRemove={() =>
                      setQueue((c) => c.filter((i) => i.key !== entry.items[0]!.key))
                    }
                  />
                ) : (
                  <RecordingRow
                    key={entry.recordingKey}
                    recordingKey={entry.recordingKey}
                    items={entry.items}
                    sessions={sessions}
                    onChange={(changes) => patchRecording(entry.recordingKey!, changes)}
                    onRemove={() =>
                      setQueue((c) => c.filter((i) => i.recordingKey !== entry.recordingKey))
                    }
                  />
                ),
              )}
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

/**
 * Agrupa lo ya subido por grabación, en orden de parte. Devuelve solo las
 * grabaciones; los archivos enteros se pintan aparte.
 */
function groupUploaded(files: readonly MediaFile[]): [string | null, MediaFile[]][] {
  const map = new Map<string, MediaFile[]>()
  for (const file of files) {
    if (file.recordingKey === null) continue
    const list = map.get(file.recordingKey)
    if (list) list.push(file)
    else map.set(file.recordingKey, [file])
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0))
  }
  return [...map.entries()]
}

interface QueueGroup {
  recordingKey: string | null
  items: QueueItem[]
}

/**
 * Convierte la cola plana en una entrada por grabación, conservando el orden
 * de llegada. Los archivos sueltos quedan como grupos de uno con clave null.
 */
function groupQueue(items: readonly QueueItem[]): QueueGroup[] {
  const groups: QueueGroup[] = []
  const index = new Map<string, QueueGroup>()

  for (const item of items) {
    if (item.recordingKey === null) {
      groups.push({ recordingKey: null, items: [item] })
      continue
    }
    const existing = index.get(item.recordingKey)
    if (existing) {
      existing.items.push(item)
    } else {
      const group: QueueGroup = { recordingKey: item.recordingKey, items: [item] }
      index.set(item.recordingKey, group)
      groups.push(group)
    }
  }

  for (const group of groups) {
    group.items.sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0))
  }
  return groups
}

/**
 * Una grabación cortada, como una sola fila.
 *
 * El operador piensa en "el micrófono de Carolina", no en cinco archivos, así
 * que el bloque y el tipo se eligen una vez para toda la grabación. Las partes
 * quedan visibles debajo porque su orden y sus huecos importan, pero no se
 * manejan de a una.
 */
function RecordingRow({
  recordingKey,
  items,
  sessions,
  onChange,
  onRemove,
}: {
  recordingKey: string
  items: readonly QueueItem[]
  sessions: readonly SessionRef[]
  onChange: (changes: Partial<QueueItem>) => void
  onRemove: () => void
}) {
  const head = items[0]!
  const locked = items.some((i) => i.status === 'uploading' || i.status === 'done')
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)

  return (
    <div className="rounded-md border border-border bg-canvas px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-sm" title={recordingKey}>
          {recordingKey}
        </span>
        <span className="text-xs text-muted tabular-nums">{formatBytes(totalBytes)}</span>
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

      {head.note && (
        <p className={`mt-1 text-xs ${head.note.includes('sin grabar') ? 'text-warn' : 'text-muted'}`}>
          {head.note}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={head.sessionId ?? ''}
          disabled={locked}
          aria-label={mediaCopy.chooseBlock}
          onChange={(e) => onChange({ sessionId: e.target.value || null, manual: true })}
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
          value={head.kind ?? ''}
          disabled={locked}
          aria-label={mediaCopy.title}
          onChange={(e) => onChange({ kind: (e.target.value || null) as MediaKind | null })}
          className="rounded-md border border-border bg-canvas px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">{mediaCopy.unsupported}</option>
          {(Object.keys(kindLabels) as MediaKind[]).map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </select>

        {!head.manual && <span className="text-xs text-muted">{head.reason}</span>}
      </div>

      <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-3">
        {items.map((item) => (
          <li key={item.key} className="text-xs">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted tabular-nums">{item.partNumber}</span>
              <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="text-muted tabular-nums">{formatBytes(item.file.size)}</span>
            </span>
            {item.status === 'uploading' && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            )}
            {item.error && <p className="text-danger">{item.error}</p>}
          </li>
        ))}
      </ul>
    </div>
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
          onChange={(e) => onChange({ sessionId: e.target.value || null, manual: true })}
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

        {!item.manual && <span className="text-xs text-muted">{item.reason}</span>}
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
          {/* Las partes de una grabación se cuentan como una sola entrada: el
              operador piensa en "el micrófono de Carolina", no en cinco WAV. */}
          {groupUploaded(files).map(([recordingKey, parts]) =>
            recordingKey !== null ? (
              <li key={recordingKey} className="text-sm">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-xs text-muted">
                    {kindLabels[parts[0]!.kind]}
                    {parts[0]!.micNumber !== null ? ` ${parts[0]!.micNumber}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{recordingKey}</span>
                  <span className="text-xs text-muted">
                    {parts.length} {mediaCopy.partsSuffix}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {formatBytes(parts.reduce((sum, f) => sum + (f.bytes ?? 0), 0))}
                  </span>
                </span>
                <ul className="mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                  {parts.map((part) => (
                    <li key={part.id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
                      <span className="text-muted tabular-nums">{part.partNumber}</span>
                      <button
                        type="button"
                        onClick={() => open(part.id)}
                        className="min-w-0 flex-1 truncate text-left underline underline-offset-4 hover:text-accent"
                        title={part.originalFilename}
                      >
                        {part.originalFilename}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(part.id)}
                        className="text-muted underline underline-offset-4 hover:text-danger"
                      >
                        {mediaCopy.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null,
          )}
          {files.filter((f) => f.recordingKey === null).map((file) => (
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
