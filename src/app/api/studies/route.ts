import type { NextRequest } from 'next/server'

import { fail, json, preflight } from '@/server/api/respond'
import { requireUser } from '@/server/supabase/request'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

/** Los estudios activos, para que el escritorio sepa sobre cuál trabajar. */
export async function GET(request: NextRequest) {
  const { supabase, user } = await requireUser(request)
  if (!user) return fail('Sesión inválida o vencida.', request, 401)

  const { data, error } = await supabase
    .from('studies')
    .select('id, name, client_name, fieldwork_start, status')
    .eq('status', 'active')
    .order('fieldwork_start', { ascending: true, nullsFirst: false })

  if (error) return fail(error.message, request, 500)

  return json(
    {
      studies: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        clientName: row.client_name,
        fieldworkStart: row.fieldwork_start,
      })),
    },
    request,
  )
}
