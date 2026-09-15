import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { fail, json, preflight } from '@/server/api/respond'
import { isStudyScopedKey } from '@/server/storage/keys'
import { storage } from '@/server/storage/r2'
import { requireUser } from '@/server/supabase/request'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

/**
 * Subida por partes: iniciar, firmar cada parte, completar o abortar.
 *
 * Las cuatro operaciones viven en una sola ruta con un campo `op` porque son
 * una sola conversación sobre un mismo objeto y comparten toda la validación.
 * Cuatro archivos repetirían el control de la clave, que es lo único delicado
 * de acá.
 *
 * Un PUT prefirmado alcanza para casi todo el material, pero una subida de una
 * pieza que se corta al 90 % empieza de cero: en terreno, con un archivo de
 * cuatro gigas, eso es media hora perdida. Por partes se retoma.
 */

const KEY = z.string().trim().min(1).max(1024)
const UPLOAD_ID = z.string().trim().min(1).max(500)

const initiateSchema = z.object({
  op: z.literal('initiate'),
  studyId: z.uuid(),
  key: KEY,
  contentType: z.string().trim().max(200).nullish(),
})

const presignPartSchema = z.object({
  op: z.literal('presign-part'),
  studyId: z.uuid(),
  key: KEY,
  uploadId: UPLOAD_ID,
  // S3 admite hasta 10 000 partes; más allá no es un archivo grande sino un
  // error de cálculo del cliente.
  partNumber: z.number().int().min(1).max(10_000),
})

const completeSchema = z.object({
  op: z.literal('complete'),
  studyId: z.uuid(),
  key: KEY,
  uploadId: UPLOAD_ID,
  parts: z
    .array(
      z.object({
        // El cliente de escritorio los manda en PascalCase, como los nombra S3.
        PartNumber: z.number().int().min(1).max(10_000),
        ETag: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(10_000),
})

const abortSchema = z.object({
  op: z.literal('abort'),
  studyId: z.uuid(),
  key: KEY,
  uploadId: UPLOAD_ID,
})

const bodySchema = z.discriminatedUnion('op', [
  initiateSchema,
  presignPartSchema,
  completeSchema,
  abortSchema,
])

export async function POST(request: NextRequest) {
  const { user } = await requireUser(request)
  if (!user) return fail('No autenticado.', request, 401)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail('El cuerpo no es JSON válido.', request, 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return fail(`Pedido inválido: ${parsed.error.issues[0]?.message ?? 'sin detalle'}`, request, 400)
  }

  const body = parsed.data

  // La app devuelve la clave que este servidor le dio —las tres llamadas tienen
  // que hablar del mismo objeto—, así que se comprueba antes de firmar nada.
  // Sin esto, cualquier sesión válida podría escribir en cualquier parte del
  // bucket, y la regla es que la app no elige dónde se escribe.
  if (!isStudyScopedKey(body.key, body.studyId)) {
    return fail('La clave no corresponde a este estudio.', request, 403)
  }

  try {
    switch (body.op) {
      case 'initiate': {
        const uploadId = await storage.createMultipart(body.key, body.contentType ?? undefined)
        // `upload_id` y no `uploadId`: es lo que espera el cliente de Rust.
        return json({ upload_id: uploadId, uploadId }, request)
      }

      case 'presign-part': {
        const url = await storage.presignPart(body.key, body.uploadId, body.partNumber)
        return json({ url }, request)
      }

      case 'complete': {
        await storage.completeMultipart(
          body.key,
          body.uploadId,
          body.parts.map((part) => ({ partNumber: part.PartNumber, etag: part.ETag })),
        )
        return json({ storageKey: body.key }, request)
      }

      case 'abort': {
        await storage.abortMultipart(body.key, body.uploadId)
        // Abortar es de limpieza: quien llama ya está manejando un fallo y no
        // puede hacer nada con un error de acá.
        return json({ aborted: true }, request)
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'sin detalle'
    return fail(`R2 rechazó la operación: ${detail}`, request, 502)
  }
}
