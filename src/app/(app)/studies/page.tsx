import Link from 'next/link'

import { studiesCopy } from '@/features/studies'
import { NewStudyForm } from '@/features/studies/components/new-study-form'
import { listStudies } from '@/features/studies/server'

export default async function StudiesPage() {
  const studies = await listStudies()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <h1 className="text-2xl font-medium tracking-tight">{studiesCopy.listTitle}</h1>
        <NewStudyForm />
      </div>

      {studies.length === 0 ? (
        <p className="text-sm text-muted">{studiesCopy.listEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {studies.map((study) => (
            <li key={study.id}>
              <Link
                href={`/studies/${study.id}`}
                className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="font-medium">{study.name}</span>
                  <span className="text-sm text-muted">
                    {study.clientName ?? ''}
                    {study.clientName && study.fieldworkStart ? ' · ' : ''}
                    {study.fieldworkStart ?? studiesCopy.noFieldwork}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-sm text-muted">
                  <span>
                    {study.currentStageName
                      ? `${studiesCopy.currentStage}: ${study.currentStageName}`
                      : studiesCopy.finished}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {study.doneStages}/{study.totalStages}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
