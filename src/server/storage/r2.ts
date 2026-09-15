import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Adaptador de R2 detrás de un puerto único (D15).
 *
 * La configuración se valida al usarse y no al importarse, a diferencia del
 * resto del entorno (D10): la app tiene que poder compilar y correr sus fases
 * anteriores sin credenciales de R2. El error nombra las variables que faltan.
 */
export interface StoragePort {
  presignPut(key: string, contentType?: string, expiresInSeconds?: number): Promise<string>
  presignGet(key: string, expiresInSeconds?: number): Promise<string>
  exists(key: string): Promise<boolean>
  remove(key: string): Promise<void>
  /** Escritura desde el servidor. Solo para objetos chicos, como los artifacts. */
  put(key: string, body: string | Uint8Array, contentType?: string): Promise<void>
  /** Lectura desde el servidor. Igual: chicos. El media pesado no pasa por acá. */
  getText(key: string): Promise<string>

  /**
   * Subida por partes, para lo que no cabe en un PUT.
   *
   * Un PUT prefirmado admite hasta 5 GiB, pero el tamaño no es el único
   * motivo: una subida de una sola pieza que se corta al 90 % empieza de cero,
   * y en terreno eso puede ser media hora de vuelta a empezar. Por partes se
   * reanuda desde la última que llegó.
   */
  createMultipart(key: string, contentType?: string): Promise<string>
  presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string>
  completeMultipart(key: string, uploadId: string, parts: readonly UploadedPart[]): Promise<void>
  abortMultipart(key: string, uploadId: string): Promise<void>
}

export interface UploadedPart {
  partNumber: number
  /** El ETag que devolvió R2 al recibir la parte. */
  etag: string
}

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

function readConfig(): R2Config {
  const raw = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  }

  const missing = Object.entries(raw)
    .filter(([, v]) => !v)
    .map(([k]) => k)

  if (missing.length > 0) {
    // Next lee el entorno al arrancar, así que la causa más común no es que
    // falten en el archivo sino que el servidor siga corriendo con el de antes.
    throw new Error(
      `Falta configurar R2 en .env.local: ${missing.join(', ')}. ` +
        'Si ya las agregaste, reinicia el servidor de desarrollo.',
    )
  }

  return {
    accountId: raw.R2_ACCOUNT_ID as string,
    accessKeyId: raw.R2_ACCESS_KEY_ID as string,
    secretAccessKey: raw.R2_SECRET_ACCESS_KEY as string,
    bucket: raw.R2_BUCKET_NAME as string,
  }
}

let cached: { client: S3Client; bucket: string } | null = null

function connect(): { client: S3Client; bucket: string } {
  if (cached) return cached
  const config = readConfig()

  cached = {
    bucket: config.bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  }
  return cached
}

export const storage: StoragePort = {
  async presignPut(key, contentType, expiresInSeconds = 3600) {
    const { client, bucket } = connect()
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    )
  },

  async presignGet(key, expiresInSeconds = 300) {
    const { client, bucket } = connect()
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    })
  },

  async exists(key) {
    const { client, bucket } = connect()
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return true
    } catch {
      return false
    }
  },

  async remove(key) {
    const { client, bucket } = connect()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  },

  async put(key, body, contentType) {
    const { client, bucket } = connect()
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    )
  },

  async getText(key) {
    const { client, bucket } = connect()
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.Body) throw new Error(`El objeto ${key} llegó vacío`)
    return result.Body.transformToString()
  },

  async createMultipart(key, contentType) {
    const { client, bucket } = connect()
    const result = await client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    )
    if (!result.UploadId) throw new Error(`R2 no devolvió un uploadId para ${key}`)
    return result.UploadId
  },

  async presignPart(key, uploadId, partNumber, expiresInSeconds = 3600) {
    const { client, bucket } = connect()
    return getSignedUrl(
      client,
      new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: expiresInSeconds },
    )
  },

  async completeMultipart(key, uploadId, parts) {
    const { client, bucket } = connect()
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          // R2 exige las partes en orden ascendente; mandarlas desordenadas
          // ensambla el archivo mal o falla, según el caso.
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    )
  },

  async abortMultipart(key, uploadId) {
    const { client, bucket } = connect()
    await client.send(
      new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
    )
  },
}
