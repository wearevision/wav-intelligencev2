/**
 * Dice qué ve la app en .env.local, sin mostrar los secretos.
 *
 * Cuando una variable "está puesta" y la app insiste en que falta, la causa casi
 * nunca es la variable: es el archivo. Un salto de línea que no estaba y pegó
 * dos claves en una, comillas de más, espacios alrededor del `=`, o el archivo
 * escrito en otra carpeta. Este script mira esas cosas.
 *
 *   node scripts/check-env.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RUTA = resolve(process.cwd(), '.env.local')

const ESPERADAS = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase'],
  ['R2_ACCOUNT_ID', 'R2'],
  ['R2_ACCESS_KEY_ID', 'R2'],
  ['R2_SECRET_ACCESS_KEY', 'R2'],
  ['R2_BUCKET_NAME', 'R2'],
]

if (!existsSync(RUTA)) {
  console.error(`No existe ${RUTA}`)
  console.error('Estás en la carpeta equivocada, o el archivo nunca se creó.')
  process.exit(1)
}

const bruto = readFileSync(RUTA, 'utf8')
console.log(`Archivo: ${RUTA}`)
console.log(`Líneas: ${bruto.split('\n').length} · ${bruto.length} caracteres\n`)

const problemas = []
if (bruto.includes('\r')) problemas.push('El archivo tiene saltos de línea de Windows (CRLF).')

const encontradas = new Map()
bruto.split('\n').forEach((linea, i) => {
  const limpia = linea.trim()
  if (limpia === '' || limpia.startsWith('#')) return

  const igual = limpia.indexOf('=')
  if (igual === -1) {
    problemas.push(`Línea ${i + 1}: no tiene "=" y no es un comentario.`)
    return
  }

  const clave = limpia.slice(0, igual)
  const valor = limpia.slice(igual + 1)

  // Dos claves pegadas: pasa cuando el archivo no terminaba en salto de línea
  // y se le agregó texto al final con `cat >>`.
  for (const [esperada] of ESPERADAS) {
    if (valor.includes(`${esperada}=`)) {
      problemas.push(`Línea ${i + 1}: «${esperada}» quedó pegada al final de «${clave}». Faltó un salto de línea.`)
    }
  }
  if (clave !== clave.trim()) problemas.push(`Línea ${i + 1}: la clave tiene espacios alrededor.`)
  if (/^["'].*["']$/.test(valor)) problemas.push(`Línea ${i + 1}: «${clave}» tiene comillas; sobran.`)

  encontradas.set(clave.trim(), valor)
})

let faltan = 0
for (const [clave, grupo] of ESPERADAS) {
  const valor = encontradas.get(clave)
  if (valor === undefined || valor === '') {
    console.log(`  ✗ ${clave.padEnd(30)} ausente        (${grupo})`)
    faltan++
  } else {
    console.log(`  ✓ ${clave.padEnd(30)} ${String(valor.length).padStart(3)} caracteres (${grupo})`)
  }
}

const extras = [...encontradas.keys()].filter((k) => !ESPERADAS.some(([e]) => e === k))
if (extras.length > 0) console.log(`\nOtras variables presentes: ${extras.join(', ')}`)

if (problemas.length > 0) {
  console.log('\nProblemas de formato:')
  for (const p of problemas) console.log(`  · ${p}`)
}

console.log(
  faltan === 0 && problemas.length === 0
    ? '\nTodo en orden. Si la app igual dice que falta, es que el servidor sigue con el entorno viejo: reinícialo.'
    : `\n${faltan === 1 ? 'Falta 1 variable' : `Faltan ${faltan} variables`}.`,
)
process.exit(faltan === 0 && problemas.length === 0 ? 0 : 1)
