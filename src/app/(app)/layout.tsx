import Link from 'next/link'

import { studiesCopy } from '@/features/studies'
import { signOut } from '@/server/auth/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/studies" className="text-sm font-medium tracking-tight">
            WAV Intelligence
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted hover:text-ink">
              {studiesCopy.signOut}
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
