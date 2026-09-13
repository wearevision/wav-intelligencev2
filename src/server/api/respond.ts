import { NextResponse } from 'next/server'

/**
 * Respuestas de API con CORS.
 *
 * La app de escritorio corre en `tauri://localhost` en producción y en
 * `http://localhost:1420` en desarrollo, así que cada respuesta necesita el
 * encabezado. Se centraliza acá para que ninguna ruta se olvide: una que lo
 * omita falla solo desde el escritorio, que es donde nadie la está mirando.
 */
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'http://localhost:1420',
])

export function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
  // Solo se refleja un origen conocido: devolver el que venga convertiría la
  // API en abierta para cualquier página que el operador tenga abierta.
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    base['Access-Control-Allow-Origin'] = origin
    base['Vary'] = 'Origin'
  }
  return base
}

export function json(body: unknown, request: Request, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(request.headers.get('origin')),
  })
}

export function fail(message: string, request: Request, status: number) {
  return json({ error: message }, request, status)
}

/** Respuesta al preflight. Sin cuerpo y sin trabajo. */
export function preflight(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  })
}
