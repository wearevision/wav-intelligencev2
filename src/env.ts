import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

// Next inlina las NEXT_PUBLIC_* en tiempo de build, así que hay que nombrarlas
// literalmente: un process.env[nombre] dinámico no se reemplaza y llega undefined.
const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})

if (!parsed.success) {
  // Falla al arrancar nombrando la variable, en vez de en el primer request
  // que la toque con un error que no dice nada (D10).
  throw new Error(
    'Variables de entorno inválidas:\n' +
      parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n'),
  )
}

export const env = parsed.data
