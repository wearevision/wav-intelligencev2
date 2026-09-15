'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { setTaskDone } from '../actions'
import { studiesCopy } from '../copy'
import type { StudyTask } from '../types'

export function TaskToggle({ task, studyId }: { task: StudyTask; studyId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const done = task.doneAt !== null

  return (
    <label className="flex items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={() =>
          startTransition(async () => {
            await setTaskDone(task.id, !done, studyId)
            router.refresh()
          })
        }
        className="mt-0.5 size-4 accent-[var(--color-accent)]"
      />
      <span className={done ? 'text-sm text-muted line-through' : 'text-sm'}>
        {task.name}
        {task.isBlocking && !done ? (
          <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-xs text-warn">
            {studiesCopy.blocking}
          </span>
        ) : null}
      </span>
    </label>
  )
}
