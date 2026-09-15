/**
 * Aplica la política de CORS del bucket de media.
 *
 * Hace falta porque el navegador sube directo a R2 con una URL prefirmada: el
 * PUT sale del origen de la app, no del servidor, y sin esta política el
 * navegador lo bloquea antes de mandarlo. Es configuración del bucket y no del
 * código, así que vive acá para que quede a la vista y se pueda reaplicar.
 *
 *   node scripts/r2-cors.mjs          → muestra la política actual
 *   node scripts/r2-cors.mjs --apply  → la escribe
 *
 * Los orígenes se amplían con R2_CORS_ORIGINS (lista separada por comas)
 * cuando la app deje de correr solo en local.
 */
import { readFileSync } from 'node:fs'

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '')
}

const bucket = process.env.R2_BUCKET_NAME
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const origins = (process.env.R2_CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const rules = [
  {
    AllowedOrigins: origins,
    // PUT para subir, GET y HEAD para reproducir y descargar con URL firmada.
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    // El navegador manda Content-Type en el PUT; la firma lo incluye.
    AllowedHeaders: ['*'],
    // Sin ETag expuesto no hay forma de confirmar la subida desde el cliente.
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  },
]

if (process.argv.includes('--apply')) {
  await client.send(
    new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }),
  )
  console.log(`CORS aplicado en ${bucket} para: ${origins.join(', ')}`)
} else {
  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
    console.log(JSON.stringify(current.CORSRules, null, 2))
  } catch (error) {
    console.log(`Sin CORS configurado (${error.name}). Corre con --apply para escribirlo.`)
  }
}
