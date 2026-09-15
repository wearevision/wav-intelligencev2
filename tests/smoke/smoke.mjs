// Smoke de humo real contra un servidor corriendo.
//
//   npm run dev            (en otra terminal)
//   node tests/smoke/smoke.mjs
//
// Cubre lo que no depende de la base: guard de sesión, login, y las vistas
// renderizadas con datos de prueba. El camino con datos vivos (crear estudio,
// adjuntar archivo, avanzar etapa) se prueba a mano contra Supabase.
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM // opcional: navegador ya instalado

const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

const browser = await chromium.launch({
  ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
  args: ['--no-sandbox'],
})

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))

// 1 · El guard manda a login y recuerda a dónde iba
for (const path of ['/', '/studies', '/studies/abc']) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  const url = new URL(page.url())
  check(
    `guard: ${path} exige sesión`,
    url.pathname === '/login' && res.status() < 400,
    `terminó en ${url.pathname}${url.search}`,
  )
}
check(
  'guard: conserva el destino en ?next',
  new URL(page.url()).searchParams.get('next') === '/studies/abc',
)

// 2 · Login usable
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
check('login: campo de correo', (await page.locator('input[type=email]').count()) === 1)
check('login: campo de contraseña', (await page.locator('input[type=password]').count()) === 1)
check('login: botón de envío', (await page.locator('button[type=submit]').count()) === 1)
check('login: alterna a crear cuenta', (await page.getByText('Crear cuenta').count()) > 0)

// 3 · Torre de control con datos de prueba
await page.goto(`${BASE}/preview`, { waitUntil: 'networkidle' })
check('torre: título', (await page.getByRole('heading', { name: 'Hoy' }).count()) === 1)
const alertLinks = await page.locator('section:has-text("Requiere tu atención") a').count()
check('torre: muestra las 4 alertas sembradas', alertLinks === 4, `vio ${alertLinks}`)
check(
  'torre: hay una alerta crítica en rojo',
  (await page.locator('.text-danger').count()) >= 1,
)
check(
  'torre: avisa el estudio sin fecha de terreno',
  (await page.getByText('Sin fecha de terreno').count()) >= 1,
)
const bars = await page.locator('[role=progressbar]').count()
check('torre: una barra de avance por estudio', bars === 3, `vio ${bars}`)

// 4 · Detalle de estudio
await page.goto(`${BASE}/preview/estudio`, { waitUntil: 'networkidle' })
const stages = await page.locator('ol > li').count()
check('detalle: lista las 10 etapas', stages === 10, `vio ${stages}`)
check('detalle: panel de etapa actual', (await page.getByText('Etapa actual').count()) >= 1)
check('detalle: permite adjuntar', (await page.locator('input[type=file]').count()) >= 1)
const advance = page.getByRole('button', { name: /Cerrar etapa y avanzar/ })
check('detalle: botón de avanzar presente', (await advance.count()) === 1)
check(
  'detalle: avanzar está bloqueado con pendientes',
  await advance.first().isDisabled(),
)
check(
  'detalle: enumera lo que falta para cerrar',
  (await page.getByText('Falta para cerrar').count()) === 1,
)

// 5 · Sin errores de consola en ninguna vista
check('sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

// 6 · No se desborda horizontalmente en pantalla angosta
const narrow = await browser.newContext({ viewport: { width: 390, height: 850 } })
const np = await narrow.newPage()
for (const path of ['/login', '/preview', '/preview/estudio']) {
  await np.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const overflow = await np.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  check(`390px: ${path} no se desborda`, !overflow)
}

await browser.close()

const failed = results.filter((r) => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? '  ok  ' : ' FALLA'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} pasaron`)
process.exit(failed.length === 0 ? 0 : 1)
