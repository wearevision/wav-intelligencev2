import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { env } from '@/env'

import type { Database } from '@/lib/supabase/database.types'

/** Cliente de Supabase para server components, route handlers y server actions. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Escribir cookies desde un server component lanza. El refresco de
            // sesión ya ocurrió en el proxy, así que acá se puede ignorar.
          }
        },
      },
    },
  )
}
