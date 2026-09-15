'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/browser'

const copy = {
  title: 'WAV Intelligence',
  subtitle: 'Administra y guía tus estudios.',
  email: 'Correo',
  password: 'Contraseña',
  signIn: 'Entrar',
  signUp: 'Crear cuenta',
  working: 'Un momento…',
  toSignUp: '¿Primera vez? Crear cuenta',
  toSignIn: '¿Ya tienes cuenta? Entrar',
  checkEmail: 'Cuenta creada. Si Supabase pide confirmación, revisa tu correo.',
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const supabase = createClient()
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setBusy(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (mode === 'signUp' && !result.data.session) {
      setNotice(copy.checkEmail)
      return
    }

    router.push('/studies')
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted">{copy.subtitle}</p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{copy.email}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{copy.password}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-60"
          >
            {busy ? copy.working : mode === 'signIn' ? copy.signIn : copy.signUp}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
            setError(null)
            setNotice(null)
          }}
          className="mt-6 text-sm text-muted underline underline-offset-4"
        >
          {mode === 'signIn' ? copy.toSignUp : copy.toSignIn}
        </button>
      </div>
    </main>
  )
}
