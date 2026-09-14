import type { NextRequest } from 'next/server'

import { json, preflight } from '@/server/api/respond'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

/**
 * Sin sesión a propósito: el escritorio la consulta para saber si el servidor
 * responde, antes de saber si la sesión sirve. Sin esta ruta marcaba "sin
 * conexión" aunque las demás contestaran.
 */
export function GET(request: NextRequest) {
  return json({ status: 'ok' }, request)
}
