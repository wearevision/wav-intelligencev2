import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

import { env } from '@/env'

import type { Database } from '@/lib/supabase/database.types'

/**
 * Cliente para las rutas de API que consume WAV Ingest.
 *
 * El escritorio no tiene cookies: manda `Authorization: Bearer <access_token>`
 * de su sesión de Supabase. Se acepta también la cookie para poder probar una
 * ruta desde el navegador ya iniciado, sin montar un segundo camino de auth.
 *
 * No escribe cookies: una ruta de API no debería estar refrescando la sesión
 * del navegador de nadie como efecto secundario.
 */
export function createClientFromRequest(request: NextRequest) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => undefined,
      },
    },
  )
}

/**
 * El usuario detrás del pedido, o null.
 *
 * `getUser()` y no `getSession()`: valida el token contra el servidor de auth
 * en vez de creerle a lo que vino en el encabezado.
 */
export async function requireUser(request: NextRequest) {
  const supabase = createClientFromRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}
